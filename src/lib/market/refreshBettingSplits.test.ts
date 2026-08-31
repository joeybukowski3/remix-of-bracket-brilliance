import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBettingSplitsRefresh } from "./refreshBettingSplits";
import { createInMemoryBettingSplitPersistence } from "./bettingSplitsPersistence";
import type { BettingSplitsRefreshStore } from "./refreshBettingSplits";
import type { SportsDataIoClient } from "./providers/sportsDataIoClient";
import type { NflGameRecord } from "../nfl/standings";
import {
  NFL_GAME_BETTING_SPLIT_18001,
  NFL_GAME_BETTING_SPLIT_18002,
  NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD,
} from "./providers/__fixtures__/sportsDataIoWireFixtures";

const NOW = "2026-09-10T16:00:00.000Z";

function gamesDocument(): unknown {
  const base = (over: Partial<NflGameRecord>): NflGameRecord => ({
    gameId: "x",
    season: 2026,
    week: 1,
    seasonType: "REG",
    dateUtc: "2026-09-13T20:25:00.000Z",
    homeTeam: "",
    awayTeam: "",
    homeAbbr: "",
    awayAbbr: "",
    status: "scheduled",
    stadium: null,
    neutralSite: false,
    ...over,
  });
  return {
    games: [
      base({ gameId: "2026_01_NE_SEA", week: 1, homeAbbr: "sea", awayAbbr: "ne" }),
      base({
        gameId: "2026_01_KC_LAC",
        week: 1,
        homeAbbr: "lac",
        awayAbbr: "kc",
        dateUtc: "2026-09-15T00:20:00.000Z",
      }),
      base({ gameId: "2026_02_DAL_NYG", week: 2, homeAbbr: "nyg", awayAbbr: "dal" }),
    ],
  };
}

function fakeClient(): { client: SportsDataIoClient; splitCalls: string[] } {
  const splitCalls: string[] = [];
  return {
    splitCalls,
    client: {
      async getNflScoresByWeek() {
        throw new Error("ScoresByWeek must not be called by the refresh path");
      },
      async getNflPreGameOddsByWeek() {
        return NFL_PRE_GAME_ODDS_BY_WEEK_PAYLOAD;
      },
      async getNflBettingSplitsByScoreId(scoreId: string) {
        splitCalls.push(scoreId);
        if (scoreId === "18001") return NFL_GAME_BETTING_SPLIT_18001;
        if (scoreId === "18002") return NFL_GAME_BETTING_SPLIT_18002;
        throw new Error(`unexpected scoreId ${scoreId}`);
      },
    },
  };
}

function store(): BettingSplitsRefreshStore {
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
    async listAllSnapshots() {
      return adapter.snapshots.slice();
    },
  }) as unknown as BettingSplitsRefreshStore;
}

