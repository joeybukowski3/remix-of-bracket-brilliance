/**
 * mlb-x-edition-poster.test.mjs
 * Run via: node --test scripts/lib/mlb-x-edition-poster.test.mjs
 *
 * Drives the shared posting path with mocked X, image and state collaborators.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PostOutcome, runEditionPost } from "./mlb-x-edition-poster.mjs";
import { buildEditionPlans, buildSelectedLineupStatus, planFileName, writePlansAtomically } from "./mlb-x-edition-plan.mjs";
import { ReplyStatus } from "./mlb-x-edition-publication.mjs";

const SLATE = "2026-07-21";
const FIRST_PITCH = "2026-07-21T22:40:00Z";
const MORNING = "2026-07-21T14:00:00Z";          // 10:00 ET
const PREFERRED = new Date(Date.parse(FIRST_PITCH) - 130 * 60_000).toISOString();
const FALLBACK = new Date(Date.parse(FIRST_PITCH) - 90 * 60_000).toISOString();
const AFTER = new Date(Date.parse(FIRST_PITCH) - 10 * 60_000).toISOString();

const ROWS = [
  { player: "Alpha", pitcher: "Alpha", gameId: 1 },
  { player: "Bravo", pitcher: "Bravo", gameId: 2 },
];

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-x-poster-"));
  const done = () => rmSync(dir, { recursive: true, force: true });
  let out;
  try { out = fn(dir); } catch (e) { done(); throw e; }
  return out && typeof out.then === "function" ? out.then((v) => { done(); return v; }, (e) => { done(); throw e; }) : (done(), out);
}

function writePlans(dir, { now = MORNING, confirmedCount = ROWS.length } = {}) {
  const status = buildSelectedLineupStatus({
    selectedRows: ROWS,
    isConfirmed: (row) => ROWS.indexOf(row) < confirmedCount,
  });
  const market = { available: true, selectedRows: ROWS, selectedLineupStatus: status, artifactSlateDate: SLATE, artifactGeneratedAt: "2026-07-21T13:00:00Z", artifactSources: [] };
  const plans = buildEditionPlans({
    now, slateDate: SLATE, firstGameTime: FIRST_PITCH, gamesScheduled: 15,
    markets: { k: market, hr: market },
    liveMode: true, allowLivePost: true, credentialsPresent: true, verifiedAccount: true,
    imageBundleFor: () => null,
  });
  writePlansAtomically(plans, dir);
  return plans;
}

/** In-memory stand-in for the git state store. */
function fakeStore() {
  const map = new Map();
  const key = ({ slateDate, market, edition }) => `${slateDate}|${market}|${edition}`;
  return {
    syncs: 0,
    writes: [],
    map,
    sync() { this.syncs += 1; },
    readReceipt(t) { return map.get(key(t)) ?? null; },
    writeReceipt({ slateDate, market, edition, receipt }) {
      map.set(key({ slateDate, market, edition }), receipt);
      this.writes.push(receipt);
      return { pushed: true };
    },
  };
}

const okLease = () => ({ acquired: true, release() {} });
const bundle = (rows = ROWS) => ({ valid: true, metadata: { slateDate: SLATE, generatedAt: MORNING, width: 1200, height: 675, imagePath: "/tmp/x.png" }, renderedRows: rows, source: "rendered" });

function harness(dir, overrides = {}) {
  const store = overrides.stateStore ?? fakeStore();
  const calls = { primary: 0, reply: 0, image: 0, caption: 0 };
  const deps = {
    target: { market: "k", edition: "morning", slateDate: SLATE },
    planDirectory: dir,
    stateStore: store,
    acquireLease: okLease,
    ensureImage: async ({ rows }) => { calls.image += 1; return bundle(rows); },
    buildCaption: async ({ rows, languageMode }) => { calls.caption += 1; return { caption: `[${languageMode}] ${rows.map((r) => r.player).join(", ")}`, captionRows: rows }; },
    postPrimary: async () => { calls.primary += 1; return { postId: "primary-1" }; },
    postReply: null,
    now: () => MORNING,
    liveConfig: { liveMode: true, allowLivePost: true, credentialsPresent: true, verifiedAccount: true },
    ...overrides,
  };
  return { deps, store, calls, run: () => runEditionPost(deps) };
}

