import { describe, expect, it } from "vitest";
import { QuotaManager } from "../../api-quota/manager";
import { MemoryUsageStore } from "../../api-quota/store";
import { clock, sequentialIds } from "../../api-quota/__fixtures__/accounts";
import { at, makeGame, oddsAccount, quotaSetup, TIPOFF } from "./__fixtures__/pipelineFixtures";
import { buildSnapshot, type NbaPregameSnapshot, type SnapshotInput } from "./pipeline/contracts";
import { monthRemaining, planCaptureBudget, quotaRequestGate } from "./pipeline/budget";
import { ODDS_SOURCE_PROFILES } from "./pipeline/oddsSources";
import { expiredSnapshots, retentionDeadline } from "./pipeline/retention";
import {
  coverage,
  hybridPlan,
  estimateStorageMb,
  freeHeadroom,
  PEER_COMPONENTS,
  peerReserveCredits,
  reconcileIntervals,
  scenarioPeerMonthly,
  SEASON_SCENARIOS,
  summarizeBurn,
  type QuotaObservation,
} from "./pipeline/zeroCostBudget";
import { DATA_USES } from "./sources/types";

/** The shared Odds API counter as committed by the NFL job (data/market/betting-lines/quota-state.json), Sep 23 to Oct 12 2026. */
const SERIES: QuotaObservation[] = [
  ["2026-09-23T14:46:12Z", 296], ["2026-09-24T14:41:48Z", 312], ["2026-09-25T15:03:11Z", 322], ["2026-09-26T14:12:29Z", 333],
  ["2026-09-27T15:01:46Z", 343], ["2026-09-28T18:00:27Z", 353], ["2026-09-29T16:23:04Z", 369], ["2026-09-30T16:18:28Z", 387],
  ["2026-10-01T16:55:58Z", 7], ["2026-10-02T16:08:49Z", 21], ["2026-10-03T14:37:33Z", 30], ["2026-10-04T15:12:55Z", 45],
  ["2026-10-05T19:08:37Z", 61], ["2026-10-06T16:34:57Z", 74], ["2026-10-07T17:20:43Z", 90], ["2026-10-08T17:16:45Z", 104],
  ["2026-10-09T16:52:47Z", 116], ["2026-10-10T15:47:46Z", 123], ["2026-10-11T16:11:51Z", 133], ["2026-10-12T19:42:05Z", 146],
].map(([at, used]) => ({ at: at as string, used: used as number }));

describe("burn summary from the committed counter series", () => {
  it("skips the reset interval and recovers about 12.6 credits a day", () => {
    const burn = summarizeBurn(SERIES);
    expect(burn.resets).toBe(1);
    expect(burn.observations).toBe(SERIES.length);
    expect(burn.meanPerDay!).toBeGreaterThan(12);
    expect(burn.meanPerDay!).toBeLessThan(13.5);
    expect(burn.projectedMonthly!).toBeGreaterThan(380);
    expect(burn.projectedMonthly!).toBeLessThan(420);
  });

  it("uses only October readings for the current cycle", () => {
    const october = summarizeBurn(SERIES.filter((o) => o.at >= "2026-10-01"));
    expect(october.resets).toBe(0);
    expect(october.creditsUsed).toBe(139);
    expect(october.meanPerDay!).toBeCloseTo(139 / 11.115, 1);
  });

  it("returns nulls rather than a rate when there is nothing to compare", () => {
    expect(summarizeBurn([])).toMatchObject({ meanPerDay: null, projectedMonthly: null });
    expect(summarizeBurn([SERIES[0]])).toMatchObject({ meanPerDay: null });
    expect(summarizeBurn([SERIES[8], SERIES[7]]).resets).toBe(1);
  });
});

