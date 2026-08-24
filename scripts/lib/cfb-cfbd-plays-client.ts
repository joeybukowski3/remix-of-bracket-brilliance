// CFB Model V2 — production-owned CFBD /plays fetch client (WU5 §3/§17).
// Mirrors src/lib/cfb/research/ingestion/fetchPlays.ts's batching shape
// (one call per (season, week, seasonType) — /plays requires a week param
// and returns HTTP 400 on year-only requests) but is production-owned: it
// uses scripts/lib/cfb-cfbd-client.ts, never research's ingestion/cfbdClient.ts,
// so production's raw-data fetch pipeline has zero runtime dependency on
// src/lib/cfb/research/**.

import { fetchCfbdJson, type CfbdRequest } from "./cfb-cfbd-client";
import type { CfbdGame } from "../../src/lib/cfb/pipeline/types";

export type CfbdPlaysWeekBatch = { week: number; seasonType: CfbdGame["seasonType"] };

/**
 * Derives the exact (week, seasonType) pairs that have games for this
 * season — no fixed 1-17 assumption, so Week 0 and postseason are picked
 * up automatically whenever they're present in the schedule, and no
 * request is wasted on a week that doesn't exist.
 */
export function playsWeekBatchesFromGames(games: readonly CfbdGame[]): CfbdPlaysWeekBatch[] {
  const batches = new Map<string, CfbdPlaysWeekBatch>();
  for (const game of games) {
    if (!Number.isInteger(game.week)) continue;
    batches.set(`${game.seasonType}:${game.week}`, { week: game.week, seasonType: game.seasonType });
  }
  return [...batches.values()].sort((a, b) => a.seasonType.localeCompare(b.seasonType) || a.week - b.week);
}

export type CfbdPlayRaw = {
  id: string;
  gameId: number;
  offense: string;
  defense: string;
  ppa?: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/** Minimum gap between successive /plays calls — a full season is 15-17+ weekly batches, enough to trip CFBD's short-window rate limit if fired back-to-back with zero pacing. */
const INTER_BATCH_DELAY_MS = 600;

/**
 * Fetches every play for the given (season, batches) — one CFBD call per
 * (week, seasonType) batch, paced by INTER_BATCH_DELAY_MS to stay under
 * CFBD's short-window rate limit, aggregated into a single array. A batch
 * that fails aborts the whole fetch (this module treats `plays-{season}`
 * as one atomic unit, same as fetchGameTeamStats in cfb-fetch-data.ts) —
 * intentionally stricter than research's fetchPlays.ts, which tolerates
 * per-batch failures for exploratory backfills; production's fail-closed
 * requirement (WU5 §15) means a partial plays fetch must not silently
 * pass as complete.
 */
export async function fetchPlaysForSeason(
  season: number,
  batches: readonly CfbdPlaysWeekBatch[],
  apiKey: string,
): Promise<{ data: CfbdPlayRaw[]; urls: string[]; remainingCalls: string | null }> {
  const byPlayId = new Map<string, CfbdPlayRaw>();
  const urls: string[] = [];
  let remainingCalls: string | null = null;
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    if (i > 0) await sleep(INTER_BATCH_DELAY_MS);
    const request: CfbdRequest = {
      name: `plays-${season}-${batch.seasonType}-w${batch.week}`,
      path: "/plays",
      query: { year: season, week: batch.week, seasonType: batch.seasonType },
    };
    const response = await fetchCfbdJson<CfbdPlayRaw[]>(request, apiKey);
    for (const play of response.data) byPlayId.set(play.id, play);
    urls.push(response.url);
    remainingCalls = response.remainingCalls;
  }
  return { data: [...byPlayId.values()], urls, remainingCalls };
}
