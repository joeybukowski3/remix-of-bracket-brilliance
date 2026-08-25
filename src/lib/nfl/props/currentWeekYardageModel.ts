/**
 * Phase 9: production-candidate model fitting for current-week generation.
 *
 * Model-fit strategy (Section 22 of the Phase 9 report): the repository has
 * no serialized/frozen coefficient artifact for any of the three markets --
 * every prior script (Phase 4-8) refits its model from raw historical
 * feature rows at run time, because the closed-form ridge/shrinkage fit is
 * cheap and fully deterministic. Phase 9 keeps that same pattern rather
 * than inventing a new serialization format. The one real decision this
 * phase makes is WHICH SEASONS back that refit: per the phase brief,
 * architecture/hyperparameter selection stays frozen from Phase 4/5.5/6
 * (never re-derived from 2025), but the FINAL COEFFICIENT FIT for a 2026
 * production candidate legitimately includes 2025 (`PRODUCTION_TRAIN_SEASONS`),
 * since 2025 was already a fixed, inspected retrospective benchmark, not an
 * unseen holdout being newly mined for model choices.
 *
 * Prediction intervals reuse the exact Phase 7 methodology (fold2: train
 * 2022-2023, validate 2024) so the already-reported/approved 87-89% realized
 * 2025 coverage numbers stay the ones this interval traces back to -- a
 * different split would be an unapproved recalibration.
 */
import { fitRidgeModel, scoreRidgeModel, type FittedRidgeModel } from "./ridge";
import { computePassingTrainFallbacks, encodePassingFeatureRow } from "./qbPassingEncoding";
import type { NflQbPassingFeatureRow } from "./types/qbPassingFeatures";
import { computeRushingBaselineConstants, predictRushingBaselineC, type NflRushingBaselineConstants } from "./rushingBaselines";
import type { NflRushingFeatureRow } from "./types/rushingFeatures";
import { computeReceivingBaselineConstants, predictReceivingBaselineC, type NflReceivingBaselineConstants } from "./receivingBaselines";
import type { NflReceivingFeatureRow } from "./types/receivingFeatures";
import { computeResidualQuantiles, type NflResidualQuantiles } from "./predictionIntervals";

/** Selection frozen before 2025 (Phase 4/5.5/6); final coefficient fit includes 2025. */
export const PRODUCTION_TRAIN_SEASONS: readonly number[] = [2022, 2023, 2024, 2025];
export const PASSING_RIDGE_ALPHA = 10;

export const MODEL_VERSIONS = {
  passing: "nfl-passing-direct-ridge-alpha10-production-2022-2025-v1",
  rushing: "nfl-rushing-carries-x-shrunk-ypc-production-2022-2025-v1",
  receiving: "nfl-receiving-targets-x-shrunk-ypt-production-2022-2025-v1",
} as const;

export const INTERVAL_VERSION = "nfl-empirical-interval-fold2-2022-2023-train-2024-validate-v1";

// ---------------------------------------------------------------------------
// Passing
// ---------------------------------------------------------------------------

export type NflFittedPassingModel = { model: FittedRidgeModel; fallbacks: readonly number[] };

export function fitPassingModel(trainRows: readonly NflQbPassingFeatureRow[]): NflFittedPassingModel {
  const fallbacks = computePassingTrainFallbacks(trainRows);
  const model = fitRidgeModel(
    trainRows.map((row) => encodePassingFeatureRow(row, fallbacks)),
    trainRows.map((row) => row.target.primaryQbPassingYards),
    PASSING_RIDGE_ALPHA,
  );
  return { model, fallbacks };
}

export function predictPassing(fitted: NflFittedPassingModel, row: Omit<NflQbPassingFeatureRow, "target">): number {
  return scoreRidgeModel(fitted.model, encodePassingFeatureRow(row as NflQbPassingFeatureRow, fitted.fallbacks));
}

// ---------------------------------------------------------------------------
// Rushing
// ---------------------------------------------------------------------------

export type NflFittedRushingModel = { constants: NflRushingBaselineConstants; fallbackCarries: number };

export function fitRushingModel(trainRows: readonly NflRushingFeatureRow[]): NflFittedRushingModel {
  const constants = computeRushingBaselineConstants(trainRows);
  return { constants, fallbackCarries: constants.leagueMeanRushingYards / constants.leagueMeanYardsPerCarry };
}

export function predictRushing(
  fitted: NflFittedRushingModel,
  row: Omit<NflRushingFeatureRow, "target">,
): { predicted: number; projectedCarries: number; projectedYpc: number } {
  return predictRushingBaselineC(row as NflRushingFeatureRow, fitted.constants, fitted.fallbackCarries);
}

// ---------------------------------------------------------------------------
// Receiving
// ---------------------------------------------------------------------------

export type NflFittedReceivingModel = { constants: NflReceivingBaselineConstants; fallbackTargets: number };

export function fitReceivingModel(trainRows: readonly NflReceivingFeatureRow[]): NflFittedReceivingModel {
  const constants = computeReceivingBaselineConstants(trainRows);
  return { constants, fallbackTargets: constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget };
}

export function predictReceiving(
  fitted: NflFittedReceivingModel,
  row: Omit<NflReceivingFeatureRow, "target">,
): { predicted: number; projectedTargets: number; projectedYpt: number } {
  return predictReceivingBaselineC(row as NflReceivingFeatureRow, fitted.constants, fitted.fallbackTargets);
}

// ---------------------------------------------------------------------------
// Prediction intervals -- fold2 methodology (train 2022-2023, validate 2024)
// ---------------------------------------------------------------------------

const FOLD2_TRAIN_SEASONS: readonly number[] = [2022, 2023];
const FOLD2_VALIDATE_SEASON = 2024;
const NOMINAL_LEVEL = 0.9;

export function buildPassingResidualQuantiles(allRows: readonly NflQbPassingFeatureRow[]): NflResidualQuantiles {
  const train = allRows.filter((r) => FOLD2_TRAIN_SEASONS.includes(r.season));
  const validate = allRows.filter((r) => r.season === FOLD2_VALIDATE_SEASON);
  const fitted = fitPassingModel(train);
  const pairs = validate.map((row) => ({ actual: row.target.primaryQbPassingYards, predicted: predictPassing(fitted, row) }));
  return computeResidualQuantiles(pairs, NOMINAL_LEVEL);
}

export function buildRushingResidualQuantiles(allRows: readonly NflRushingFeatureRow[]): NflResidualQuantiles {
  const train = allRows.filter((r) => FOLD2_TRAIN_SEASONS.includes(r.season));
  const validate = allRows.filter((r) => r.season === FOLD2_VALIDATE_SEASON);
  const fitted = fitRushingModel(train);
  const pairs = validate.map((row) => ({ actual: row.target.rushingYards, predicted: predictRushing(fitted, row).predicted }));
  return computeResidualQuantiles(pairs, NOMINAL_LEVEL);
}

export function buildReceivingResidualQuantiles(allRows: readonly NflReceivingFeatureRow[]): NflResidualQuantiles {
  const train = allRows.filter((r) => FOLD2_TRAIN_SEASONS.includes(r.season));
  const validate = allRows.filter((r) => r.season === FOLD2_VALIDATE_SEASON);
  const fitted = fitReceivingModel(train);
  const pairs = validate.map((row) => ({ actual: row.target.receivingYards, predicted: predictReceiving(fitted, row).predicted }));
  return computeResidualQuantiles(pairs, NOMINAL_LEVEL);
}
