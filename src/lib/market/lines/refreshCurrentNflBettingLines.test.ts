import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshCurrentNflBettingLines } from "./refreshCurrentNflBettingLines";
import { createBettingLineFileStore } from "./bettingLineFileStore";
import { writeQuotaState, BettingLineQuotaFloorError } from "./bettingLineQuotaGuard";
import type { NflGameRecord } from "../../nfl/standings";
import type { TheOddsApiClient, TheOddsApiQuota } from "../providers/theOddsApiClient";
import { THE_ODDS_API_NFL_ODDS_FIXTURE } from "../providers/__fixtures__/theOddsApiWireFixtures";

let stateRoot: string;
let publicRoot: string;

beforeEach(async () => {
  stateRoot = await mkdtemp(join(tmpdir(), "wu9-state-"));
  publicRoot = await mkdtemp(join(tmpdir(), "wu9-public-"));
});
afterEach(async () => {
  await rm(stateRoot, { recursive: true, force: true });
  await rm(publicRoot, { recursive: true, force: true });
});

const QUOTA: TheOddsApiQuota = { remaining: 431, used: 69, lastCost: 3 };

function fakeClient(quota: TheOddsApiQuota = QUOTA): {
  client: TheOddsApiClient;
  calls: () => number;
} {
  const spy = vi.fn(async () => ({
    sportKey: "americanfootball_nfl",
    events: THE_ODDS_API_NFL_ODDS_FIXTURE,
    quota,
  }));
  return { client: { getCurrentOdds: spy }, calls: () => spy.mock.calls.length };
}

function game(overrides: Partial<NflGameRecord>): NflGameRecord {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    seasonType: "REG",
    dateUtc: "2026-09-07T17:00:00.000Z",
    homeTeam: "Seattle Seahawks",
    awayTeam: "New England Patriots",
    homeAbbr: "sea",
    awayAbbr: "ne",
    status: "scheduled",
    stadium: "Lumen Field",
    neutralSite: false,
    ...overrides,
  };
}

const WEEK_1_DOC = {
  games: [
    game({ gameId: "2026_01_NE_SEA", homeAbbr: "sea", awayAbbr: "ne" }),
    game({
      gameId: "2026_01_LAR_SF",
      homeAbbr: "sf",
      awayAbbr: "lar",
      homeTeam: "San Francisco 49ers",
      awayTeam: "LA Rams",
      dateUtc: "2026-09-07T20:25:00.000Z",
    }),
  ],
};

function deps(overrides: Partial<Parameters<typeof refreshCurrentNflBettingLines>[0]> = {}) {
  return {
    gamesDocuments: [WEEK_1_DOC] as readonly unknown[],
    scheduleSource: "test",
    createClient: () => fakeClient().client,
    store: createBettingLineFileStore({ rootDir: stateRoot }),
    stateRoot,
    publicRoot,
    dryRun: true,
    now: () => "2026-09-01T10:00:00.000Z",
    nowUtc: "2026-09-01T10:00:00.000Z",
    logger: { info: () => {}, warn: () => {} },
    ...overrides,
  };
}

describe("refreshCurrentNflBettingLines", () => {
  it("forwards the resolved week to the existing refresh", async () => {
    const { client, calls } = fakeClient();
    const result = await refreshCurrentNflBettingLines(
      deps({ createClient: () => client, dryRun: true }),
    );
    expect(calls()).toBe(1);
    expect(result.status).toBe("refreshed");
    if (result.status !== "refreshed") return;
    expect(result.slate).toMatchObject({ season: 2026, week: 1, seasonType: "REG" });
    expect(result.report).toMatchObject({ league: "nfl", season: 2026, week: 1 });
    expect(result.report.matchedGames).toBe(2);
  });

  it("no upcoming slate ⇒ provider is never constructed or called", async () => {
    const createClient = vi.fn(() => {
      throw new Error("provider must not be constructed in the offseason");
    });
    const result = await refreshCurrentNflBettingLines(
      deps({
        createClient: createClient as unknown as () => TheOddsApiClient,
        nowUtc: "2027-05-01T10:00:00.000Z",
      }),
    );
    expect(result.status).toBe("no-slate");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("propagates a provider failure", async () => {
    const createClient = () =>
      ({
        getCurrentOdds: vi.fn(async () => {
          throw new Error("The Odds API 429");
        }),
      }) as unknown as TheOddsApiClient;
    await expect(
      refreshCurrentNflBettingLines(deps({ createClient })),
    ).rejects.toThrow(/429/);
  });

  it("preserves the WU8 quota guard (default floor, no override)", async () => {
    await writeQuotaState(
      stateRoot,
      { remaining: 10, used: 490, lastCost: 3 },
      "nfl",
      () => "2026-08-31T10:00:00.000Z",
    );
    const createClient = vi.fn(() => fakeClient().client);
    await expect(
      refreshCurrentNflBettingLines(
        deps({ createClient: createClient as unknown as () => TheOddsApiClient }),
      ),
    ).rejects.toBeInstanceOf(BettingLineQuotaFloorError);
  });

  it("never references CFB / SportsDataIO / betting-splits in its source", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/market/lines/refreshCurrentNflBettingLines.ts"),
      "utf8",
    );
    // No college-football or alternate-provider code paths.
    expect(source).not.toMatch(/ncaaf|americanfootball_ncaaf|sportsDataIo|--league cfb/i);
    expect(source).not.toMatch(/collect-betting-splits|refresh-betting-splits|runBettingSplitsCollection/);
    // Quota guard must never be overridden by this path.
    expect(source).not.toContain("allowLowQuota: true");
    expect(source).toContain("allowLowQuota: false");
  });
});
