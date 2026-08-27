/**
 * Derives the set of Week 1 scheduled games from the current-week projection
 * rows themselves (`gameId`/`kickoff`/`team`/`opponent`/`homeAway`, all
 * already sourced from the canonical nflverse schedule at generation time --
 * see `NflCurrentWeekRowIdentity`). Pure presentation-derivation only: no
 * game is invented or hardcoded, and no projection/model field is read.
 */
import type { NflCurrentWeekProjectionRow } from "../types/currentWeekProjection";

export type NflYardageWeekMatchup = {
  gameId: string;
  kickoff: string | null;
  homeAbbr: string;
  awayAbbr: string;
};

type MatchupSourceRow = Pick<NflCurrentWeekProjectionRow, "gameId" | "kickoff" | "team" | "opponent" | "homeAway">;

/** One pill per distinct `gameId`, ordered by kickoff (earliest first, undated games last), gameId as a deterministic tiebreak. */
export function buildYardageWeekMatchups(rows: readonly MatchupSourceRow[]): NflYardageWeekMatchup[] {
  const byGame = new Map<string, NflYardageWeekMatchup>();
  for (const row of rows) {
    if (byGame.has(row.gameId)) continue;
    const homeAbbr = row.homeAway === "home" ? row.team : row.opponent;
    const awayAbbr = row.homeAway === "home" ? row.opponent : row.team;
    byGame.set(row.gameId, { gameId: row.gameId, kickoff: row.kickoff ?? null, homeAbbr, awayAbbr });
  }
  return [...byGame.values()].sort((a, b) => {
    const kickoffA = a.kickoff ? Date.parse(a.kickoff) : Number.POSITIVE_INFINITY;
    const kickoffB = b.kickoff ? Date.parse(b.kickoff) : Number.POSITIVE_INFINITY;
    if (kickoffA !== kickoffB) return kickoffA - kickoffB;
    return a.gameId.localeCompare(b.gameId);
  });
}
