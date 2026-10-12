/**
 * Pregame player features.
 *
 * Leakage contract: every value is computed only from competitive games
 * (regular season, play-in, playoffs) dated strictly before `cutoffDate`.
 * The cutoff is enforced here, not by the caller, so passing a player's full
 * history (including the target game and later games) is safe.
 *
 * stats.nba.com reports a game date but no tip time; NBA teams never play
 * twice on one date, so "strictly before the game date" is the cutoff.
 */
import { NBA_COMPETITIVE_SEASON_TYPES, previousSeason } from "./seasonType";
import type { NbaPlayerGame } from "./types";

export const FEATURE_WINDOWS = [5, 10, 20] as const;
export type FeatureWindow = (typeof FEATURE_WINDOWS)[number];
export const FEATURE_STATS = ["minutes", "pts", "reb", "ast"] as const;
export type FeatureStat = (typeof FEATURE_STATS)[number];

/** Minimum games before L5 vs L20 minutes can flag a role change. */
const ROLE_CHANGE_MIN_GAMES = 10;
const ROLE_CHANGE_MINUTES = 8;
/** Team games missed immediately before the target that count as an absence. */
const ABSENCE_MIN_TEAM_GAMES = 3;
/** A stint shorter than this, after games for another team, counts as a recent team change. */
const RECENT_TEAM_CHANGE_GAMES = 10;

export interface WindowStats {
  games: number;
  totals: Record<FeatureStat, number>;
}

export interface PregameTarget {
  gameId: string;
  cutoffDate: string;
  season: string;
  teamId: number;
}

export interface PregameFeatures {
  priorGames: number;
  seasonPriorGames: number;
  /** Most-recent-first windows over all prior competitive games (cross-season). */
  last: Record<FeatureWindow, WindowStats | null>;
  seasonToDate: WindowStats | null;
  previousRegularSeason: WindowStats | null;
  /** Consecutive most recent prior games played for the target team. */
  currentTeamStint: Record<FeatureWindow, WindowStats | null>;
  currentTeamStintGames: number;
  /** The player's last prior game was for a different team. */
  teamChanged: boolean;
  /** Fewer than 10 games into the current team stint, with earlier games for another team. */
  teamChangedRecently: boolean;
  /**
   * Same-season target-team games since the player's last appearance; null after a
   * team change, with no history, or when the last appearance was in an earlier
   * season (offseason gaps are not absences). Logs have no DNP rows, so a healthy
   * scratch and an injury both count as missed.
   */
  teamGamesMissed: number | null;
  daysSinceLastGame: number | null;
  roleChange: boolean;
  returningFromAbsence: boolean;
  historyTier: "none" | "thin" | "partial" | "full";
}

const isCompetitive = (row: NbaPlayerGame) => NBA_COMPETITIVE_SEASON_TYPES.includes(row.seasonType);

function summarize(rows: readonly NbaPlayerGame[]): WindowStats | null {
  if (rows.length === 0) return null;
  const totals = { minutes: 0, pts: 0, reb: 0, ast: 0 };
  for (const row of rows) {
    totals.minutes += row.minutes;
    totals.pts += row.pts;
    totals.reb += row.reb;
    totals.ast += row.ast;
  }
  return { games: rows.length, totals };
}

export function windowAverage(stats: WindowStats | null, stat: FeatureStat): number | null {
  return stats ? stats.totals[stat] / stats.games : null;
}

function windows(rowsNewestFirst: readonly NbaPlayerGame[]): Record<FeatureWindow, WindowStats | null> {
  return Object.fromEntries(
    FEATURE_WINDOWS.map((size) => [size, summarize(rowsNewestFirst.slice(0, size))]),
  ) as Record<FeatureWindow, WindowStats | null>;
}

function historyTier(priorGames: number): PregameFeatures["historyTier"] {
  if (priorGames === 0) return "none";
  if (priorGames < 5) return "thin";
  if (priorGames < 20) return "partial";
  return "full";
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * The single leakage gate: competitive games dated strictly before the cutoff,
 * newest first. Every pregame feature module builds on this.
 */
export function selectPriorGames(playerHistory: readonly NbaPlayerGame[], target: PregameTarget): NbaPlayerGame[] {
  return playerHistory
    .filter((row) => isCompetitive(row) && row.gameDate < target.cutoffDate && row.gameId !== target.gameId)
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate));
}

/**
 * @param playerHistory any of the player's rows, in any order; filtered here.
 * @param teamGameDates competitive game dates per team (ascending), for absence counting.
 */
export function computePregameFeatures(
  playerHistory: readonly NbaPlayerGame[],
  target: PregameTarget,
  teamGameDates: ReadonlyMap<number, readonly string[]>,
): PregameFeatures {
  const prior = selectPriorGames(playerHistory, target);
  const last = prior[0] ?? null;
  const seasonRows = prior.filter((row) => row.season === target.season);
  const prevSeason = previousSeason(target.season);
  const prevRegular = prior.filter((row) => row.season === prevSeason && row.seasonType === "regular");
  const stintEnd = prior.findIndex((row) => row.teamId !== target.teamId);
  const stint = stintEnd === -1 ? prior : prior.slice(0, stintEnd);
  const teamChanged = last !== null && last.teamId !== target.teamId;

  let teamGamesMissed: number | null = null;
  if (last && !teamChanged && last.season === target.season) {
    const dates = teamGameDates.get(target.teamId) ?? [];
    teamGamesMissed = dates.filter((date) => date > last.gameDate && date < target.cutoffDate).length;
  }

  const lastWindows = windows(prior);
  const l5 = windowAverage(lastWindows[5], "minutes");
  const l20 = windowAverage(lastWindows[20], "minutes");
  const roleChange =
    prior.length >= ROLE_CHANGE_MIN_GAMES && l5 !== null && l20 !== null && Math.abs(l5 - l20) >= ROLE_CHANGE_MINUTES;

  return {
    priorGames: prior.length,
    seasonPriorGames: seasonRows.length,
    last: lastWindows,
    seasonToDate: summarize(seasonRows),
    previousRegularSeason: summarize(prevRegular),
    currentTeamStint: windows(stint),
    currentTeamStintGames: stint.length,
    teamChanged,
    teamChangedRecently: stint.length < prior.length && stint.length < RECENT_TEAM_CHANGE_GAMES,
    teamGamesMissed,
    daysSinceLastGame: last ? daysBetween(last.gameDate, target.cutoffDate) : null,
    roleChange,
    returningFromAbsence: (teamGamesMissed ?? 0) >= ABSENCE_MIN_TEAM_GAMES,
    historyTier: historyTier(prior.length),
  };
}

/** Competitive game dates per team, ascending, from team-game or player-game rows. */
export function buildTeamGameDates(
  rows: ReadonlyArray<{ teamId: number; gameDate: string; seasonType: NbaPlayerGame["seasonType"] }>,
): Map<number, string[]> {
  const map = new Map<number, Set<string>>();
  for (const row of rows) {
    if (!NBA_COMPETITIVE_SEASON_TYPES.includes(row.seasonType)) continue;
    map.set(row.teamId, (map.get(row.teamId) ?? new Set()).add(row.gameDate));
  }
  return new Map([...map].map(([teamId, dates]) => [teamId, [...dates].sort()]));
}
