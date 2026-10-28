/**
 * Season-to-date production shown next to a prop: browser-safe types and arithmetic (no Node imports).
 *
 * The totals come from completed games dated before the upcoming matchup, with did-not-play and zero-minute appearances
 * excluded (v1/seasonStatsBuild.ts). They exist only on a private preview board: the data is hoopR/ESPN-derived and may not
 * be published, so the public board builder never sets them (a test checks that).
 *
 * Two seasons are kept apart and never blended: `current` is this season to date, `previous` is last regular season. Early
 * in a season the previous one is shown separately, as its own labelled basis.
 */
import type { PlayerRecentGame } from "./recentForm";
import type { BoardMarket } from "./propsBoard";

export interface SeasonTotals {
  /** "2026-27" */
  season: string;
  /** Completed games with at least one minute played. */
  games: number;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
}

/** Totals over a player's most recent completed games this season (a last-N window). */
export interface RecentTotals {
  /** Games in the window: at most the window size, fewer early in the season. */
  games: number;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
}

export interface SeasonStatsView {
  /** This season to date, or null before the player's first game. */
  current: SeasonTotals | null;
  /** The previous regular season, or null when the player has none in the data. */
  previous: SeasonTotals | null;
  /**
   * The last five completed games this season, strictly before the matchup, did-not-play and zero-minute games excluded.
   * Null before the player's first game. Absent (undefined) on a board built before this field existed: the page then says
   * the board must be rebuilt, instead of showing a number it cannot support.
   */
  last5?: RecentTotals | null;
  /** The same window for the last ten games. */
  last10?: RecentTotals | null;
  /**
   * The same last ten games one by one, oldest to newest (the chart's order). Absent on a board built before this field
   * existed: the page then says the board must be rebuilt, instead of drawing a chart it cannot support.
   */
  recentGames?: PlayerRecentGame[];
}

/** Window sizes behind `last5` and `last10`. */
export const RECENT_WINDOWS = { last5: 5, last10: 10 } as const;

/** Below this many games in the current season, the previous season is shown beside it. */
export const EARLY_SEASON_GAMES = 15;

/** A finite total over a positive denominator; null otherwise. No zero is ever invented for a missing sample. */
export function ratio(total: number, denominator: number): number | null {
  return Number.isFinite(total) && Number.isFinite(denominator) && denominator > 0 ? total / denominator : null;
}

export interface SeasonBasis {
  season: string;
  games: number;
  mpg: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  ptsPerMinute: number | null;
  rebPerMinute: number | null;
  astPerMinute: number | null;
}

export function basisFor(totals: SeasonTotals | null): SeasonBasis | null {
  if (!totals || !(totals.games > 0)) return null;
  return {
    season: totals.season,
    games: totals.games,
    mpg: ratio(totals.minutes, totals.games),
    ppg: ratio(totals.pts, totals.games),
    rpg: ratio(totals.reb, totals.games),
    apg: ratio(totals.ast, totals.games),
    ptsPerMinute: ratio(totals.pts, totals.minutes),
    rebPerMinute: ratio(totals.reb, totals.minutes),
    astPerMinute: ratio(totals.ast, totals.minutes),
  };
}

/** Per-game figures over a last-N window. */
export interface RecentAverages {
  games: number;
  mpg: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
}

export function recentAverages(totals: RecentTotals | null | undefined): RecentAverages | null {
  if (!totals || !(totals.games > 0)) return null;
  return { games: totals.games, mpg: ratio(totals.minutes, totals.games), ppg: ratio(totals.pts, totals.games), rpg: ratio(totals.reb, totals.games), apg: ratio(totals.ast, totals.games) };
}

/** The market's own per-game figure over a window. */
export function recentPerGame(averages: RecentAverages | null, market: BoardMarket): number | null {
  if (!averages) return null;
  return market === "pts" ? averages.ppg : market === "reb" ? averages.rpg : averages.apg;
}

export interface SeasonColumns {
  current: SeasonBasis | null;
  previous: SeasonBasis | null;
  /** True when the previous season is shown beside the current one (early in the season, or no current games yet). */
  showPrevious: boolean;
  /** False when the board carries no last-N windows at all (built before they existed): the page must not call that "no games". */
  hasRecent: boolean;
  last5: RecentAverages | null;
  last10: RecentAverages | null;
}

export function seasonColumns(view: SeasonStatsView | undefined | null): SeasonColumns | null {
  if (!view) return null;
  const current = basisFor(view.current);
  const previous = basisFor(view.previous);
  if (!current && !previous) return null;
  return {
    current,
    previous,
    showPrevious: previous !== null && (current === null || current.games < EARLY_SEASON_GAMES),
    hasRecent: view.last5 !== undefined && view.last10 !== undefined,
    last5: recentAverages(view.last5),
    last10: recentAverages(view.last10),
  };
}

/** The market's own per-game and per-minute figures from one basis. */
export function marketRates(basis: SeasonBasis | null, market: BoardMarket): { perGame: number | null; perMinute: number | null } {
  if (!basis) return { perGame: null, perMinute: null };
  switch (market) {
    case "pts":
      return { perGame: basis.ppg, perMinute: basis.ptsPerMinute };
    case "reb":
      return { perGame: basis.rpg, perMinute: basis.rebPerMinute };
    case "ast":
      return { perGame: basis.apg, perMinute: basis.astPerMinute };
  }
}
