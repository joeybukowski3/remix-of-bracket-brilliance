/**
 * WU4A team opportunity model — candidate models, deterministic fit, and
 * the coherence-enforcing prediction.
 *
 * Two quantities are modeled and everything else is derived:
 *   1. projected team plays  (eligible rush + pass plays)
 *   2. projected dropback rate  (dropbacks / eligible plays)
 * then, by exact accounting:
 *   projected_pass_attempts = plays * dropbackRate
 *   projected_rush_attempts = plays * (1 - dropbackRate)
 *   projected_pass_attempts + projected_rush_attempts == projected_team_plays
 *
 * No directional football assumption is hard-coded. Which inputs help was
 * decided by the walk-forward harness
 * (`scripts/analysis/nfl-team-opportunity-calibration/evaluate.ts`):
 *
 *   - TEAM PLAYS are only weakly predictable. Prior team form and the
 *     opponent-allowed blend were BOTH worse than the training league mean
 *     on single-game MAE/RMSE across all three folds; the market-aware
 *     ridge merely ties the league mean (corr ~0.08-0.19). So projected
 *     plays land close to league-average by design, and that is the honest
 *     state, not a modeling shortcut.
 *   - THE PASS/RUSH SPLIT is predictable. The market-aware ridge beat the
 *     league-mean, prior-team, and history+opponent baselines on dropback-
 *     rate MAE, RMSE, and correlation in all three folds (val corr
 *     ~0.25-0.38 vs ~0.19 for prior-team), and it also produced the lowest
 *     derived pass-attempts MAE in every fold.
 *
 * The selected production model is therefore a single closed-form ridge
 * (`nfl-team-opportunity-ridge-market-v1.0.0`) that predicts plays and
 * dropback rate from prior team windows + opponent-allowed windows +
 * pregame market context, refit deterministically at run time (WU1
 * archives a fitted-model hash so refits stay auditable). The history-only
 * predictors below are retained as the validated baselines the harness
 * compares against.
 */
import { fitRidgeModel, scoreRidgeModel, type FittedRidgeModel } from "./ridge";
import type {
  NflTeamOpportunityFeatureRow,
  NflTeamOpportunityFeatures,
  NflWindowedScalar,
} from "./types/teamOpportunity";

/** `seasonPrior -> priorSeason` coalesce (repo convention; `last3` is diagnostic, not a projection input). */
export function coalesceScalar(scalar: NflWindowedScalar | null | undefined): number | null {
  if (!scalar) return null;
  if (scalar.seasonPrior != null) return scalar.seasonPrior;
  if (scalar.priorSeason != null) return scalar.priorSeason;
  return null;
}

export const PLAYS_CLAMP = { min: 40, max: 82 } as const;
export const DROPBACK_RATE_CLAMP = { min: 0.3, max: 0.82 } as const;
/** Opponent blend weight for the selected model (0 = team history only, 1 = opponent allowed only). Pre-registered midpoint. */
export const OPPONENT_BLEND_WEIGHT = 0.35;
export const TEAM_OPPORTUNITY_RIDGE_ALPHA = 10;

export type NflTeamOpportunityConstants = {
  leagueMeanPlays: number;
  leagueMeanDropbackRate: number;
  leagueMeanOpponentPlaysAllowed: number;
  leagueMeanOpponentDropbackRateAllowed: number;
};

function mean(values: readonly number[], fallback: number): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : fallback;
}

export function computeTeamOpportunityConstants(
  trainRows: readonly NflTeamOpportunityFeatureRow[],
): NflTeamOpportunityConstants {
  const withTarget = trainRows.filter((r): r is NflTeamOpportunityFeatureRow & { target: NonNullable<NflTeamOpportunityFeatureRow["target"]> } => r.target != null);
  return {
    leagueMeanPlays: mean(withTarget.map((r) => r.target.offensivePlays), 63),
    leagueMeanDropbackRate: mean(withTarget.map((r) => r.target.dropbackRate), 0.58),
    leagueMeanOpponentPlaysAllowed: mean(
      trainRows.map((r) => coalesceScalar(r.features.opponentDefense.offensivePlaysPerGameAllowed)).filter((v): v is number => v != null),
      63,
    ),
    leagueMeanOpponentDropbackRateAllowed: mean(
      trainRows.map((r) => coalesceScalar(r.features.opponentDefense.dropbackRateAllowed)).filter((v): v is number => v != null),
      0.58,
    ),
  };
}

// ---------------------------------------------------------------------------
// Candidate raw predictors (pre-clamp, pre-coherence). Harness compares these.
// ---------------------------------------------------------------------------

