/**
 * Phase J, Model C -- leakage-safe training-only bias calibration.
 *
 * A naive "fit on the full train fold, compute the in-sample residual mean,
 * subtract it" correction is close to a no-op: an intercept-bearing
 * ridge/OLS fit already centers its own training residuals near zero by
 * construction (fitRidge's intercept is literally the training-target
 * mean before ridge-penalized centering), so that in-sample mean would be
 * ~0 and "fix" nothing.
 *
 * Instead this implements genuine K-fold cross-fitting WITHIN the training
 * fold only:
 *
 *   1. Partition the train fold's GAMES (not individual team-rows -- both
 *      of a game's rows always land in the same partition, so no partition
 *      boundary ever splits one game's two sides) into K deterministic
 *      partitions, by sorted gameId, `index % K`.
 *   2. For each partition p in 0..K-1: fit a ridge on every OTHER
 *      partition's rows (never partition p's own rows), then score
 *      partition p's rows with that ridge. This yields one truly
 *      out-of-fold prediction for every usable row in the training fold --
 *      each row is scored by a model that never saw it or its game-mate
 *      during fitting.
 *   3. The calibration constant is the mean OOF residual
 *      (actualTeamPoints - oofPrediction) across the whole training fold.
 *      This is a genuine out-of-sample estimate of the model's bias on
 *      data shaped like (but never overlapping with) what it will see in
 *      the real validation fold.
 *   4. The model actually applied to the real validation/retrospective
 *      fold is the ridge fit on the FULL training fold (identical to
 *      Model B) plus this one additive constant. The validation fold
 *      itself is never touched by any part of this procedure -- the
 *      constant is computed entirely before validation scoring happens.
 *
 * Leakage-safety is verifiable by inspection: `crossFitBiasCalibration`
 * takes ONLY training-fold rows and a lambda; it has no access to
 * validation/retrospective rows at any point. See
 * biasCalibration.test.ts for a fabricated-outlier leakage-detection test
 * mirroring leakage.test.ts's style.
 */
import { fitTotalRidge, scoreTotalRidge, isRowUsableForRidge } from "./ridgeModel";
import type { FittedRidgeModel } from "@/lib/nfl/props/ridge";
import type { NflTotalResearchDatasetRow } from "./types";

export const CROSS_FIT_PARTITIONS = 5;

export type CalibratedRidgeModel = {
  ridge: FittedRidgeModel;
  biasCorrection: number;
  crossFitPartitions: number;
  crossFitSampleSize: number;
};

function partitionIndexForGame(sortedGameIds: readonly string[], gameId: string, k: number): number {
  const index = sortedGameIds.indexOf(gameId);
  return index % k;
}

/** Deterministic game -> partition assignment: sort all distinct gameIds, then `index % k`. */
function buildGamePartitions(trainRows: readonly NflTotalResearchDatasetRow[], k: number): Map<string, number> {
  const gameIds = [...new Set(trainRows.map((r) => r.gameId))].sort();
  const assignment = new Map<string, number>();
  for (const gameId of gameIds) assignment.set(gameId, partitionIndexForGame(gameIds, gameId, k));
  return assignment;
}

/**
 * Fits the final full-train ridge (identical to Model B's fitTotalRidge)
 * AND, separately, a leakage-safe additive bias correction estimated via
 * K-fold cross-fitting entirely within `trainRows`. Never reads any row
 * outside `trainRows`.
 */
export function fitCalibratedTotalRidge(
  trainRows: readonly NflTotalResearchDatasetRow[],
  lambda: number,
  k: number = CROSS_FIT_PARTITIONS,
): CalibratedRidgeModel {
  const usableTrain = trainRows.filter(isRowUsableForRidge);
  if (usableTrain.length === 0) {
    throw new Error("fitCalibratedTotalRidge: zero usable training rows -- refusing to silently produce NaN.");
  }

  const partitionOf = buildGamePartitions(usableTrain, k);
  const oofResiduals: number[] = [];

  for (let p = 0; p < k; p += 1) {
    const complementRows = usableTrain.filter((r) => partitionOf.get(r.gameId) !== p);
    const heldOutRows = usableTrain.filter((r) => partitionOf.get(r.gameId) === p);
    if (complementRows.length === 0 || heldOutRows.length === 0) continue; // degenerate partition -- skip, never fabricate
    const foldRidge = fitTotalRidge(complementRows, lambda);
    for (const row of heldOutRows) {
      const oofPrediction = scoreTotalRidge(foldRidge, row);
      if (oofPrediction === null) continue;
      oofResiduals.push(row.actualTeamPoints - oofPrediction);
    }
  }

  if (oofResiduals.length === 0) {
    throw new Error("fitCalibratedTotalRidge: no out-of-fold residuals were produced -- cannot calibrate.");
  }
  const biasCorrection = oofResiduals.reduce((s, v) => s + v, 0) / oofResiduals.length;

  // The model actually applied downstream: fit on the FULL training fold (same as Model B),
  // plus the OOF-estimated additive correction. Validation/retrospective rows are never involved above.
  const finalRidge = fitTotalRidge(usableTrain, lambda);

  return { ridge: finalRidge, biasCorrection, crossFitPartitions: k, crossFitSampleSize: oofResiduals.length };
}

export function scoreCalibratedTotalRidge(model: CalibratedRidgeModel, row: NflTotalResearchDatasetRow): number | null {
  const raw = scoreTotalRidge(model.ridge, row);
  if (raw === null) return null;
  return raw + model.biasCorrection;
}
