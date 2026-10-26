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

export interface SeasonStatsView {
  /** This season to date, or null before the player's first game. */
  current: SeasonTotals | null;
  /** The previous regular season, or null when the player has none in the data. */
  previous: SeasonTotals | null;
}

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

export interface SeasonColumns {
  current: SeasonBasis | null;
  previous: SeasonBasis | null;
  /** True when the previous season is shown beside the current one (early in the season, or no current games yet). */
  showPrevious: boolean;
}

export function seasonColumns(view: SeasonStatsView | undefined | null): SeasonColumns | null {
  if (!view) return null;
  const current = basisFor(view.current);
  const previous = basisFor(view.previous);
  if (!current && !previous) return null;
  return { current, previous, showPrevious: previous !== null && (current === null || current.games < EARLY_SEASON_GAMES) };
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