export function playsLeagueMean(constants: NflTeamOpportunityConstants): number {
  return constants.leagueMeanPlays;
}

export function playsPriorTeam(row: NflTeamOpportunityFeatureRow, constants: NflTeamOpportunityConstants): number {
  return coalesceScalar(row.features.teamOffense.offensivePlaysPerGame) ?? constants.leagueMeanPlays;
}

export function playsHistoryPlusOpponent(
  row: NflTeamOpportunityFeatureRow,
  constants: NflTeamOpportunityConstants,
  opponentWeight = OPPONENT_BLEND_WEIGHT,
): number {
  const teamPrior = coalesceScalar(row.features.teamOffense.offensivePlaysPerGame) ?? constants.leagueMeanPlays;
  const oppAllowed = coalesceScalar(row.features.opponentDefense.offensivePlaysPerGameAllowed);
  if (oppAllowed == null) return teamPrior;
  // Opponent signal is expressed as a deviation from league so a fast/slow
  // defense nudges the team's own baseline, never replaces it.
  const opponentDeviation = oppAllowed - constants.leagueMeanOpponentPlaysAllowed;
  return teamPrior + opponentWeight * opponentDeviation;
}

export function dropbackRateLeagueMean(constants: NflTeamOpportunityConstants): number {
  return constants.leagueMeanDropbackRate;
}

export function dropbackRatePriorTeam(row: NflTeamOpportunityFeatureRow, constants: NflTeamOpportunityConstants): number {
  return coalesceScalar(row.features.teamOffense.dropbackRate) ?? constants.leagueMeanDropbackRate;
}

export function dropbackRateHistoryPlusOpponent(
  row: NflTeamOpportunityFeatureRow,
  constants: NflTeamOpportunityConstants,
  opponentWeight = OPPONENT_BLEND_WEIGHT,
): number {
  const teamPrior = coalesceScalar(row.features.teamOffense.dropbackRate) ?? constants.leagueMeanDropbackRate;
  const oppAllowed = coalesceScalar(row.features.opponentDefense.dropbackRateAllowed);
  if (oppAllowed == null) return teamPrior;
  const opponentDeviation = oppAllowed - constants.leagueMeanOpponentDropbackRateAllowed;
  return teamPrior + opponentWeight * opponentDeviation;
}

// ---------------------------------------------------------------------------
// Market-aware ridge — SELECTED production predictor for plays + dropback rate
// ---------------------------------------------------------------------------

const RIDGE_FEATURE_KEYS = [
  "teamOffense.offensivePlaysPerGame",
  "opponentDefense.offensivePlaysPerGameAllowed",
  "teamOffense.dropbackRate",
  "teamOffense.passRateOverExpected",
  "teamOffense.earlyDownNeutralPassRate",
  "opponentDefense.dropbackRateAllowed",
  "market.spread",
  "market.total",
  "market.impliedTeamTotal",
  "market.isHome",
] as const;

export function ridgeFeatureKeys(): readonly string[] {
  return RIDGE_FEATURE_KEYS;
}

function rawRidgeValues(features: NflTeamOpportunityFeatures): (number | null)[] {
  return [
    coalesceScalar(features.teamOffense.offensivePlaysPerGame),
    coalesceScalar(features.opponentDefense.offensivePlaysPerGameAllowed),
    coalesceScalar(features.teamOffense.dropbackRate),
    coalesceScalar(features.teamOffense.passRateOverExpected),
    coalesceScalar(features.teamOffense.earlyDownNeutralPassRate),
    coalesceScalar(features.opponentDefense.dropbackRateAllowed),
    features.market.spread,
    features.market.total,
    features.market.impliedTeamTotal,
    features.market.isHome,
  ];
}

export function computeRidgeFallbacks(trainRows: readonly NflTeamOpportunityFeatureRow[]): number[] {
  const raw = trainRows.map((r) => rawRidgeValues(r.features));
  return RIDGE_FEATURE_KEYS.map((_, col) => {
    const values = raw.map((r) => r[col]).filter((v): v is number => v != null);
    return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  });
}

export function encodeRidgeRow(features: NflTeamOpportunityFeatures, fallbacks: readonly number[]): number[] {
  return rawRidgeValues(features).map((value, i) => value ?? fallbacks[i]);
}

export type NflTeamOpportunityRidge = {
  fallbacks: number[];
  playsModel: FittedRidgeModel;
  dropbackModel: FittedRidgeModel;
};