describe("frozen plan consumption", () => {
  it("publishes the frozen rows without reselecting", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir);
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.POSTED);
      assert.equal(h.calls.primary, 1);
      // Caption and image were built from the plan's rows.
      assert.equal(h.calls.caption, 1);
      assert.equal(h.calls.image, 1);
      assert.equal(h.store.writes[0].primaryPostId, "primary-1");
    });
  });

  it("uses the plan languageMode rather than inferring wording", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      let seen = null;
      const h = harness(dir, { buildCaption: async ({ rows, languageMode }) => { seen = languageMode; return { caption: "c", captionRows: rows }; } });
      await h.run();
      assert.equal(seen, "morning");
    });
  });

  it("fails visibly when the plan is missing", async () => {
    await withTempDir(async (dir) => {
      const h = harness(dir);
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.CONFIGURATION_ERROR);
      assert.equal(h.calls.primary, 0, "no post without a plan");
    });
  });

  it("fails visibly on a corrupt or mismatched plan", async () => {
    for (const mutate of [
      (p) => { p.version = 99; },
      (p) => { p.slateDate = "2026-07-22"; },
      (p) => { p.readiness.receiptKey = "mlb-k-2026-07-20-morning"; },
      (p) => { p.selectedRows = "nope"; },
    ]) {
      await withTempDir(async (dir) => {
        const plans = writePlans(dir);
        const target = JSON.parse(JSON.stringify(plans.find((p) => p.market === "k" && p.edition === "morning")));
        mutate(target);
        writeFileSync(path.join(dir, planFileName("k", "morning")), JSON.stringify(target));
        const h = harness(dir);
        const r = await h.run();
        assert.equal(r.outcome, PostOutcome.CONFIGURATION_ERROR);
        assert.equal(h.calls.primary, 0);
      });
    }
  });

  it("does not run when the plan says not to", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir, { now: MORNING });
      // k/confirmed is NOT_DUE at 10:00 ET.
      const h = harness(dir, { target: { market: "k", edition: "confirmed", slateDate: SLATE } });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.NOT_DUE);
      assert.equal(h.calls.primary, 0);
    });
  });
});

describe("row consistency", () => {
  it("blocks posting when the caption drifts from the plan", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { buildCaption: async ({ rows }) => ({ caption: "c", captionRows: rows.slice(0, 1) }) });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.ROW_MISMATCH);
      assert.equal(h.calls.primary, 0);
    });
  });

  it("blocks posting when the graphic renders a different player", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { ensureImage: async () => bundle([{ player: "Zulu", gameId: 9 }, { player: "Bravo", gameId: 2 }]) });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.ROW_MISMATCH);
      assert.equal(h.calls.primary, 0);
    });
  });

  it("posts successfully when a caption omits a row for space and declares it in omittedRows", async () => {
    // The caption-budget feature: a row dropped from the caption for length
    // is NOT a mismatch as long as it is accounted for as omitted. The image
    // still shows every plan row (bundle() defaults to all of ROWS).
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, {
        buildCaption: async ({ rows }) => ({ caption: "c", captionRows: rows.slice(0, 1), omittedRows: rows.slice(1) }),
      });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.POSTED);
      assert.equal(h.calls.primary, 1);
    });
  });

  it("still blocks when a row is silently missing from both the caption and omittedRows", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, {
        buildCaption: async ({ rows }) => ({ caption: "c", captionRows: rows.slice(0, 1), omittedRows: [] }),
      });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.ROW_MISMATCH);
      assert.equal(h.calls.primary, 0);
    });
  });
});

