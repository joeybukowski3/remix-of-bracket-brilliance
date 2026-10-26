/**
 * Season-to-date production for the private preview board, from the same player-game rows the projection uses.
 *
 * Only completed games dated strictly before the upcoming matchup count (the leakage gate `selectPriorGames` every pregame
 * feature uses), and a game in which the player did not play, or played zero minutes, never counts: the import has no such
 * rows, and any that slipped in are dropped here too. The current season is every competitive game of this season so far; the
 * previous season is its regular season. The two are returned apart and never added together.
 *
 * The rows are hoopR/ESPN-derived: the result goes only into a private preview board (privatePreview.ts), never the public one.
 */
import { selectPriorGames } from "../features";
import { previousSeason } from "../seasonType";
import type { SeasonStatsView, SeasonTotals } from "../seasonStats";
import type { NbaPlayerGame } from "../types";

function totalsOf(season: string, rows: readonly NbaPlayerGame[]): SeasonTotals | null {
  if (rows.length === 0) return null;
  return {
    season,
    games: rows.length,
    minutes: rows.reduce((sum, r) => sum + r.minutes, 0),
    pts: rows.reduce((sum, r) => sum + r.pts, 0),
    reb: rows.reduce((sum, r) => sum + r.reb, 0),
    ast: rows.reduce((sum, r) => sum + r.ast, 0),
  };
}

export function seasonStatsFor(history: readonly NbaPlayerGame[], target: { gameId: string; cutoffDate: string; season: string }): SeasonStatsView {
  const played = selectPriorGames(history, { ...target, teamId: 0 }).filter((r) => Number.isFinite(r.minutes) && r.minutes > 0);
  const previous = previousSeason(target.season);
  return {
    current: totalsOf(target.season, played.filter((r) => r.season === target.season)),
    previous: totalsOf(previous, played.filter((r) => r.season === previous && r.seasonType === "regular")),
  };
}
