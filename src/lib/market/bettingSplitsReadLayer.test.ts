import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBettingSplitFileStore,
  type BettingSplitFileStore,
} from "./bettingSplitsFileStore";
import { storeBettingSplitSnapshot } from "./bettingSplitsStore";
import {
  getBettingSplitHistoryForGame,
  getCurrentBettingSplitsForGame,
  getCurrentBettingSplitsForSlate,
} from "./bettingSplitsReadLayer";
import { NFL_BETTING_SPLIT_FIXTURE } from "./__fixtures__/bettingSplitsFixtures";
import type { BettingSplitSnapshot } from "./bettingSplitsTypes";

let rootDir: string;
let store: BettingSplitFileStore;

beforeEach(() => {
  rootDir = mkdtempSync(path.join(tmpdir(), "jkb-betting-splits-read-"));
  store = createBettingSplitFileStore({ rootDir });
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

function nfl(overrides: Partial<BettingSplitSnapshot> = {}): BettingSplitSnapshot {
  return { ...NFL_BETTING_SPLIT_FIXTURE, contentHash: null, ...overrides };
}

function spreadAt(currentHomeLine: number): BettingSplitSnapshot["spread"] {
  return { ...NFL_BETTING_SPLIT_FIXTURE.spread!, currentHomeLine, currentAwayLine: -currentHomeLine };
}

describe("getCurrentBettingSplitsForGame", () => {
  it("21. returns the latest state per series", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z", spread: spreadAt(-6) }));
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T12:00:00.000Z", spread: spreadAt(-8) }));

    const current = await getCurrentBettingSplitsForGame(store, {
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(current).toHaveLength(1);
    expect(current[0].spread?.currentHomeLine).toBe(-8);
  });

  it("22. keeps multiple sportsbooks separate", async () => {
    await storeBettingSplitSnapshot(store, nfl({ sportsbook: "draftkings", spread: spreadAt(-7) }));
    await storeBettingSplitSnapshot(store, nfl({ sportsbook: "fanduel", spread: spreadAt(-6) }));

    const current = await getCurrentBettingSplitsForGame(store, {
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(current.map((row) => row.sportsbook)).toEqual(["draftkings", "fanduel"]);
  });

  it("23. keeps multiple providers separate", async () => {
    await storeBettingSplitSnapshot(store, nfl({ provider: "actionnetwork" }));
    await storeBettingSplitSnapshot(store, nfl({ provider: "vsin" }));

    const current = await getCurrentBettingSplitsForGame(store, {
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(current.map((row) => row.provider)).toEqual(["actionnetwork", "vsin"]);
  });

  it("filters to one series when provider and sportsbook are supplied", async () => {
    await storeBettingSplitSnapshot(store, nfl({ provider: "vsin", sportsbook: "fanduel" }));
    await storeBettingSplitSnapshot(store, nfl({ provider: "vsin", sportsbook: "draftkings" }));

    const current = await getCurrentBettingSplitsForGame(store, {
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
      provider: "vsin",
      sportsbook: "fanduel",
    });
    expect(current).toHaveLength(1);
    expect(current[0].sportsbook).toBe("fanduel");
  });

  it("29. preserves stale timestamps exactly (no invented freshness)", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-01T10:00:00.000Z" }));
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-03T10:00:00.000Z" }));

    const [row] = await getCurrentBettingSplitsForGame(store, {
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(row.firstObservedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(row.lastObservedAt).toBe("2026-09-03T10:00:00.000Z");
    expect(row.providerLastSeenAt).toBe(NFL_BETTING_SPLIT_FIXTURE.providerLastSeenAt);
  });

  it("28. leaves missing market blocks as null", async () => {
    await storeBettingSplitSnapshot(store, nfl({ moneyline: null }));
    const [row] = await getCurrentBettingSplitsForGame(store, {
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(row.moneyline).toBeNull();
  });
});

describe("getCurrentBettingSplitsForSlate", () => {
  async function seedSlate() {
    await storeBettingSplitSnapshot(
      store,
      nfl({
        jkbGameId: "2026_01_NE_SEA",
        kickoffUtc: "2026-09-13T20:25:00.000Z",
        capturedAt: "2026-09-10T10:00:00.000Z",
        provider: "vsin",
      }),
    );
    await storeBettingSplitSnapshot(
      store,
      nfl({
        jkbGameId: "2026_01_NE_SEA",
        kickoffUtc: "2026-09-13T20:25:00.000Z",
        capturedAt: "2026-09-11T10:00:00.000Z",
        provider: "vsin",
        spread: spreadAt(-9),
      }),
    );
    await storeBettingSplitSnapshot(
      store,
      nfl({
        jkbGameId: "2026_01_DAL_PHI",
        awayTeamId: "DAL",
        homeTeamId: "PHI",
        kickoffUtc: "2026-09-11T00:20:00.000Z",
        provider: "actionnetwork",
      }),
    );
  }

  it("24. returns only the latest observation per series", async () => {
    await seedSlate();
    const slate = await getCurrentBettingSplitsForSlate(store, {
      league: "nfl",
      season: 2026,
      week: 1,
    });
    expect(slate).toHaveLength(2);
    const sea = slate.find((row) => row.jkbGameId === "2026_01_NE_SEA");
    expect(sea?.spread?.currentHomeLine).toBe(-9);
  });

  it("25. sorts deterministically by kickoff, then game, provider, sportsbook", async () => {
    await seedSlate();
    const slate = await getCurrentBettingSplitsForSlate(store, {
      league: "nfl",
      season: 2026,
      week: 1,
    });
    expect(slate.map((row) => row.jkbGameId)).toEqual([
      "2026_01_DAL_PHI",
      "2026_01_NE_SEA",
    ]);
  });

  it("orders games with a missing kickoff last", async () => {
    await storeBettingSplitSnapshot(store, nfl({ jkbGameId: "2026_01_NE_SEA", kickoffUtc: null }));
    await storeBettingSplitSnapshot(
      store,
      nfl({
        jkbGameId: "2026_01_DAL_PHI",
        awayTeamId: "DAL",
        homeTeamId: "PHI",
        kickoffUtc: "2026-09-11T00:20:00.000Z",
      }),
    );
    const slate = await getCurrentBettingSplitsForSlate(store, {
      league: "nfl",
      season: 2026,
      week: 1,
    });
    expect(slate.map((row) => row.jkbGameId)).toEqual([
      "2026_01_DAL_PHI",
      "2026_01_NE_SEA",
    ]);
  });
});

describe("getBettingSplitHistoryForGame", () => {
  it("26. returns chronological history oldest-first", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z", spread: spreadAt(-6) }));
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T11:00:00.000Z", spread: spreadAt(-7) }));
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T12:00:00.000Z", spread: spreadAt(-8) }));

    const history = await getBettingSplitHistoryForGame(store, {
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(history.map((row) => row.spread?.currentHomeLine)).toEqual([-6, -7, -8]);
  });

  it("27. preserves an A -> B -> A move as three entries", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z", spread: spreadAt(-6) }));
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T11:00:00.000Z", spread: spreadAt(-7) }));
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T12:00:00.000Z", spread: spreadAt(-6) }));

    const history = await getBettingSplitHistoryForGame(store, {
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(history.map((row) => row.spread?.currentHomeLine)).toEqual([-6, -7, -6]);
    expect(history[0].firstObservedAt).not.toBe(history[2].firstObservedAt);
  });

  it("does not interpolate missing market blocks", async () => {
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T10:00:00.000Z", total: null }));
    await storeBettingSplitSnapshot(store, nfl({ capturedAt: "2026-09-10T12:00:00.000Z", total: NFL_BETTING_SPLIT_FIXTURE.total }));

    const history = await getBettingSplitHistoryForGame(store, {
      league: "nfl",
      season: 2026,
      jkbGameId: "2026_01_NE_SEA",
    });
    expect(history[0].total).toBeNull();
    expect(history[1].total).not.toBeNull();
  });
});
