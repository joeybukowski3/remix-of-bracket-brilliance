/**
 * The validation plan, frozen on 2026-10-26 BEFORE any 2024-25 data was imported or any candidate was scored.
 *
 * Decision (owner, 2026-10-26): the public V1 projection stays exactly as it is until a candidate change is validated on
 * data it was not chosen on. The two candidates come from the PR #441 backtest on 2025-26, where they were measured with
 * no previous-season context. Here they are judged with 2024-25 supplying that context and 2025-26 as the evaluation
 * season. Nothing in this file may be edited after results exist; a change to the plan is a new, dated plan.
 *
 * Candidates (each is a pure function of pregame features and the league rates, so none can see the outcome):
 *   A  Remove the fixed new-player minutes prior once actual in-season minutes exist. The baseline pulls the minutes blend
 *      toward a previous-season average when the player has one (>= 10 games), else toward a fixed 14 minutes. A applies
 *      only to the second case and only when the player already has at least one earlier game this season: it then does
 *      not shrink at all. Players with a qualifying previous season are untouched.
 *   B  Shrink per-minute rates toward the previous-season rate (or the league rate) with a 25-minute weight instead of 100,
 *      for PTS, REB and AST, for every player.
 *   AB Both.
 *
 * Decision rule for recommending a candidate for the public model (all of it, on 2025-26):
 *   1. Primary measures. A: minutes and PTS. B: PTS, REB and AST. AB: all four. Each primary measure's paired MAE
 *      difference against the baseline must have a 95% upper bound below zero.
 *   2. No measure may be significantly worse overall (a lower bound above zero).
 *   3. The mean difference of every primary measure in the later half of the season's game dates must also be below zero.
 *   4. No material subgroup worsening (below).
 * Failing any step means "do not change the public model"; passing all of them means "justifies a targeted change",
 * not an automatic one.
 *
 * Material subgroup worsening: a pregame subgroup (projected-minutes tier, prior-games band, season segment, whether the
 * player has a previous season, absence/team-change/role-change flags) with at least 200 scored player-games where a
 * candidate's paired MAE difference is above zero with a lower 95% bound above zero AND at least 2% of the baseline MAE
 * of that subgroup. Many subgroups are checked, so a single flagged small subgroup is reported and judged in context,
 * but under this rule it blocks a recommendation.
 *
 * Intervals: errors are clustered by player and by calendar week, the wider standard error is used, with a Student-t
 * critical value (backtest/inference.ts).
 */
import { projectMinutes, projectRate, RATE_STATS, type BaselineParams, type BaselinePriors, type StatProjection } from "../../projection";
import { BASELINE_V0_PUBLIC_PARAMS } from "../../projection";
import type { PregameFeatures } from "../../features";

export const PLAN_FROZEN_ON = "2026-10-26";
export const CANDIDATE_RATE_SHRINK_MINUTES = 25;
export const CANDIDATE_IDS = ["baseline", "A", "B", "AB"] as const;
export type CandidateId = (typeof CANDIDATE_IDS)[number];

export const PRIMARY_MEASURES: Readonly<Record<Exclude<CandidateId, "baseline">, readonly ("minutes" | "pts" | "reb" | "ast")[]>> = Object.freeze({
  A: ["minutes", "pts"],
  B: ["pts", "reb", "ast"],
  AB: ["minutes", "pts", "reb", "ast"],
});

export const MATERIAL_MIN_ROWS = 200;
export const MATERIAL_RELATIVE_WORSENING = 0.02;

const base: BaselineParams = BASELINE_V0_PUBLIC_PARAMS;

/** True when the baseline would shrink this player's minutes toward the fixed new-player prior and he has in-season games. */
export function usesFixedMinutesPrior(features: PregameFeatures, params: BaselineParams = base): boolean {
  const prev = features.previousRegularSeason;
  const hasQualifyingPreviousSeason = prev !== null && prev.games >= params.prevSeasonMinGames;
  return !hasQualifyingPreviousSeason && features.seasonPriorGames >= 1;
}

const candidateRateParams: BaselineParams = Object.freeze({
  ...base,
  rateShrinkMinutes: Object.freeze({ pts: CANDIDATE_RATE_SHRINK_MINUTES, reb: CANDIDATE_RATE_SHRINK_MINUTES, ast: CANDIDATE_RATE_SHRINK_MINUTES }),
}) as BaselineParams;

export function projectCandidate(id: CandidateId, features: PregameFeatures, priors: BaselinePriors): StatProjection {
  const withA = id === "A" || id === "AB";
  const withB = id === "B" || id === "AB";
  const minutesParams: BaselineParams = withA && usesFixedMinutesPrior(features) ? { ...base, minutesShrinkGames: 0 } : base;
  const rateParams = withB ? candidateRateParams : base;
  const minutes = projectMinutes(features, minutesParams);
  const [pts, reb, ast] = RATE_STATS.map((stat) => minutes * projectRate(features, stat, priors, rateParams));
  return { minutes, pts, reb, ast };
}