describe("image handling", () => {
  it("returns IMAGE_FAILED and posts nothing when no bundle can be produced", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { ensureImage: async () => ({ valid: false, reason: "NO_METADATA" }) });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.IMAGE_FAILED);
      assert.equal(h.calls.primary, 0);
    });
  });

  it("renders from the frozen rows", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      let seen = null;
      const h = harness(dir, { ensureImage: async ({ rows }) => { seen = rows; return bundle(rows); } });
      await h.run();
      assert.deepEqual(seen.map((r) => r.player), ["Alpha", "Bravo"]);
    });
  });
});

describe("volatile revalidation", () => {
  it("does not call X once the window has closed", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir, { now: PREFERRED });
      const h = harness(dir, {
        target: { market: "k", edition: "confirmed", slateDate: SLATE },
        now: () => AFTER, // time passed while the job prepared
      });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.MISSED_WINDOW);
      assert.equal(h.calls.primary, 0);
    });
  });

  it("transitions preferred to fallback wording when time advances", async () => {
    await withTempDir(async (dir) => {
      // Planned in the preferred stage with one pick unconfirmed.
      writePlans(dir, { now: PREFERRED, confirmedCount: 1 });
      const plans = writePlans(dir, { now: FALLBACK, confirmedCount: 1 });
      const planned = plans.find((p) => p.market === "k" && p.edition === "confirmed");
      assert.equal(planned.readiness.status, "READY_TO_FALLBACK_POST");

      const h = harness(dir, { target: { market: "k", edition: "confirmed", slateDate: SLATE }, now: () => FALLBACK });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.FALLBACK_POSTED);
      assert.equal(h.store.writes[0].languageMode, "pregame_fallback");
      assert.equal(h.store.writes[0].confirmationComplete, false);
    });
  });

  it("does not re-evaluate lineup policy: planner READY stays poster READY", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir, { now: PREFERRED, confirmedCount: ROWS.length });
      const h = harness(dir, { target: { market: "k", edition: "confirmed", slateDate: SLATE }, now: () => PREFERRED });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.POSTED, "the 2026-07-21 planner/poster split must be impossible");
      assert.equal(h.store.writes[0].confirmationComplete, true);
    });
  });

  it("blocks on a failed account verification", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { verifyAccount: async () => false });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.CONFIGURATION_ERROR);
      assert.equal(h.calls.primary, 0);
    });
  });
});

describe("receipts and duplicate protection", () => {
  it("fetches authoritative state before publishing", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir);
      await h.run();
      assert.equal(h.store.syncs, 1);
    });
  });

  it("makes zero X calls when the edition is already fully published", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const store = fakeStore();
      store.map.set(`${SLATE}|k|morning`, { primaryPostId: "old", replyStatus: ReplyStatus.POSTED, replyPostId: "r" });
      const h = harness(dir, { stateStore: store });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.ALREADY_POSTED);
      assert.equal(h.calls.primary, 0);
    });
  });

  it("returns LEASE_UNAVAILABLE without posting when another attempt holds the edition", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { acquireLease: () => ({ acquired: false, heldBy: "other", release() {} }) });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.LEASE_UNAVAILABLE);
      assert.equal(h.calls.primary, 0);
    });
  });

  it("releases the lease even when the run throws", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      let released = false;
      const h = harness(dir, {
        acquireLease: () => ({ acquired: true, release() { released = true; } }),
        ensureImage: async () => { throw new Error("render exploded"); },
      });
      await assert.rejects(h.run(), /render exploded/);
      assert.equal(released, true);
    });
  });

  it("writes exactly one receipt for one successful post", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir);
      await h.run();
      assert.equal(h.store.writes.length, 1);
      assert.equal(h.store.writes[0].outcome, "POSTED");
    });
  });

  it("writes no receipt when the primary X call fails", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { postPrimary: async () => { throw new Error("429"); } });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.X_API_FAILED);
      assert.equal(h.store.writes.length, 0);
    });
  });

  it("treats a response with no post id as a failure", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { postPrimary: async () => ({ postId: "  " }) });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.X_API_FAILED);
      assert.equal(h.store.writes.length, 0);
    });
  });
});

