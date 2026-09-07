import type { NflSeasonData } from "@/hooks/useNflSeasonData";

export const COMPARISON_RESULTS_PATH = "/data/nfl/2026/results.json";
export type ComparisonCompletedGames = {
  generatedAt: string;
  version: string;
  source: string;
  byTeam: ReadonlyMap<string, readonly string[]>;
};

/** Missing/malformed results are unknown, never an invented zero-game sample. */
export function comparisonCompletedGames(data: NflSeasonData | null): ComparisonCompletedGames | null {
  if (!data || !Array.isArray(data.teams) || !Array.isArray(data.results) || data.resultsMeta?.season !== 2026 || !Number.isFinite(Date.parse(data.resultsMeta.generatedAt))) return null;
  const byTeam = new Map(data.teams.map((team) => [team.abbr, [] as string[]]));
  if (byTeam.size !== 32) return null;
  const seen = new Set<string>();
  for (const game of data.results) {
    if (game.season !== 2026 || game.seasonType !== "REG" || game.final !== true) continue;
    if (!game.gameId || seen.has(game.gameId) || !byTeam.has(game.homeAbbr) || !byTeam.has(game.awayAbbr) ||
        game.homeAbbr === game.awayAbbr || !Number.isFinite(game.homeScore) || !Number.isFinite(game.awayScore)) return null;
    seen.add(game.gameId);
    byTeam.get(game.homeAbbr)!.push(game.gameId);
    byTeam.get(game.awayAbbr)!.push(game.gameId);
  }
  for (const ids of byTeam.values()) ids.sort();
  return { byTeam, generatedAt: data.resultsMeta.generatedAt, version: data.resultsMeta.schemaVersion, source: COMPARISON_RESULTS_PATH };
}