describe("free headroom", () => {
  const october = summarizeBurn(SERIES.filter((o) => o.at >= "2026-10-01"));

  it("leaves roughly forty credits a month now, with the NFL floor and a 5% cushion kept", () => {
    const headroom = freeHeadroom({ planLimit: 500, guardFloor: 50, peerMonthly: october.projectedMonthly! });
    expect(headroom).toBeGreaterThanOrEqual(35);
    expect(headroom).toBeLessThanOrEqual(50);
  });

  it("is zero, never negative, when the other sports already use the pool", () => {
    expect(freeHeadroom({ planLimit: 500, guardFloor: 50, peerMonthly: 460 })).toBe(0);
    expect(freeHeadroom({ planLimit: 500, guardFloor: 50, peerMonthly: 900 })).toBe(0);
  });

  it("grows as the MLB components stop, and the measured components add up to the measured burn", () => {
    const monthly = Object.fromEntries(SEASON_SCENARIOS.map((s) => [s.id, scenarioPeerMonthly(s)]));
    const head = (id: string) => freeHeadroom({ planLimit: 500, guardFloor: 50, peerMonthly: monthly[id] });
    expect(head("nfl-only")).toBeGreaterThan(head("mlb-off-expected"));
    expect(head("mlb-off-expected")).toBeGreaterThan(head("mlb-off-planning"));
    expect(head("mlb-off-planning")).toBeGreaterThan(head("now"));
    expect(PEER_COMPONENTS.reduce((sum, c) => sum + c.perDay, 0)).toBeCloseTo(12.66, 2);
    expect(head("mlb-off-planning")).toBeGreaterThanOrEqual(200);
    expect(head("mlb-off-planning")).toBeLessThan(215);
  });
});

describe("coverage", () => {
  it("prices points-only at one credit a game and three markets at three", () => {
    expect(coverage({ monthlyCredits: 42, marketsPerGame: 1 })).toMatchObject({ creditsPerGame: 1, gamesPerMonth: 42 });
    expect(coverage({ monthlyCredits: 42, marketsPerGame: 3 })).toMatchObject({ creditsPerGame: 3, gamesPerMonth: 14 });
  });

  it("caps the slate share at 100% and is zero with no credits", () => {
    expect(coverage({ monthlyCredits: 5000, marketsPerGame: 1 }).shareOfAverageSlate).toBe(1);
    expect(coverage({ monthlyCredits: 0, marketsPerGame: 1 })).toMatchObject({ gamesPerMonth: 0, shareOfAverageSlate: 0 });
    expect(coverage({ monthlyCredits: -5, marketsPerGame: 1 }).gamesPerMonth).toBe(0);
  });
});

describe("hybrid plan", () => {
  it("funds the top games with all three markets first and spends the rest on points", () => {
    const plan = hybridPlan({ monthlyCredits: 207, gamesPerMonth: 210, topGamesPerNight: 1 });
    expect(plan.topGames).toBe(28);
    expect(plan.baseGames).toBe(207 - 28 * 3);
    expect(plan.creditsUsed).toBe(207);
    expect(plan.share).toBeCloseTo((28 + 123) / 210, 6);
  });

  it("never spends more than the allowance or covers more games than exist", () => {
    for (const credits of [0, 2, 40, 207, 5000]) {
      const plan = hybridPlan({ monthlyCredits: credits, gamesPerMonth: 210, topGamesPerNight: 2 });
      expect(plan.creditsUsed).toBeLessThanOrEqual(credits);
      expect(plan.topGames + plan.baseGames).toBeLessThanOrEqual(210);
    }
    expect(hybridPlan({ monthlyCredits: 5000, gamesPerMonth: 210, topGamesPerNight: 2 }).share).toBe(1);
  });
});

describe("peer reserve", () => {
  it("is the floor plus the other sports' projected spend to month end", () => {
    expect(peerReserveCredits({ peerPerDay: 12.6, daysLeft: 10, floor: 50 })).toBe(50 + Math.ceil(12.6 * 10 * 1.05));
    expect(peerReserveCredits({ peerPerDay: 12.6, daysLeft: 0, floor: 50 })).toBe(50);
    expect(peerReserveCredits({ peerPerDay: 12.6, daysLeft: -3, floor: 50 })).toBe(50);
  });
});