describe("reply semantics", () => {
  it("persists the primary receipt before attempting the reply", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const order = [];
      const store = fakeStore();
      const originalWrite = store.writeReceipt.bind(store);
      store.writeReceipt = (args) => { order.push(`write:${args.receipt.replyStatus}`); return originalWrite(args); };
      const h = harness(dir, {
        stateStore: store,
        postReply: async () => { order.push("reply"); return { postId: "reply-1" }; },
      });
      await h.run();
      assert.deepEqual(order, ["write:PENDING", "reply", "write:POSTED"]);
    });
  });

  it("a reply failure preserves the primary and stays retryable", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { postReply: async () => { throw new Error("reply 500"); } });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.POSTED, "the edition is still published");
      const final = h.store.map.get(`${SLATE}|k|morning`);
      assert.equal(final.primaryPostId, "primary-1");
      assert.equal(final.replyStatus, ReplyStatus.FAILED_RETRYABLE);
      assert.match(final.replyFailureReason, /reply 500/);
    });
  });

  it("records a successful reply post id", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { postReply: async () => ({ postId: "reply-1" }) });
      const r = await h.run();
      assert.equal(r.replyPostId, "reply-1");
      assert.equal(h.store.map.get(`${SLATE}|k|morning`).replyStatus, ReplyStatus.POSTED);
    });
  });

  it("enters reply-only recovery and never posts a second primary", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const store = fakeStore();
      store.map.set(`${SLATE}|k|morning`, { primaryPostId: "existing-1", replyStatus: ReplyStatus.FAILED_RETRYABLE });
      let repliedTo = null;
      const h = harness(dir, {
        stateStore: store,
        postReply: async ({ inReplyTo }) => { repliedTo = inReplyTo; return { postId: "reply-2" }; },
      });
      const r = await h.run();
      assert.equal(h.calls.primary, 0, "no duplicate primary");
      assert.equal(repliedTo, "existing-1", "replies to the stored primary of THIS edition");
      assert.equal(r.replyPostId, "reply-2");
    });
  });

  it("morning reply state does not affect the confirmed edition", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir, { now: PREFERRED });
      const store = fakeStore();
      store.map.set(`${SLATE}|k|morning`, { primaryPostId: "morning-1", replyStatus: ReplyStatus.FAILED_RETRYABLE });
      const h = harness(dir, {
        stateStore: store,
        target: { market: "k", edition: "confirmed", slateDate: SLATE },
        now: () => PREFERRED,
        postReply: async () => ({ postId: "r" }),
      });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.POSTED, "confirmed runs its own full publication");
      assert.equal(h.calls.primary, 1);
      assert.equal(store.map.get(`${SLATE}|k|morning`).primaryPostId, "morning-1", "morning state untouched");
    });
  });

  it("K state does not affect HR", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const store = fakeStore();
      store.map.set(`${SLATE}|k|morning`, { primaryPostId: "k-1", replyStatus: ReplyStatus.POSTED });
      const h = harness(dir, { stateStore: store, target: { market: "hr", edition: "morning", slateDate: SLATE } });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.POSTED);
      assert.equal(h.calls.primary, 1);
    });
  });
});

describe("dry run", () => {
  it("makes no X mutation and writes no receipt", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { dryRun: true, postReply: async () => ({ postId: "r" }) });
      const r = await h.run();
      assert.equal(r.outcome, PostOutcome.DRY_RUN);
      assert.equal(h.calls.primary, 0);
      assert.equal(h.store.writes.length, 0);
    });
  });

  it("still validates the plan, image and rows in dry run", async () => {
    await withTempDir(async (dir) => {
      writePlans(dir);
      const h = harness(dir, { dryRun: true, ensureImage: async () => ({ valid: false, reason: "NO_METADATA" }) });
      assert.equal((await h.run()).outcome, PostOutcome.IMAGE_FAILED);
    });
  });
});
