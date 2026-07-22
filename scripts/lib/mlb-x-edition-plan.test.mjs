/**
 * mlb-x-edition-plan.test.mjs
 * Run via: node --test scripts/lib/mlb-x-edition-plan.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEditionPlans,
  buildSelectedLineupStatus,
  planFileName,
  PLAN_VERSION,
  PlanRejection,
  toWorkflowOutputs,
  validatePlan,
  writePlansAtomically,
} from "./mlb-x-edition-plan.mjs";
import { Decision, ReadinessStatus } from "./mlb-x-edition-readiness.mjs";
import { ReceiptOutcome } from "./mlb-x-edition-receipts.mjs";
import { selectConfirmedHrProps } from "./mlb-hr-x-selection-core.mjs";

const SLATE = "2026-07-21";
const FIRST_PITCH = "2026-07-21T22:40:00Z";
const MORNING_NOW = "2026-07-21T14:00:00Z"; // 10:00 ET

const FIXTURE = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "mlb-x-hr-lineup-2026-07-21.json"), "utf8"),
);

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-x-plan-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const kRow = (player, gameId, confirmed) => ({ pitcher: player, player, gameId, _confirmed: confirmed });
const hrRow = (player, gameId, confirmed) => ({ player, gameId, _confirmed: confirmed });

function marketInput({ rows, confirmedFlags = null, promoted = 0, available = true } = {}) {
  const selectedRows = rows ?? [];
  return {
    available,
    selectedRows,
    selectedLineupStatus: buildSelectedLineupStatus({
      selectedRows,
      isConfirmed: (row) => (confirmedFlags ? confirmedFlags(row) : row._confirmed ?? null),
      promotedFromLiveCount: promoted,
    }),
    artifactSlateDate: SLATE,
    artifactGeneratedAt: "2026-07-21T13:00:00Z",
    artifactSources: ["public/data/mlb/hr-props-raw.json"],
  };
}

function plans(overrides = {}) {
  return buildEditionPlans({
    now: MORNING_NOW,
    slateDate: SLATE,
    firstGameTime: FIRST_PITCH,
    gamesScheduled: 15,
    markets: {
      k: marketInput({ rows: [kRow("Pitcher A", 1, true), kRow("Pitcher B", 2, false)] }),
      hr: marketInput({ rows: [hrRow("Hitter A", 1, true), hrRow("Hitter B", 2, true)] }),
    },
    liveMode: true, allowLivePost: true, credentialsPresent: true, verifiedAccount: true,
    imageBundleFor: () => null,
    ...overrides,
  });
}
const find = (all, market, edition) => all.find((p) => p.market === market && p.edition === edition);

describe("four targets", () => {
  it("creates exactly four plans for one slate", () => {
    const all = plans();
    assert.equal(all.length, 4);
    assert.deepEqual(
      all.map((p) => `${p.market}-${p.edition}`).sort(),
      ["hr-confirmed", "hr-morning", "k-confirmed", "k-morning"],
    );
  });

  it("reuses one frozen selection across both editions of a market", () => {
    const all = plans();
    // Identity, not just equality: the same frozen array object.
    assert.equal(find(all, "k", "morning").selectedRows, find(all, "k", "confirmed").selectedRows);
    assert.equal(find(all, "hr", "morning").selectedRows, find(all, "hr", "confirmed").selectedRows);
  });

  it("keeps K and HR selections distinct", () => {
    const all = plans();
    assert.notDeepEqual(find(all, "k", "morning").selectedRows, find(all, "hr", "morning").selectedRows);
  });
});

describe("edition readiness", () => {
  it("morning ignores lineup confirmation entirely", () => {
    // K has one unconfirmed pitcher, HR is fully confirmed -- both post.
    const all = plans();
    for (const market of ["k", "hr"]) {
      const p = find(all, market, "morning");
      assert.equal(p.readiness.decision, Decision.POST);
      assert.equal(p.readiness.status, ReadinessStatus.READY_TO_POST);
      assert.equal(p.readiness.confirmationComplete, false);
    }
  });

  it("confirmed K uses selected opposing-lineup coverage only", () => {
    const all = plans({
      now: new Date(Date.parse(FIRST_PITCH) - 130 * 60_000).toISOString(),
      markets: {
        k: marketInput({ rows: [kRow("A", 1, true), kRow("B", 2, false)] }),
        hr: marketInput({ rows: [hrRow("H", 1, true)] }),
      },
    });
    const k = find(all, "k", "confirmed");
    assert.equal(k.readiness.decision, Decision.WAIT);
    assert.equal(k.readiness.status, ReadinessStatus.WAITING_FOR_SELECTED_LINEUPS);
    assert.equal(k.selectedLineupStatus.confirmedPickCount, 1);
    assert.equal(k.selectedLineupStatus.selectedPickCount, 2);
  });

  it("confirmed HR uses selected hitter confirmation only", () => {
    const all = plans({
      now: new Date(Date.parse(FIRST_PITCH) - 130 * 60_000).toISOString(),
      markets: {
        k: marketInput({ rows: [kRow("A", 1, true)] }),
        hr: marketInput({ rows: [hrRow("H1", 1, true), hrRow("H2", 2, true)] }),
      },
    });
    const hr = find(all, "hr", "confirmed");
    assert.equal(hr.readiness.decision, Decision.POST);
    assert.equal(hr.readiness.confirmationComplete, true);
    assert.equal(hr.selectedLineupStatus.fullyConfirmed, true);
  });

  it("does not use full-slate confirmation", () => {
    // 15 games scheduled, 2 selected picks in 2 games, both confirmed.
    const all = plans({
      now: new Date(Date.parse(FIRST_PITCH) - 130 * 60_000).toISOString(),
      gamesScheduled: 15,
      markets: {
        k: marketInput({ rows: [kRow("A", 1, true), kRow("B", 2, true)] }),
        hr: marketInput({ rows: [hrRow("H", 1, true)] }),
      },
    });
    const k = find(all, "k", "confirmed");
    assert.equal(k.readiness.decision, Decision.POST);
    assert.equal(k.selectedGameCount ?? k.selectedLineupStatus.selectedGameCount, 2);
  });
});

describe("selected lineup status", () => {
  it("counts picks, games, coverage and unresolved players", () => {
    const status = buildSelectedLineupStatus({
      selectedRows: [hrRow("A", 1, true), hrRow("B", 1, true), hrRow("C", 2, false), hrRow("D", 3, null)],
      isConfirmed: (r) => r._confirmed,
      promotedFromLiveCount: 2,
    });
    assert.equal(status.selectedPickCount, 4);
    assert.equal(status.selectedGameCount, 3);
    assert.equal(status.confirmedPickCount, 2);
    assert.equal(status.confirmedGameCount, 1);
    assert.equal(status.unresolvedPickCount, 2);
    assert.deepEqual(status.unresolvedPlayers, ["C", "D"]);
    assert.equal(status.coverageRatio, 0.5);
    assert.equal(status.fullyConfirmed, false);
    assert.equal(status.promotedFromLiveCount, 2);
  });

  it("treats unknown confirmation as unresolved, never as confirmed", () => {
    const status = buildSelectedLineupStatus({ selectedRows: [hrRow("A", 1, null)], isConfirmed: () => null });
    assert.equal(status.confirmedPickCount, 0);
    assert.equal(status.fullyConfirmed, false);
  });

  it("an empty selection is not vacuously fully confirmed", () => {
    assert.equal(buildSelectedLineupStatus({ selectedRows: [] }).fullyConfirmed, false);
  });
});

describe("July 21 regression scenarios", () => {
  it("HR recovers selected confirmation from live data via promotion", () => {
    const liveConfirm = (row) => {
      const game = FIXTURE.games.find((g) => g.gamePk === row.gameId);
      if (!game) return null;
      const side = game.homeAbbr === row.team ? game.homeLineup : game.awayAbbr === row.team ? game.awayLineup : null;
      if (!side?.confirmed) return null;
      return side.batters.some((b) => b.id === row.playerId);
    };
    const selection = selectConfirmedHrProps({ batters: FIXTURE.batters, liveConfirm });
    assert.ok(selection.confirmedCount > 0, "promotion recovers CLE hitters");

    const status = buildSelectedLineupStatus({
      selectedRows: selection.selected,
      isConfirmed: () => true, // every selected row is confirmed post-promotion
      promotedFromLiveCount: selection.promotedFromLiveCount,
    });
    const all = plans({
      now: new Date(Date.parse(FIRST_PITCH) - 130 * 60_000).toISOString(),
      markets: {
        k: marketInput({ rows: [kRow("A", 1, true)] }),
        hr: { ...marketInput({ rows: selection.selected }), selectedLineupStatus: status },
      },
    });
    const hr = find(all, "hr", "confirmed");
    assert.equal(hr.readiness.decision, Decision.POST);
    assert.equal(hr.readiness.confirmationComplete, true);
    assert.equal(hr.promotedFromLiveCount, selection.promotedFromLiveCount);
    assert.ok(hr.promotedFromLiveCount > 0);
  });

  it("HR morning publishes on the July 21 slate despite zero artifact confirmation", () => {
    // The exact 2026-07-21 state: every artifact row projected.
    const selection = selectConfirmedHrProps({ batters: FIXTURE.batters, liveConfirm: () => null });
    assert.equal(selection.confirmedCount, 0);
    const all = plans({
      markets: {
        k: marketInput({ rows: [kRow("A", 1, false)] }),
        hr: marketInput({ rows: FIXTURE.batters.slice(0, 5).map((b) => ({ ...b, _confirmed: false })) }),
      },
    });
    const hrMorning = find(all, "hr", "morning");
    assert.equal(hrMorning.readiness.decision, Decision.POST, "morning must not need confirmation");
    assert.equal(hrMorning.selectedLineupStatus.confirmedPickCount, 0);
  });

  it("K produces one verdict the poster will reuse verbatim", () => {
    const at = new Date(Date.parse(FIRST_PITCH) - 130 * 60_000).toISOString();
    const all = plans({
      now: at,
      markets: { k: marketInput({ rows: [kRow("A", 1, false)] }), hr: marketInput({ rows: [hrRow("H", 1, true)] }) },
    });
    const k = find(all, "k", "confirmed");
    // The 2026-07-21 failure was planner READY / poster WAITING. One verdict now.
    assert.equal(k.readiness.shouldRunPoster, k.readiness.shouldPost);
    assert.equal(k.readiness.status, ReadinessStatus.WAITING_FOR_SELECTED_LINEUPS);
  });
});

describe("image readiness at plan time", () => {
  it("marks posterMustRenderImage without suppressing the morning post", () => {
    const all = plans({ imageBundleFor: () => null });
    const m = find(all, "k", "morning");
    assert.equal(m.imageReadyAtPlanTime, false);
    assert.equal(m.posterMustRenderImage, true);
    assert.equal(m.readiness.decision, Decision.POST, "a missing image must not kill a 10:00 AM edition");
  });

  it("marks imageReadyAtPlanTime when a valid bundle exists", () => {
    const all = plans({
      imageBundleFor: () => ({ valid: true, metadata: { slateDate: SLATE, generatedAt: "2026-07-21T13:30:00Z", width: 1200, height: 675, imagePath: "/tmp/x.png" } }),
    });
    const m = find(all, "k", "morning");
    assert.equal(m.imageReadyAtPlanTime, true);
    assert.equal(m.posterMustRenderImage, false);
  });
});

describe("receipt suppression is edition-scoped", () => {
  const postedFor = (key) => (k) => (k === key ? { outcome: ReceiptOutcome.POSTED, postId: "1" } : null);

  it("an already-posted edition suppresses only itself", () => {
    const all = plans({ readReceipt: postedFor("mlb-k-2026-07-21-morning") });
    assert.equal(find(all, "k", "morning").readiness.status, ReadinessStatus.ALREADY_POSTED);
    assert.equal(find(all, "k", "morning").readiness.shouldRunPoster, false);
    // Confirmed is simply not due yet at 10:00 ET. Crucially it is NOT
    // ALREADY_POSTED -- the morning receipt did not leak across editions.
    assert.equal(find(all, "k", "confirmed").readiness.status, ReadinessStatus.NOT_DUE);
  });

  it("a morning receipt does not suppress confirmed", () => {
    const at = new Date(Date.parse(FIRST_PITCH) - 130 * 60_000).toISOString();
    const all = plans({
      now: at,
      readReceipt: postedFor("mlb-k-2026-07-21-morning"),
      markets: { k: marketInput({ rows: [kRow("A", 1, true)] }), hr: marketInput({ rows: [hrRow("H", 1, true)] }) },
    });
    assert.equal(find(all, "k", "morning").readiness.status, ReadinessStatus.ALREADY_POSTED);
    assert.equal(find(all, "k", "confirmed").readiness.decision, Decision.POST);
  });

  it("a K receipt does not suppress HR", () => {
    const all = plans({ readReceipt: postedFor("mlb-k-2026-07-21-morning") });
    assert.equal(find(all, "hr", "morning").readiness.decision, Decision.POST);
  });
});

describe("missing artifacts are market-scoped", () => {
  it("blocks only the affected market", () => {
    const all = plans({
      markets: { k: marketInput({ rows: [], available: false }), hr: marketInput({ rows: [hrRow("H", 1, true)] }) },
    });
    assert.equal(find(all, "k", "morning").readiness.status, ReadinessStatus.NO_GAMES);
    assert.equal(find(all, "k", "morning").readiness.shouldRunPoster, false);
    assert.equal(find(all, "hr", "morning").readiness.decision, Decision.POST, "HR is unaffected");
  });
});

describe("plan files and outputs", () => {
  it("writes four plan files atomically with no temp files left", () => {
    withTempDir((dir) => {
      const written = writePlansAtomically(plans(), dir);
      assert.equal(written.length, 4);
      const files = readdirSync(dir).sort();
      assert.deepEqual(files, ["hr-confirmed.json", "hr-morning.json", "k-confirmed.json", "k-morning.json"]);
      assert.ok(!files.some((f) => f.endsWith(".tmp")));
      for (const f of files) {
        const parsed = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
        assert.equal(parsed.version, PLAN_VERSION);
      }
    });
  });

  it("emits small scalar outputs that match the frozen plan readiness", () => {
    const all = plans();
    const out = toWorkflowOutputs(all);
    for (const p of all) {
      const prefix = `${p.market}_${p.edition}`;
      assert.equal(out[`${prefix}_should_run`], String(p.readiness.shouldRunPoster));
      assert.equal(out[`${prefix}_status`], p.readiness.status);
      assert.equal(out[`${prefix}_receipt_key`], p.readiness.receiptKey);
      assert.equal(out[`${prefix}_plan_file`], planFileName(p.market, p.edition));
      // Outputs stay small -- no plan JSON smuggled through a shell string.
      assert.ok(out[`${prefix}_reason`].length < 120);
    }
    assert.equal(Object.keys(out).length, 24);
  });
});

describe("plan validation", () => {
  const good = () => JSON.parse(JSON.stringify(find(plans(), "k", "morning")));

  it("accepts a well-formed plan", () => {
    assert.equal(validatePlan(good()).valid, true);
  });

  it("rejects an unsupported version", () => {
    assert.equal(validatePlan({ ...good(), version: 99 }).reason, PlanRejection.UNSUPPORTED_VERSION);
  });

  it("rejects an invalid market or edition", () => {
    assert.equal(validatePlan({ ...good(), market: "nfl" }).reason, PlanRejection.INVALID_MARKET);
    assert.equal(validatePlan({ ...good(), edition: "evening" }).reason, PlanRejection.INVALID_EDITION);
  });

  it("rejects a missing slate date and a malformed first game time", () => {
    assert.equal(validatePlan({ ...good(), slateDate: "" }).reason, PlanRejection.MISSING_SLATE_DATE);
    assert.equal(validatePlan({ ...good(), firstGameTime: "not-a-time" }).reason, PlanRejection.MALFORMED_FIRST_GAME_TIME);
  });

  it("rejects non-array selected rows", () => {
    assert.equal(validatePlan({ ...good(), selectedRows: "rows" }).reason, PlanRejection.SELECTED_ROWS_NOT_ARRAY);
  });

  it("rejects a readiness target or receipt-key mismatch", () => {
    const p = good();
    p.readiness.detail.edition = "confirmed";
    assert.equal(validatePlan(p).reason, PlanRejection.READINESS_TARGET_MISMATCH);
    const q = good();
    q.readiness.receiptKey = "mlb-k-2026-07-20-morning";
    assert.equal(validatePlan(q).reason, PlanRejection.READINESS_RECEIPT_KEY_MISMATCH);
  });

  it("rejects a plan for a different slate than the poster expects", () => {
    assert.equal(validatePlan(good(), { slateDate: "2026-07-22" }).reason, PlanRejection.PLAN_SLATE_MISMATCH);
  });

  it("rejects inconsistent lineup counts", () => {
    const negative = good(); negative.selectedLineupStatus.confirmedPickCount = -1;
    assert.equal(validatePlan(negative).reason, PlanRejection.NEGATIVE_COUNT);

    const tooMany = good(); tooMany.selectedLineupStatus.confirmedPickCount = 99;
    assert.equal(validatePlan(tooMany).reason, PlanRejection.CONFIRMED_EXCEEDS_SELECTED);

    const inconsistent = good(); inconsistent.selectedLineupStatus.unresolvedPickCount = 7;
    assert.equal(validatePlan(inconsistent).reason, PlanRejection.UNRESOLVED_COUNT_INCONSISTENT);

    const mismatchedRows = good(); mismatchedRows.selectedRows = [];
    assert.equal(validatePlan(mismatchedRows).reason, PlanRejection.UNRESOLVED_COUNT_INCONSISTENT);
  });
});

describe("planner stays lightweight", () => {
  it("performs no X call, browser work, render, or receipt write", () => {
    // buildEditionPlans takes only data and pure callbacks; the only IO in the
    // module is writePlansAtomically. Guard against a future import creeping in.
    const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "mlb-x-edition-plan.mjs"), "utf8");
    for (const forbidden of ["playwright", "chromium", "puppeteer", "twitter-api", "uploadMedia", "v2.tweet", "writeMlbSocialGraphic", "saveEditionPostReceipt"]) {
      assert.ok(!source.includes(forbidden), `planner must not reference ${forbidden}`);
    }
  });

  it("reads receipts but never writes one", () => {
    let reads = 0;
    plans({ readReceipt: () => { reads += 1; return null; } });
    assert.equal(reads, 4, "one receipt read per target");
  });
});