describe("peer reserve is enforced by the planner and the gate", () => {
  const KEYS = ["g1", "g2", "g3", "g4"];

  it("defers a game that would dip into the credits kept for other sports", async () => {
    const setup = await quotaSetup({}, "2026-11-09T20:00:00Z", 400); // 100 left of 500
    const allowance = { perDayCredits: 90, perMonthCredits: 400, peerReserveCredits: 97 };
    const plan = await planCaptureBudget({ manager: setup.manager, accountId: setup.accountId, gameKeys: KEYS, marketsPerGame: 1, allowance, now: setup.time.now() });
    expect(plan.affordable.map((a) => a.gameKey)).toEqual(["g1", "g2", "g3"]);
    expect(plan.deferred).toEqual([expect.objectContaining({ gameKey: "g4", reason: "peer_reserve" })]);
  });

  it("spends nothing when the remaining credits cannot be known", async () => {
    // No limit configured and no provider reading recorded: the remaining credits are unknowable.
    const time = clock("2026-11-09T20:00:00Z");
    const account = oddsAccount({ windows: [{ kind: "month", limit: null, source: "unknown", resetDayOfMonth: 1 }] });
    const manager = new QuotaManager({ accounts: [account], store: new MemoryUsageStore(), now: time.now, newId: sequentialIds() });
    const allowance = { perDayCredits: 90, perMonthCredits: 400, peerReserveCredits: 10 };
    const plan = await planCaptureBudget({ manager, accountId: account.accountId, gameKeys: ["g1"], marketsPerGame: 1, allowance, now: time.now() });
    expect(plan.affordable).toEqual([]);
    expect(plan.deferred[0].reason).toBe("peer_reserve");
    expect(await monthRemaining(manager, account.accountId, time.now())).toBeNull();
    const gate = quotaRequestGate(manager, account.accountId, "pregame-capture", allowance, time.now);
    expect(await gate.reserve(1, "/events/x/odds")).toMatchObject({ ok: false, code: "NBA_PEER_RESERVE" });
  });

  it("makes the gate refuse a call below the reserve even if the planner is skipped", async () => {
    const setup = await quotaSetup({}, "2026-11-09T20:00:00Z", 440); // 60 left
    const gate = quotaRequestGate(setup.manager, setup.accountId, "pregame-capture", { perDayCredits: 90, perMonthCredits: 400, peerReserveCredits: 58 }, setup.time.now);
    setup.time.advance(60_000); // the provider reading is older than the spend, as in a real run
    const first = await gate.reserve(2, "/events/x/odds");
    expect(first.ok).toBe(true);
    if (first.ok) await first.settle(2, "ok");
    const second = await gate.reserve(1, "/events/y/odds");
    expect(second).toMatchObject({ ok: false, code: "NBA_PEER_RESERVE" });
  });

  it("changes nothing when no reserve is set", async () => {
    const setup = await quotaSetup({}, "2026-11-09T20:00:00Z", 499);
    const plan = await planCaptureBudget({ manager: setup.manager, accountId: setup.accountId, gameKeys: ["g1"], marketsPerGame: 1, allowance: { perDayCredits: 90, perMonthCredits: 400 }, now: setup.time.now() });
    expect(plan.affordable).toHaveLength(1);
  });
});

describe("storage estimate", () => {
  it("keeps a full capped season well inside the 500 MB free database", () => {
    const capped = estimateStorageMb({ snapshotsPerGame: 60, games: 1230 });
    expect(capped).toBeGreaterThan(100);
    expect(capped).toBeLessThan(250);
  });

  it("is roughly linear in games", () => {
    expect(estimateStorageMb({ snapshotsPerGame: 30, games: 200 })).toBeCloseTo(estimateStorageMb({ snapshotsPerGame: 30, games: 100 }) * 2, 6);
  });
});

