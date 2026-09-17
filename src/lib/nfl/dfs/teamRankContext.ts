// DST-view team overall offense/defense rank lookup for the DFS board.
//
// Reuses the single canonical universal current-season OVR/OFF/DEF board
// (src/lib/nfl/currentRating2026.ts, the same source the matchup hero uses
// via heroModelRatings.ts) -- never a second "overall rank" definition, and
// never EPA-only / success-rate-only / fantasy-points-allowed-only.

import type { CurrentRatingBoard } from "@/lib/nfl/currentRating2026";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";

export type DfsTeamRank = {
  /** 1..32, descending by the blended universal current OFF rating. 1 = best offense in the league. */
  offenseRank: number;
  /** 1..32, descending by the blended universal current DEF rating. 1 = best defense in the league. */
  defenseRank: number;
};

/** Keyed by normalized team abbreviation. Empty map when the board has not loaded. */
export function buildDfsTeamRankContext(board: CurrentRatingBoard | null | undefined): ReadonlyMap<string, DfsTeamRank> {
  const map = new Map<string, DfsTeamRank>();
  if (!board) return map;
  for (const team of board.teams) {
    map.set(normalizeNflTeamAbbr(team.abbr), { offenseRank: team.offenseRank, defenseRank: team.defenseRank });
  }
  return map;
}

/** The DST row's own team's overall defense rank. `null` when the board is unavailable for this team. */
export function resolveDfsDefRank(teamRankByAbbr: ReadonlyMap<string, DfsTeamRank>, team: string | null | undefined): number | null {
  if (!team) return null;
  return teamRankByAbbr.get(normalizeNflTeamAbbr(team))?.defenseRank ?? null;
}

/** The DST row's opponent's overall offense rank. `null` when the opponent or board is unavailable. */
export function resolveDfsOppOffRank(teamRankByAbbr: ReadonlyMap<string, DfsTeamRank>, opponent: string | null | undefined): number | null {
  if (!opponent) return null;
  return teamRankByAbbr.get(normalizeNflTeamAbbr(opponent))?.offenseRank ?? null;
}
