import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBettingLineRefresh } from "./refreshBettingLines";
import { createBettingLineFileStore } from "./bettingLineFileStore";
import { writeQuotaState } from "./bettingLineQuotaGuard";
import { BettingLineQuotaFloorError } from "./bettingLineQuotaGuard";
import { resolveTheOddsApiNflTeamId } from "./theOddsApiNflTeamIdentity";
import type { CanonicalBettingGame } from "../gameJoinTypes";
import type { TheOddsApiClient, TheOddsApiQuota } from "../providers/theOddsApiClient";
import { THE_ODDS_API_NFL_ODDS_FIXTURE } from "../providers/__fixtures__/theOddsApiWireFixtures";

let stateRoot: string;
let publicRoot: string;
let idCounter = 0;

beforeEach(async () => {
  idCounter = 0;
  stateRoot = await mkdtemp(join(tmpdir(), "betting-lines-refresh-state-"));
  publicRoot = await mkdtemp(join(tmpdir(), "betting-lines-refresh-public-"));
});
afterEach(async () => {
  await rm(stateRoot, { recursive: true, force: true });
  await rm(publicRoot, { recursive: true, force: true });
});

const QUOTA: TheOddsApiQuota = { remaining: 431, used: 69, lastCost: 3 };

function fakeClient(
  events: unknown = THE_ODDS_API_NFL_ODDS_FIXTURE,
  quota: TheOddsApiQuota = QUOTA,
): { client: TheOddsApiClient; calls: () => number } {
  const spy = vi.fn(async () => ({ sportKey: "americanfootball_nfl", events, quota }));
  return { client: { getCurrentOdds: spy }, calls: () => spy.mock.calls.length };
}

const CANONICAL_GAMES: CanonicalBettingGame[] = [
  {
    league: "nfl",
    season: 2026,
    week: 1,
    jkbGameId: "2026_01_NE_SEA",
    awayTeamId: "ne",
    homeTeamId: "sea",
    kickoffUtc: "2026-09-07T17:00:00.000Z",
    neutralSite: false,
  },
  {
    league: "nfl",
    season: 2026,
    week: 1,
    jkbGameId: "2026_01_LAR_SF",
    awayTeamId: "lar",
    homeTeamId: "sf",
    kickoffUtc: "2026-09-07T20:25:00.000Z",
    neutralSite: false,
  },
];

function baseInput(store: ReturnType<typeof createBettingLineFileStore>, client: TheOddsApiClient) {
  return {
    league: "nfl" as const,
    season: 2026,
    week: 1 as number | null,
    client,
    store,
    canonicalGames: CANONICAL_GAMES,
    resolveTeam: resolveTheOddsApiNflTeamId,
    stateRoot,
    publicRoot,
    now: () => "2026-09-01T06:00:00.000Z",
    idFactory: () => `id-${(idCounter += 1)}`,
    logger: { info: () => {}, warn: () => {} },
  };
}

describe("runBettingLineRefresh", () => {
  it("dry-run: one provider request, no private or public write", async () => {
    const store = createBettingLineFileStore({ rootDir: stateRoot });
    const { client, calls } = fakeClient();
    const report = await runBettingLineRefresh({ ...baseInput(store, client), dryRun: true });

    expect(calls()).toBe(1);
    expect(report.bookmakerRows).toBe(3);
    expect(report.matchedGames).toBe(2);
    expect(report.inserted).toBe(0);
    expect(report.quotaRemaining).toBe(431);
    expect(report.publishSkipped).toBe(true);

    await expect(stat(join(publicRoot, "betting-lines-current.json"))).rejects.toThrow();
    await expect(stat(join(stateRoot, "quota-state.json"))).rejects.toThrow();
  });

  it("non-dry: persists changed snapshots and publishes artifacts", async () => {
    const store = createBettingLineFileStore({ rootDir: stateRoot });
    const { client } = fakeClient();
    const report = await runBettingLineRefresh({ ...baseInput(store, client), dryRun: false });

    expect(report.inserted).toBe(3);
    expect(report.publishedGames).toBeGreaterThan(0);

    const current = JSON.parse(
      await readFile(join(publicRoot, "betting-lines-current.json"), "utf8"),
    );
    expect(current.schemaVersion).toBe("jkb-betting-lines-current-v1");
    expect(current.games).toHaveLength(2);
    expect(JSON.stringify(current)).not.toContain("bookmakers");

    const quotaState = JSON.parse(await readFile(join(stateRoot, "quota-state.json"), "utf8"));
    expect(quotaState.remaining).toBe(431);
  });

  it("re-running with the same lines extends rather than inserting", async () => {
    const store = createBettingLineFileStore({ rootDir: stateRoot });
    await runBettingLineRefresh({ ...baseInput(store, fakeClient().client), dryRun: false });
    const second = await runBettingLineRefresh({
      ...baseInput(store, fakeClient().client),
      dryRun: false,
      now: () => "2026-09-02T06:00:00.000Z",
    });
    expect(second.inserted).toBe(0);
    expect(second.extended + second.unchanged).toBe(3);
  });

  it("refuses to spend when the last run left quota below the floor", async () => {
    const store = createBettingLineFileStore({ rootDir: stateRoot });
    await writeQuotaState(
      stateRoot,
      { remaining: 12, used: 488, lastCost: 3 },
      "nfl",
      () => "2026-08-31T06:00:00.000Z",
    );
    const { client, calls } = fakeClient();
    await expect(
      runBettingLineRefresh({ ...baseInput(store, client), dryRun: true }),
    ).rejects.toBeInstanceOf(BettingLineQuotaFloorError);
    expect(calls()).toBe(0);
  });

  it("--allow-low-quota overrides the floor guard", async () => {
    const store = createBettingLineFileStore({ rootDir: stateRoot });
    await writeQuotaState(
      stateRoot,
      { remaining: 12, used: 488, lastCost: 3 },
      "nfl",
      () => "2026-08-31T06:00:00.000Z",
    );
    const { client, calls } = fakeClient();
    const report = await runBettingLineRefresh({
      ...baseInput(store, client),
      dryRun: true,
      allowLowQuota: true,
    });
    expect(calls()).toBe(1);
    expect(report.bookmakerRows).toBe(3);
  });

  it("a provider failure publishes no partial artifact", async () => {
    const store = createBettingLineFileStore({ rootDir: stateRoot });
    const client: TheOddsApiClient = {
      getCurrentOdds: vi.fn(async () => {
        throw new Error("provider down");
      }),
    };
    await expect(
      runBettingLineRefresh({ ...baseInput(store, client), dryRun: false }),
    ).rejects.toThrow("provider down");
    await expect(stat(join(publicRoot, "betting-lines-current.json"))).rejects.toThrow();
  });
});
