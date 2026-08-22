import { fetchCfbdResearchJson } from "./cfbdClient";
import type { CfbdResearchGameTeamStatsRaw } from "../types";
import type { CfbdWeekBatch } from "./fetchPlays";

export type CfbdTeamGameStatsWeekResult = {
  batch: CfbdWeekBatch;
  data: CfbdResearchGameTeamStatsRaw[];
  url: string;
  remainingCalls: string | null;
  attempts: number;
  failed: boolean;
  error?: string;
};

/**
 * /games/teams requires week, team, or conference — one call per
 * (season, week, seasonType) batch, same partial-failure discipline as
 * fetchPlaysForSeason: per-batch errors are captured, auth failures abort.
 */
export async function fetchTeamGameStatsForSeason(
  season: number,
  batches: readonly CfbdWeekBatch[],
  apiKey: string,
): Promise<CfbdTeamGameStatsWeekResult[]> {
  const results: CfbdTeamGameStatsWeekResult[] = [];
  for (const batch of batches) {
    try {
      const response = await fetchCfbdResearchJson<CfbdResearchGameTeamStatsRaw[]>(
        {
          name: `research-team-game-stats-${season}-${batch.seasonType}-w${batch.week}`,
          path: "/games/teams",
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
      results.push({ batch, data: [], url: "", remainingCalls: null, attempts: 0, failed: true, error: message });
    }
  }
  return results;
}
