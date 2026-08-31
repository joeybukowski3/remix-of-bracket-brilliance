import { describe, expect, it, vi } from "vitest";
import { runBettingSplitsCollection } from "./collectBettingSplits";
import { createInMemoryBettingSplitPersistence } from "./bettingSplitsPersistence";
import type { BettingSplitsCollectionStore } from "./collectBettingSplits";
import type { SportsDataIoClient } from "./providers/sportsDataIoClient";
import type { NflGameRecord } from "../nfl/standings";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  NFL_GAME_BETTING_SPLIT_18001,
  NFL_GAME_BETTING_SPLIT_18002,
  NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD,
} from "./providers/__fixtures__/sportsDataIoWireFixtures";

const CAPTURED_AT = "2026-09-10T16:00:00.000Z";

function canonicalSchedule(): NflGameRecord[] {
  return [
    {
      gameId: "2026_01_NE_SEA",
      season: 2026,
      week: 1,
      seasonType: "REG",
      dateUtc: "2026-09-13T20:25:00.000Z",
      homeTeam: "Seattle Seahawks",
      awayTeam: "New England Patriots",
      homeAbbr: "sea",
      awayAbbr: "ne",
      status: "scheduled",
      stadium: "Lumen Field",
      neutralSite: false,
    },
    {
      gameId: "2026_01_KC_LAC",
      season: 2026,
      week: 1,
      seasonType: "REG",
      dateUtc: "2026-09-15T00:20:00.000Z",
      homeTeam: "Los Angeles Chargers",
      awayTeam: "Kansas City Chiefs",
      homeAbbr: "lac",
      awayAbbr: "kc",
      status: "scheduled",
      stadium: "SoFi Stadium",
      neutralSite: false,
    },
  ];
}

function fakeClient(overrides: Partial<Record<string, unknown>> = {}): {
  client: SportsDataIoClient;
  scoresCalls: number;
  splitCalls: string[];
} {
  const state = { scoresCalls: 0, splitCalls: [] as string[] };
  const client: SportsDataIoClient = {
    async getNflScoresByWeek() {
      throw new Error("ScoresByWeek must not be called by the betting-splits refresh path");
    },
    async getNflPreGameOddsByWeek() {
      state.scoresCalls += 1;
      return (overrides.schedule as unknown) ?? NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD;
    },
    async getNflBettingSplitsByScoreId(scoreId: string) {
      state.splitCalls.push(scoreId);
      if (scoreId === "18001") return NFL_GAME_BETTING_SPLIT_18001;
      if (scoreId === "18002") return NFL_GAME_BETTING_SPLIT_18002;
      throw new Error(`unexpected scoreId ${scoreId}`);
    },
  };
  return { client, get scoresCalls() { return state.scoresCalls; }, get splitCalls() { return state.splitCalls; } };
}

function collectionStore(): BettingSplitsCollectionStore {
  const adapter = createInMemoryBettingSplitPersistence();
  return Object.assign(adapter, {
    async listAllCrosswalks() {
      return adapter.crosswalks.map((row) => ({
        league: row.league,
        provider: row.provider,
        providerGameId: row.providerGameId,
        jkbGameId: row.jkbGameId,
      }));
    },
  });
}

