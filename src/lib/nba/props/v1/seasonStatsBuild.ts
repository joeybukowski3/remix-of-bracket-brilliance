/**
 * Season-to-date production for the private preview board, from the same player-game rows the projection uses.
 *
 * Only completed games dated strictly before the upcoming matchup count (the leakage gate `selectPriorGames` every pregame
 * feature uses), and a game in which the player did not play, or played zero minutes, never counts: the import has no such
 * rows, and any that slipped in are dropped here too. The current season is every competitive game of this season so far; the
 * previous season is its regular season. The two are returned apart and never added together.
 *
 * The last-five and last-ten windows are the player's most recent played games of the current season, newest first. They
 * come from the same gated rows, never from season totals, and stop at the current season rather than reaching into last
 * season: a player with three games this season has a three-game window, reported as three games.
 *
 * The rows are hoopR/ESPN-derived: the result goes only into a private preview board (privatePreview.ts), never the public one.
 */
import { computePregameFeatures, selectPriorGames } from "../features";
import { previousSeason } from "../seasonType";
import { RECENT_WINDOWS, type RecentTotals, type SeasonAvailability, type SeasonStatsView, type SeasonTotals } from "../seasonStats";
import { L10_GAMES, type PlayerRecentGame } from "../recentForm";
import type { NbaPlayerGame } from "../types";
import { resultFor, type GameScores } from "./gameResults";

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

/** The first `size` rows of an already newest-first list, summed; null when there are none. */
function recentTotals(newestFirst: readonly NbaPlayerGame[], size: number): RecentTotals | null {
  const window = newestFirst.slice(0, size);
  if (window.length === 0) return null;
  const { season: _season, ...totals } = totalsOf("", window)!;
  return totals;
}

/** The player's last ten played games this season, oldest to newest: each game's own result, never a season total. */
function recentGamesOf(newestFirst: readonly NbaPlayerGame[], scores: GameScores | undefined): PlayerRecentGame[] {
  return newestFirst
    .slice(0, L10_GAMES)
    .map((r) => {
      const result = resultFor(scores, { season: r.season, gameId: r.gameId, team: r.teamAbbr, opponent: r.opponentAbbr });
      return { date: r.gameDate, opponent: r.opponentAbbr, isHome: r.isHome, minutes: r.minutes, pts: r.pts, reb: r.reb, ast: r.ast, ...(result ? { result } : {}) };
    })
    .reverse();
}

/** The player's team and its competitive game dates (buildTeamGameDates), needed to see which team games the player missed. */
export interface TeamSchedule {
  teamId: number;
  teamGameDates: ReadonlyMap<number, readonly string[]>;
}

/** Team games in the participation window. */
const PARTICIPATION_TEAM_GAMES = 10;

/**
 * Missed team games from the schedule, and the three flags baseline v0 already computes (computePregameFeatures), so there is one
 * definition of an absence, a role change and a team change. Games on or after the cutoff are invisible to both.
 */
function availabilityFor(history: readonly NbaPlayerGame[], target: { gameId: string; cutoffDate: string; season: string }, team: TeamSchedule): SeasonAvailability {
  const pregame = { ...target, teamId: team.teamId };
  const features = computePregameFeatures(history, pregame, team.teamGameDates);
  const prior = selectPriorGames(history, pregame);
  const stintEnd = prior.findIndex((row) => row.teamId !== team.teamId);
  const stintSeason = (stintEnd === -1 ? prior : prior.slice(0, stintEnd)).filter((row) => row.season === target.season);
  const stintStart = stintSeason.at(-1)?.gameDate;
  const window = stintStart === undefined ? [] : (team.teamGameDates.get(team.teamId) ?? []).filter((date) => date >= stintStart && date < target.cutoffDate).slice(-PARTICIPATION_TEAM_GAMES);
  const appeared = new Set(stintSeason.map((row) => row.gameDate));
  return {
    teamGames: window.length,
    played: window.filter((date) => appeared.has(date)).length,
    returning: features.returningFromAbsence,
    roleChange: features.roleChange,
    teamChangedRecently: features.teamChangedRecently,
  };
}

export function seasonStatsFor(history: readonly NbaPlayerGame[], target: { gameId: string; cutoffDate: string; season: string }, scores?: GameScores, team?: TeamSchedule): SeasonStatsView {
  const played = selectPriorGames(history, { ...target, teamId: 0 }).filter((r) => Number.isFinite(r.minutes) && r.minutes > 0);
  const previous = previousSeason(target.season);
  const currentRows = played.filter((r) => r.season === target.season);
  return {
    ...(team ? { availability: availabilityFor(history, target, team) } : {}),
    current: totalsOf(target.season, currentRows),
    previous: totalsOf(previous, played.filter((r) => r.season === previous && r.seasonType === "regular")),
    last5: recentTotals(currentRows, RECENT_WINDOWS.last5),
    last10: recentTotals(currentRows, RECENT_WINDOWS.last10),
    recentGames: recentGamesOf(currentRows, scores),
  };
}