const tmpDirs: string[] = [];
async function publicRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wu7-refresh-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("runBettingSplitsRefresh", () => {
  it("rejects CFB before any request", async () => {
    await expect(
      runBettingSplitsRefresh({
        // @ts-expect-error deliberately wrong league
        league: "cfb",
        season: 2026,
        week: 1,
        seasonType: "REG",
        dryRun: true,
        client: fakeClient().client,
        store: store(),
        gamesDocument: gamesDocument(),
        publicRoot: "/unused",
      }),
    ).rejects.toThrow(/CFB is not supported/i);
  });

  it("builds the canonical slate from the games document and forwards it to the collector", async () => {
    const fc = fakeClient();
    const report = await runBettingSplitsRefresh({
      league: "nfl",
      season: 2026,
      week: 1,
      seasonType: "REG",
      dryRun: true,
      client: fc.client,
      store: store(),
      gamesDocument: gamesDocument(),
      publicRoot: "/unused",
      now: () => NOW,
    });
    // Week 2 game is excluded; only the two Week 1 canonical games drive fetches.
    expect(report.canonicalGames).toBe(2);
    expect(report.collection.discoveredGames).toBe(3);
    expect(report.collection.candidateGames).toBe(2);
    expect(fc.splitCalls.sort()).toEqual(["18001", "18002"]);
    expect(report.collection.matched).toBe(2);
  });

  it("never calls ScoresByWeek — a refresh succeeds when getNflScoresByWeek throws", async () => {
    const client: SportsDataIoClient = {
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
    const report = await runBettingSplitsRefresh({
      league: "nfl",
      season: 2026,
      week: 1,
      seasonType: "REG",
      dryRun: true,
      client,
      store: store(),
      gamesDocument: gamesDocument(),
      publicRoot: "/unused",
      now: () => NOW,
    });
    expect(report.collection.candidateGames).toBe(2);
    expect(report.collection.matched).toBe(2);
  });

  it("dry-run publishes nothing and writes no private history", async () => {
    const s = store();
    const root = await publicRoot();
    const report = await runBettingSplitsRefresh({
      league: "nfl",
      season: 2026,
      week: 1,
      seasonType: "REG",
      dryRun: true,
      client: fakeClient().client,
      store: s,
      gamesDocument: gamesDocument(),
      publicRoot: root,
      now: () => NOW,
    });
    expect(report.publishSkipped).toBe(true);
    expect(report.publishedGames).toBe(0);
    expect(report.publishedHistoryFiles).toBe(0);
    expect(report.collection.inserted).toBe(0);
    expect(s.snapshots).toHaveLength(0);
    await expect(readFile(join(root, "betting-splits-current.json"))).rejects.toThrow();
  });

  it("a full refresh persists history then publishes public artifacts", async () => {
    const s = store();
    const root = await publicRoot();
    const report = await runBettingSplitsRefresh({
      league: "nfl",
      season: 2026,
      week: 1,
      seasonType: "REG",
      dryRun: false,
      client: fakeClient().client,
      store: s,
      gamesDocument: gamesDocument(),
      publicRoot: root,
      now: () => NOW,
    });
    expect(report.collection.inserted).toBe(2);
    expect(s.snapshots).toHaveLength(2);
    expect(report.publishSkipped).toBe(false);
    expect(report.publishedGames).toBe(2);
    expect(report.publishedHistoryFiles).toBe(2);
    const current = JSON.parse(await readFile(join(root, "betting-splits-current.json"), "utf8"));
    expect(current.games).toHaveLength(2);
  });

  it("a collection failure throws before any public artifact is written", async () => {
    const s = store();
    const root = await publicRoot();
    const brokenClient: SportsDataIoClient = {
      async getNflScoresByWeek() {
        throw new Error("ScoresByWeek must not be called");
      },
      async getNflPreGameOddsByWeek() {
        throw new Error("provider 500");
      },
      async getNflBettingSplitsByScoreId() {
        throw new Error("unreachable");
      },
    };
    await expect(
      runBettingSplitsRefresh({
        league: "nfl",
        season: 2026,
        week: 1,
        seasonType: "REG",
        dryRun: false,
        client: brokenClient,
        store: s,
        gamesDocument: gamesDocument(),
        publicRoot: root,
        now: () => NOW,
      }),
    ).rejects.toThrow(/provider 500/);
    expect(s.snapshots).toHaveLength(0);
    await expect(readFile(join(root, "betting-splits-current.json"))).rejects.toThrow();
  });

  it("uses one clock for capturedAt and generatedAt", async () => {
    const s = store();
    const root = await publicRoot();
    const now = vi.fn(() => NOW);
    await runBettingSplitsRefresh({
      league: "nfl",
      season: 2026,
      week: 1,
      seasonType: "REG",
      dryRun: false,
      client: fakeClient().client,
      store: s,
      gamesDocument: gamesDocument(),
      publicRoot: root,
      now,
    });
    // once for capturedAt (collection), once for generatedAt (publish)
    expect(now.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
