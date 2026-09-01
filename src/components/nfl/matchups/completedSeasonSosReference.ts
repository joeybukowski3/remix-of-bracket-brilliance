import { deriveStandings, type CanonicalNflTeam, type NflResultRecord } from "@/lib/nfl/standings";

export type CompletedSeasonSosReference = {
  season: number;
  opponentWinPct: number | null;
  rank: number | null;
  games: number;
};

/**
 * Presentation-only completed-season schedule context.
 *
 * Each regular-season opponent contributes its completed-season win percentage
 * once per game played. The result is deliberately not exported through a
 * model resolver and is never consumed by ratings, projections, or category
 * advantage code.
 */
export function buildCompletedSeasonSosReferences(
  results: readonly NflResultRecord[] | null | undefined,
  teams: readonly CanonicalNflTeam[] | null | undefined,
  season: number
): Map<string, CompletedSeasonSosReference> {
  const seasonResults = (results ?? []).filter(
    (result) => result.season === season && result.seasonType === "REG" && result.final
  );
  const standings = deriveStandings(seasonResults, [...(teams ?? [])]);
  const winPctByAbbr = new Map(standings.map((standing) => [standing.abbr, standing.winPct]));
  const opponentPcts = new Map<string, number[]>();

  for (const result of seasonResults) {
    const homeOpponentPct = winPctByAbbr.get(result.awayAbbr);
    const awayOpponentPct = winPctByAbbr.get(result.homeAbbr);
    if (homeOpponentPct != null) {
      opponentPcts.set(result.homeAbbr, [...(opponentPcts.get(result.homeAbbr) ?? []), homeOpponentPct]);
    }
    if (awayOpponentPct != null) {
      opponentPcts.set(result.awayAbbr, [...(opponentPcts.get(result.awayAbbr) ?? []), awayOpponentPct]);
    }
  }

  const values = (teams ?? []).map((team) => {
    const samples = opponentPcts.get(team.abbr) ?? [];
    const opponentWinPct = samples.length
      ? samples.reduce((total, value) => total + value, 0) / samples.length
      : null;
    return { teamAbbr: team.abbr, opponentWinPct, games: samples.length };
  });
  const ranked = values
    .filter((row): row is typeof row & { opponentWinPct: number } => row.opponentWinPct != null)
    .sort((a, b) => b.opponentWinPct - a.opponentWinPct || a.teamAbbr.localeCompare(b.teamAbbr));

  const result = new Map<string, CompletedSeasonSosReference>();
  for (const row of values) {
    const rank = row.opponentWinPct == null
      ? null
      : ranked.findIndex((candidate) => candidate.opponentWinPct === row.opponentWinPct) + 1;
    result.set(row.teamAbbr, {
      season,
      opponentWinPct: row.opponentWinPct,
      rank,
      games: row.games,
    });
  }
  return result;
}