describe("retention", () => {
  const snapshotFrom = (sourceId: string): NbaPregameSnapshot => {
    const game = makeGame();
    const input: SnapshotInput = {
      game: { canonicalGameKey: game.canonicalGameKey, sourceEventId: "evt-1", tipoffUtc: game.tipoffUtc, awayTeam: "NYK", homeTeam: "BOS", neutralSite: false },
      player: { canonicalPlayerId: null, sourcePlayerName: "Sam Rivera", sourcePlayerId: null, team: "NYK" },
      market: "pts",
      source: { sourceId: "synthetic-odds", method: "synthetic", sportsbook: "bookone", sourceMarketKey: "player_points" },
      line: 24.5,
      overPrice: -115,
      underPrice: -105,
      sourceLastUpdateUtc: at(TIPOFF, 160).toISOString().replace(".000Z", "Z"),
      capturedAtUtc: at(TIPOFF, 150).toISOString().replace(".000Z", "Z"),
      maxAgeMinutes: 120,
      projection: { value: null, minutes: null, modelVersion: null, inputCutoffUtc: null, unavailableReason: "none" },
      permissions: { permittedUses: [...DATA_USES].filter((u) => u !== "raw-redistribution") as never, licenseBasis: "synthetic", licenseReviewedOn: "2026-10-19", attestation: null },
      provenance: { runId: "run-1", importBatchId: null, creditsCharged: 1 },
    };
    return { ...buildSnapshot(input), source: { ...buildSnapshot(input).source, sourceId: sourceId as never } };
  };

  it("records ParlayAPI's 90-day cap and no cap for the others", () => {
    expect(ODDS_SOURCE_PROFILES.parlayapi.retentionCapDays).toBe(90);
    expect(ODDS_SOURCE_PROFILES["the-odds-api"].retentionCapDays).toBeNull();
    expect(ODDS_SOURCE_PROFILES["manual-import"].retentionCapDays).toBeNull();
  });

  it("computes the deadline from capture time", () => {
    expect(retentionDeadline("2026-11-09T22:00:00Z", 90)).toBe("2027-02-07T22:00:00.000Z");
    expect(retentionDeadline("2026-11-09T22:00:00Z", null)).toBeNull();
    expect(() => retentionDeadline("2026-11-09T22:00:00Z", 0)).toThrow(/positive/);
  });

  it("lists capped snapshots only after the cap and never lists uncapped sources", () => {
    const capped = snapshotFrom("parlayapi");
    const uncapped = snapshotFrom("the-odds-api");
    const day = (n: number) => new Date(Date.parse(capped.timing.capturedAtUtc) + n * 86_400_000);
    expect(expiredSnapshots([capped, uncapped], day(89))).toEqual([]);
    expect(expiredSnapshots([capped, uncapped], day(90))).toEqual([capped]);
    expect(expiredSnapshots([capped, uncapped], day(5000))).toEqual([capped]);
  });
});

describe("interval reconciliation of the shared counter", () => {
  const reading = (at: string, used: number, lastCost: number | null = 3) => ({ at, used, lastCost });

  it("subtracts what the committed artifacts prove from each rise and leaves the residual", () => {
    const rows = reconcileIntervals(
      [reading("2026-10-02T12:00:00Z", 26), reading("2026-10-01T12:00:00Z", 13), reading("2026-10-03T12:00:00Z", 40)],
      [{ at: "2026-10-02T06:00:00Z", credits: 2 }],
      [{ at: "2026-10-01T18:00:00Z", credits: 1 }, { at: "2026-10-02T20:00:00Z", credits: 1 }, { at: "2026-10-02T21:00:00Z", credits: 0 }],
    );
    expect(rows.map((r) => [r.delta, r.nflLines, r.yardage, r.mlb, r.residual])).toEqual([[13, 3, 2, 1, 7], [14, 3, 0, 1, 10]]);
    expect(rows[0].days).toBeCloseTo(1, 5);
  });

  it("counts an artifact at the end of an interval in it and one at the start in the previous one", () => {
    const rows = reconcileIntervals(
      [reading("2026-10-01T12:00:00Z", 0), reading("2026-10-02T12:00:00Z", 10), reading("2026-10-03T12:00:00Z", 20)],
      [],
      [{ at: "2026-10-01T12:00:00Z", credits: 1 }, { at: "2026-10-02T12:00:00Z", credits: 1 }],
    );
    expect(rows.map((r) => r.mlb)).toEqual([1, 0]);
  });

  it("skips a monthly reset and a repeated timestamp instead of inventing a negative rate", () => {
    const rows = reconcileIntervals([reading("2026-09-30T12:00:00Z", 387), reading("2026-10-01T12:00:00Z", 7), reading("2026-10-01T12:00:00Z", 9), reading("2026-10-02T12:00:00Z", 21)], [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ delta: 12, residual: 9 });
  });

  it("treats a missing job cost as zero, so the residual can only be too large, never too small", () => {
    const [row] = reconcileIntervals([reading("2026-10-01T12:00:00Z", 0, null), reading("2026-10-02T12:00:00Z", 12, null)], [], []);
    expect(row.nflLines).toBe(0);
    expect(row.residual).toBe(12);
  });
});
