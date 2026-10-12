/**
 * NBA player-prop baseline v0: expected minutes x per-minute production.
 *
 * Conditional on participation: the projection answers "if this player
 * appears in this game, how many minutes / PTS / REB / AST?". Whether the
 * player appears is out of scope for Phase 1 (no pregame availability data).
 *
 * minutes = (n * blend + K_min * minutesPrior) / (n + K_min)
 *   blend: weighted L5/L10/L20/season-to-date minutes average; after a team
 *          change the windows use only games with the new team once
 *          `stintMinGames` exist.
 *   n:     prior games used by the blend, capped at 20.
 *   minutesPrior: previous regular-season minutes average (>= prevSeasonMinGames)
 *          else `newPlayerMinutes`.
 * rate(stat) = (L20 stat + K_rate * ratePrior) / (L20 minutes + K_rate)
 *   ratePrior: previous regular-season rate (>= prevSeasonMinMinutes) else league rate.
 * stat = minutes * rate(stat)
 */
import { windowAverage, type FeatureStat, type PregameFeatures, type WindowStats } from "./features";
import type { ProjectedStat } from "./types";

export const BASELINE_MODEL_VERSION = "nba-props-baseline-v0";
export const RATE_STATS = ["pts", "reb", "ast"] as const;
export type RateStat = (typeof RATE_STATS)[number];
export type StatProjection = Record<ProjectedStat, number | null>;

export interface BaselinePriors {
  /** League per-minute rates from the training period. */
  leagueRate: Record<RateStat, number>;
}

export interface BaselineParams {
  minutesWeights: { l5: number; l10: number; l20: number; seasonToDate: number };
  minutesShrinkGames: number;
  newPlayerMinutes: number;
  rateShrinkMinutes: Record<RateStat, number>;
  prevSeasonMinGames: number;
  prevSeasonMinMinutes: number;
  stintMinGames: number;
}

export const DEFAULT_BASELINE_PARAMS: BaselineParams = {
  minutesWeights: { l5: 0.4, l10: 0.3, l20: 0.2, seasonToDate: 0.1 },
  minutesShrinkGames: 2,
  newPlayerMinutes: 14,
  rateShrinkMinutes: { pts: 100, reb: 100, ast: 100 },
  prevSeasonMinGames: 10,
  prevSeasonMinMinutes: 200,
  stintMinGames: 3,
};

/**
 * The public v0 benchmark parameters: the untuned design defaults above,
 * frozen, and pinned by baselineV0.golden.test.ts.
 *
 * These are NOT the Phase 1 values tuned on NBA.com data. Those are held in a
 * gitignored local artifact pending a rights determination, and results with
 * these defaults are not numerically equivalent to the Phase 1 benchmark.
 */
export const BASELINE_V0_PUBLIC_PARAMS: BaselineParams = Object.freeze({
  ...DEFAULT_BASELINE_PARAMS,
  minutesWeights: Object.freeze({ ...DEFAULT_BASELINE_PARAMS.minutesWeights }),
  rateShrinkMinutes: Object.freeze({ ...DEFAULT_BASELINE_PARAMS.rateShrinkMinutes }),
}) as BaselineParams;

const MAX_BLEND_GAMES = 20;

function minutesBlend(features: PregameFeatures, params: BaselineParams): { value: number; games: number } | null {
  const useStint = features.teamChanged || features.currentTeamStintGames < features.priorGames;
  const windows = useStint && features.currentTeamStintGames >= params.stintMinGames ? features.currentTeamStint : features.last;
  const parts: Array<[number, number | null]> = [
    [params.minutesWeights.l5, windowAverage(windows[5], "minutes")],
    [params.minutesWeights.l10, windowAverage(windows[10], "minutes")],
    [params.minutesWeights.l20, windowAverage(windows[20], "minutes")],
    [params.minutesWeights.seasonToDate, windowAverage(features.seasonToDate, "minutes")],
  ];
  const available = parts.filter((part): part is [number, number] => part[1] !== null);
  const weight = available.reduce((sum, [w]) => sum + w, 0);
  if (available.length === 0 || weight === 0) return null;
  return {
    value: available.reduce((sum, [w, v]) => sum + w * v, 0) / weight,
    games: Math.min(windows[20]?.games ?? 0, MAX_BLEND_GAMES),
  };
}

function minutesPrior(features: PregameFeatures, params: BaselineParams): number {
  const prev = features.previousRegularSeason;
  return prev && prev.games >= params.prevSeasonMinGames
    ? prev.totals.minutes / prev.games
    : params.newPlayerMinutes;
}

export function projectMinutes(features: PregameFeatures, params: BaselineParams): number {
  const prior = minutesPrior(features, params);
  const blend = minutesBlend(features, params);
  if (!blend) return prior;
  const k = params.minutesShrinkGames;
  return (blend.games * blend.value + k * prior) / (blend.games + k);
}

export function projectRate(features: PregameFeatures, stat: RateStat, priors: BaselinePriors, params: BaselineParams): number {
  const prev = features.previousRegularSeason;
  const ratePrior =
    prev && prev.totals.minutes >= params.prevSeasonMinMinutes ? prev.totals[stat] / prev.totals.minutes : priors.leagueRate[stat];
  const window = features.last[20];
  const k = params.rateShrinkMinutes[stat];
  const sumStat = window?.totals[stat] ?? 0;
  const sumMinutes = window?.totals.minutes ?? 0;
  if (sumMinutes + k <= 0) return ratePrior;
  return (sumStat + k * ratePrior) / (sumMinutes + k);
}

export function projectBaseline(features: PregameFeatures, priors: BaselinePriors, params: BaselineParams): StatProjection {
  const minutes = projectMinutes(features, params);
  return {
    minutes,
    pts: minutes * projectRate(features, "pts", priors, params),
    reb: minutes * projectRate(features, "reb", priors, params),
    ast: minutes * projectRate(features, "ast", priors, params),
  };
}

function naiveFrom(stats: WindowStats | null): StatProjection {
  const avg = (stat: FeatureStat) => windowAverage(stats, stat);
  return { minutes: avg("minutes"), pts: avg("pts"), reb: avg("reb"), ast: avg("ast") };
}

/** Direct rolling averages of each stat: the comparison baselines. */
export function projectNaive(features: PregameFeatures): Record<string, StatProjection> {
  return {
    naive_l5: naiveFrom(features.last[5]),
    naive_l10: naiveFrom(features.last[10]),
    naive_l20: naiveFrom(features.last[20]),
    naive_season_to_date: naiveFrom(features.seasonToDate),
  };
}