export function fitTeamOpportunityRidge(
  trainRows: readonly NflTeamOpportunityFeatureRow[],
  alpha = TEAM_OPPORTUNITY_RIDGE_ALPHA,
): NflTeamOpportunityRidge {
  const rows = trainRows.filter((r) => r.target != null);
  const fallbacks = computeRidgeFallbacks(trainRows);
  const encoded = rows.map((r) => encodeRidgeRow(r.features, fallbacks));
  return {
    fallbacks,
    playsModel: fitRidgeModel(encoded, rows.map((r) => r.target!.offensivePlays), alpha),
    dropbackModel: fitRidgeModel(encoded, rows.map((r) => r.target!.dropbackRate), alpha),
  };
}

export function predictRidgeRaw(ridge: NflTeamOpportunityRidge, features: NflTeamOpportunityFeatures): { plays: number; dropbackRate: number } {
  const encoded = encodeRidgeRow(features, ridge.fallbacks);
  return { plays: scoreRidgeModel(ridge.playsModel, encoded), dropbackRate: scoreRidgeModel(ridge.dropbackModel, encoded) };
}

// ---------------------------------------------------------------------------
// Production fit + coherent prediction
// ---------------------------------------------------------------------------

export type NflFittedTeamOpportunityModel = {
  modelVersion: string;
  constants: NflTeamOpportunityConstants;
  ridge: NflTeamOpportunityRidge;
  ridgeAlpha: number;
  ridgeFeatureOrder: readonly string[];
};

export function fitTeamOpportunityModel(
  trainRows: readonly NflTeamOpportunityFeatureRow[],
  modelVersion: string,
  alpha = TEAM_OPPORTUNITY_RIDGE_ALPHA,
): NflFittedTeamOpportunityModel {
  return {
    modelVersion,
    constants: computeTeamOpportunityConstants(trainRows),
    ridge: fitTeamOpportunityRidge(trainRows, alpha),
    ridgeAlpha: alpha,
    ridgeFeatureOrder: RIDGE_FEATURE_KEYS,
  };
}

function clamp(value: number, min: number, max: number): { value: number; clamped: boolean } {
  if (value < min) return { value: min, clamped: true };
  if (value > max) return { value: max, clamped: true };
  return { value, clamped: false };
}

export type NflTeamOpportunityPrediction = {
  projectedTeamPlays: number;
  projectedDropbackRate: number;
  projectedPassAttempts: number;
  projectedRushAttempts: number;
  playsBeforeClamp: number;
  dropbackRateBeforeClamp: number;
  playsClampApplied: boolean;
  dropbackRateClampApplied: boolean;
};

export function predictTeamOpportunity(
  fitted: NflFittedTeamOpportunityModel,
  row: NflTeamOpportunityFeatureRow,
): NflTeamOpportunityPrediction {
  const raw = predictRidgeRaw(fitted.ridge, row.features);
  const rawPlays = raw.plays;
  const rawDropback = raw.dropbackRate;

  const plays = clamp(rawPlays, PLAYS_CLAMP.min, PLAYS_CLAMP.max);
  const dropback = clamp(rawDropback, DROPBACK_RATE_CLAMP.min, DROPBACK_RATE_CLAMP.max);

  const projectedTeamPlays = plays.value;
  const projectedDropbackRate = dropback.value;
  const projectedPassAttempts = projectedTeamPlays * projectedDropbackRate;
  const projectedRushAttempts = projectedTeamPlays - projectedPassAttempts;

  return {
    projectedTeamPlays,
    projectedDropbackRate,
    projectedPassAttempts,
    projectedRushAttempts,
    playsBeforeClamp: rawPlays,
    dropbackRateBeforeClamp: rawDropback,
    playsClampApplied: plays.clamped,
    dropbackRateClampApplied: dropback.clamped,
  };
}

/** Coherence invariant: finite, non-negative, and the split reconstitutes the pool. */
export function assertTeamOpportunityCoherent(prediction: NflTeamOpportunityPrediction): void {
  const values = [
    prediction.projectedTeamPlays,
    prediction.projectedDropbackRate,
    prediction.projectedPassAttempts,
    prediction.projectedRushAttempts,
  ];
  for (const v of values) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`team opportunity prediction has a non-finite/negative value: ${JSON.stringify(prediction)}`);
  }
  if (prediction.projectedDropbackRate > 1) throw new Error("projected dropback rate exceeds 1");
  const sum = prediction.projectedPassAttempts + prediction.projectedRushAttempts;
  if (Math.abs(sum - prediction.projectedTeamPlays) > 1e-6) {
    throw new Error(`pass + rush (${sum}) does not reconstitute team plays (${prediction.projectedTeamPlays})`);
  }
}
