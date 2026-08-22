import { fetchCfbdResearchJson, type CfbdResearchResponse } from "./cfbdClient";
import type { CfbdResearchGameRaw, CfbdResearchPlayRaw, CfbdResearchSeasonType } from "../types";

export type CfbdWeekBatch = { week: number; seasonType: CfbdResearchSeasonType };

/** Derives the exact (week, seasonType) pairs that have games — no fixed 1-17 assumption. */
export function weekBatchesFromGames(games: readonly CfbdResearchGameRaw[]): CfbdWeekBatch[] {
  const batches = new Map<string, CfbdWeekBatch>();
  for (const game of games) {
    if (!Number.isInteger(game.week)) continue;
    batches.set(`${game.seasonType}:${game.week}`, { week: game.week, seasonType: game.seasonType });
  }
  return [...batches.values()].sort(
    (a, b) => a.seasonType.localeCompare(b.seasonType) || a.week - b.week,
  );
}

export type CfbdPlaysWeekResult = {
  batch: CfbdWeekBatch;
  data: CfbdResearchPlayRaw[];
  url: string;
  remainingCalls: string | null;
  attempts: number;
  failed: boolean;
  error?: string;
};

/**
 * /plays requires a week param — CFBD returns HTTP 400 on year-only
 * requests. One call per (season, week, seasonType) batch; failures are
 * captured per-batch rather than aborting the whole season, so partial
 * seasons are reported explicitly instead of silently marked complete.
 */
export async function fetchPlaysForSeason(
  season: number,
  batches: readonly CfbdWeekBatch[],
  apiKey: string,
): Promise<CfbdPlaysWeekResult[]> {
  const results: CfbdPlaysWeekResult[] = [];
  for (const batch of batches) {
    try {
      const response = await fetchCfbdResearchJson<CfbdResearchPlayRaw[]>(
        {
          name: `research-plays-${season}-${batch.seasonType}-w${batch.week}`,
          path: "/plays",
          query: { year: season, week: batch.week, seasonType: batch.seasonType },
        },
        apiKey,
      );
      results.push({
        batch,
        data: response.data,
        url: response.url,
        remainingCalls: response.remainingCalls,
        attempts: response.attempts,
        failed: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/authentication failed/.test(message)) throw error;
      results.push({
        batch,
        data: [],
        url: "",
        remainingCalls: null,
        attempts: 0,
        failed: true,
        error: message,
      });
    }
  }
  return results;
}