describe("runBettingSplitsCollection", () => {
  it("rejects a non-NFL league", async () => {
    const { client } = fakeClient();
    await expect(
      runBettingSplitsCollection({
        league: "cfb",
        season: 2026,
        seasonType: "REG",
        week: 1,
        dryRun: false,
        client,
        canonicalGames: [],
        store: collectionStore(),
        capturedAt: CAPTURED_AT,
      }),
    ).rejects.toThrow(/CFB betting-splits collection is not implemented/i);
  });

  it("first run with an empty crosswalk: discover -> match -> fetch -> persist snapshot + crosswalk", async () => {
    const fc = fakeClient();
    const store = collectionStore();
    const report = await runBettingSplitsCollection({
      league: "nfl",
      season: 2026,
      seasonType: "REG",
      week: 1,
      dryRun: false,
      client: fc.client,
      canonicalGames: canonicalSchedule(),
      store,
      capturedAt: CAPTURED_AT,
    });

    expect(report.discoveredGames).toBe(3);
    expect(report.candidateGames).toBe(2); // DAL@NYG off-slate excluded
    expect(fc.splitCalls.sort()).toEqual(["18001", "18002"]);
    expect(report.matched).toBe(2);
    expect(report.inserted).toBe(2);
    expect(report.extended).toBe(0);
    expect(report.crosswalkInserted).toBe(2);
    expect(store.snapshots).toHaveLength(2);
    expect(store.crosswalks).toHaveLength(2);
    // canonical week is persisted, never a provider week override
    expect(store.snapshots.every((s) => s.week === 1)).toBe(true);
    expect(store.snapshots.map((s) => s.jkbGameId).sort()).toEqual([
      "2026_01_KC_LAC",
      "2026_01_NE_SEA",
    ]);
  });

  it("does not request splits for an off-slate provider game", async () => {
    const fc = fakeClient();
    await runBettingSplitsCollection({
      league: "nfl",
      season: 2026,
      seasonType: "REG",
      week: 1,
      dryRun: true,
      client: fc.client,
      canonicalGames: canonicalSchedule(),
      store: collectionStore(),
      capturedAt: CAPTURED_AT,
    });
    expect(fc.splitCalls).not.toContain("18003");
  });

  it("second run with unchanged state extends; changed state inserts", async () => {
    const store = collectionStore();
    const base = {
      league: "nfl" as const,
      season: 2026,
      seasonType: "REG" as const,
      week: 1,
      dryRun: false,
      canonicalGames: canonicalSchedule(),
      store,
    };
    await runBettingSplitsCollection({ ...base, client: fakeClient().client, capturedAt: CAPTURED_AT });

    // Unchanged fixtures, later capture -> extend, reuse crosswalk.
    const second = await runBettingSplitsCollection({
      ...base,
      client: fakeClient().client,
      capturedAt: "2026-09-10T17:00:00.000Z",
    });
    expect(second.extended).toBe(2);
    expect(second.inserted).toBe(0);
    expect(second.crosswalkInserted).toBe(0);
    expect(second.crosswalkVerified).toBe(2);
    expect(store.snapshots).toHaveLength(2);

    // Changed money percentage -> new historical row.
    const mutated = structuredClone(NFL_GAME_BETTING_SPLIT_18001);
    mutated.BettingMarketSplits[0].BettingSplits[0].MoneyPercentage = 71;
    const changedClient: SportsDataIoClient = {
      async getNflScoresByWeek() {
        throw new Error("ScoresByWeek must not be called");
      },
      async getNflPreGameOddsByWeek() {
        return NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD;
      },
      async getNflBettingSplitsByScoreId(scoreId: string) {
        return scoreId === "18001" ? mutated : NFL_GAME_BETTING_SPLIT_18002;
      },
    };
    const third = await runBettingSplitsCollection({
      ...base,
      client: changedClient,
      capturedAt: "2026-09-10T18:00:00.000Z",
    });
    expect(third.inserted).toBe(1);
    expect(third.extended).toBe(1);
    expect(store.snapshots).toHaveLength(3);
  });

  it("dry-run writes nothing but still reports matches", async () => {
    const store = collectionStore();
    const report = await runBettingSplitsCollection({
      league: "nfl",
      season: 2026,
      seasonType: "REG",
      week: 1,
      dryRun: true,
      client: fakeClient().client,
      canonicalGames: canonicalSchedule(),
      store,
      capturedAt: CAPTURED_AT,
    });
    expect(report.matched).toBe(2);
    expect(report.inserted).toBe(0);
    expect(report.crosswalkInserted).toBe(0);
    expect(store.snapshots).toHaveLength(0);
    expect(store.crosswalks).toHaveLength(0);
    expect(report.qa.some((q) => q.outcome === "dry-run:skipped")).toBe(true);
  });

  it("does not persist an unmatched normalized event", async () => {
    const store = collectionStore();
    // Canonical slate missing KC@LAC entirely.
    const report = await runBettingSplitsCollection({
      league: "nfl",
      season: 2026,
      seasonType: "REG",
      week: 1,
      dryRun: false,
      client: fakeClient().client,
      canonicalGames: [canonicalSchedule()[0]],
      store,
      capturedAt: CAPTURED_AT,
    });
    expect(report.matched).toBe(1);
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0].jkbGameId).toBe("2026_01_NE_SEA");
  });

  it("continues past a per-game split fetch failure", async () => {
    const store = collectionStore();
    const flakyClient: SportsDataIoClient = {
      async getNflScoresByWeek() {
        throw new Error("ScoresByWeek must not be called");
      },
      async getNflPreGameOddsByWeek() {
        return NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD;
      },
      async getNflBettingSplitsByScoreId(scoreId: string) {
        if (scoreId === "18001") throw new Error("HTTP 500");
        return NFL_GAME_BETTING_SPLIT_18002;
      },
    };
    const report = await runBettingSplitsCollection({
      league: "nfl",
      season: 2026,
      seasonType: "REG",
      week: 1,
      dryRun: false,
      client: flakyClient,
      canonicalGames: canonicalSchedule(),
      store,
      capturedAt: CAPTURED_AT,
    });
    expect(report.splitRequests).toBe(2);
    expect(report.matched).toBe(1);
    expect(report.qa.some((q) => q.stage === "fetch-failed")).toBe(true);
  });

  it("reports a canonical game with no pre-game odds as provider-discovery-missing (non-fatal)", async () => {
    const store = collectionStore();
    const withExtraGame: NflGameRecord[] = [
      ...canonicalSchedule(),
      {
        gameId: "2026_01_BUF_MIA",
        season: 2026,
        week: 1,
        seasonType: "REG",
        dateUtc: "2026-09-13T17:00:00.000Z",
        homeTeam: "Miami Dolphins",
        awayTeam: "Buffalo Bills",
        homeAbbr: "mia",
        awayAbbr: "buf",
        status: "scheduled",
        stadium: "Hard Rock Stadium",
        neutralSite: false,
      },
    ];
    const report = await runBettingSplitsCollection({
      league: "nfl",
      season: 2026,
      seasonType: "REG",
      week: 1,
      dryRun: true,
      client: fakeClient().client,
      canonicalGames: withExtraGame,
      store,
      capturedAt: CAPTURED_AT,
    });
    expect(report.providerDiscoveryMissing).toBe(1);
    expect(report.matched).toBe(2);
    expect(
      report.qa.some(
        (q) => q.outcome === "provider-discovery-missing" && q.jkbGameId === "2026_01_BUF_MIA",
      ),
    ).toBe(true);
  });

  it("reports a discovered provider game with no canonical match as provider-discovered-unmatched", async () => {
    // NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD carries an off-slate DAL @ NYG (18003).
    const report = await runBettingSplitsCollection({
      league: "nfl",
      season: 2026,
      seasonType: "REG",
      week: 1,
      dryRun: true,
      client: fakeClient().client,
      canonicalGames: canonicalSchedule(),
      store: collectionStore(),
      capturedAt: CAPTURED_AT,
    });
    expect(report.providerDiscoveredUnmatched).toBe(1);
    expect(report.providerDiscoveryMissing).toBe(0);
    expect(
      report.qa.some(
        (q) => q.outcome === "provider-discovered-unmatched" && q.providerGameId === "18003",
      ),
    ).toBe(true);
  });

  it("discovery never references or calls ScoresByWeek in the refresh path", async () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "collectBettingSplits.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/getNflScoresByWeek|ScoresByWeek|decodeSportsDataIoNflSchedule/);

    const throwingClient: SportsDataIoClient = {
      async getNflScoresByWeek() {
        throw new Error("ScoresByWeek called");
      },
      async getNflPreGameOddsByWeek() {
        return NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD;
      },
      async getNflBettingSplitsByScoreId(scoreId: string) {
        return scoreId === "18001" ? NFL_GAME_BETTING_SPLIT_18001 : NFL_GAME_BETTING_SPLIT_18002;
      },
    };
    const report = await runBettingSplitsCollection({
      league: "nfl",
      season: 2026,
      seasonType: "REG",
      week: 1,
      dryRun: true,
      client: throwingClient,
      canonicalGames: canonicalSchedule(),
      store: collectionStore(),
      capturedAt: CAPTURED_AT,
    });
    expect(report.candidateGames).toBe(2);
  });

  it("produces a run report with startedAt/finishedAt and stable counters", async () => {
    const report = await runBettingSplitsCollection({
      league: "nfl",
      season: 2026,
      seasonType: "REG",
      week: 1,
      dryRun: true,
      client: fakeClient().client,
      canonicalGames: canonicalSchedule(),
      store: collectionStore(),
      capturedAt: CAPTURED_AT,
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    expect(Date.parse(report.startedAt)).not.toBeNaN();
    expect(Date.parse(report.finishedAt)).not.toBeNaN();
    expect(report.providerRows).toBe(10); // 18001: 6 rows, 18002: 4 rows
    expect(report.normalizedEvents).toBe(2);
  });
});
