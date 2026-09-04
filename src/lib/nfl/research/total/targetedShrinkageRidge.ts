/**
 * Phase P, Model B -- targeted prior shrinkage on exactly two coefficients
 * (offenseSuccessRate, opponentDefenseEpaAllowed) within the Phase N/O
 * 5-feature ridge (offense EPA/success, opponent-defense-allowed
 * EPA/success, home; target = actualTeamPoints directly, no
 * scoringEnvironment). Generalizes Phase N's single-feature
 * environmentPenaltyRidge.ts to an arbitrary set of targeted
 * (featureIndex, prior, lambda) triples; every OTHER coefficient keeps the
 * ordinary shared ridge penalty (pulled toward 0), unchanged.
 *
 * Loss: sum_i (y_i - Xb)^2 + lambda * sum_{j not targeted} b_j^2
 *       + sum over targeted j of lambdaFor(j) * (b_j - priorFor(j))^2
 *
 * Feature order (fixed, matches residualRidge.ts's rawResidualFeatures):
 *   [offenseEpaPerPlay, offenseSuccessRate, opponentDefenseEpaAllowed,
 *    opponentDefenseSuccessAllowed, homeIndicator]
 */
import { computeStandardization, standardizeRow, scoreRidgeModel, fitRidgeModel, type FittedRidgeModel } from "@/lib/nfl/props/ridge";
import { rawResidualFeatures, RESIDUAL_RIDGE_FEATURE_NAMES } from "./residualRidge";
import type { NflTotalResearchDatasetRow } from "./types";

export const OFFENSE_SUCCESS_INDEX = RESIDUAL_RIDGE_FEATURE_NAMES.indexOf("offenseSuccessRate");
export const OPPONENT_DEFENSE_EPA_INDEX = RESIDUAL_RIDGE_FEATURE_NAMES.indexOf("opponentDefenseEpaAllowed");

export type TargetedPrior = { featureIndex: number; priorValue: number; lambda: number };

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-9) augmented[pivot][column] += 1e-6;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) { if (row === column) continue; const factor = augmented[row][column]; for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index]; }
  }
  return augmented.map((row) => row[size]);
}

export function fitTargetedShrinkageRidge(
  trainRows: readonly NflTotalResearchDatasetRow[],
  baseLambda: number,
  priors: readonly TargetedPrior[],
): FittedRidgeModel {
  const usable = trainRows.filter((r) => rawResidualFeatures(r) !== null);
  if (usable.length === 0) throw new Error("fitTargetedShrinkageRidge: zero usable training rows.");

  const rawRows = usable.map((r) => [...rawResidualFeatures(r)!]);
  const targets = usable.map((r) => r.actualTeamPoints);
  const { means, stds } = computeStandardization(rawRows);
  const standardizedRows = rawRows.map((row) => standardizeRow(row, means, stds));

  const width = standardizedRows[0].length;
  const intercept = targets.reduce((s, v) => s + v, 0) / targets.length;
  const centered = targets.map((v) => v - intercept);
  const priorByIndex = new Map(priors.map((p) => [p.featureIndex, p]));

  const matrix = Array.from({ length: width }, (_, left) =>
    Array.from({ length: width }, (_, right) => {
      const base = standardizedRows.reduce((s, row) => s + row[left] * row[right], 0);
      if (left !== right) return base;
      const targeted = priorByIndex.get(left);
      return base + (targeted ? targeted.lambda : baseLambda);
    }),
  );
  const vector = Array.from({ length: width }, (_, col) => {
    const base = standardizedRows.reduce((s, row, i) => s + row[col] * centered[i], 0);
    const targeted = priorByIndex.get(col);
    return targeted ? base + targeted.lambda * targeted.priorValue : base;
  });
  const coefficients = solveLinearSystem(matrix, vector);

  return { intercept, coefficients, featureMeans: means, featureStds: stds };
}

export function scoreTargetedShrinkageRidge(model: FittedRidgeModel, row: NflTotalResearchDatasetRow): number | null {
  const features = rawResidualFeatures(row);
  if (features === null) return null;
  return scoreRidgeModel(model, features);
}

/**
 * Fits the ORDINARY (unpenalized-beyond-baseLambda) 5-feature ridge on an
 * arbitrary historical row set and returns one coefficient -- used to
 * derive a leakage-safe prior from data strictly outside the fold whose
 * instability is being addressed. Throws (never silently defaults) when
 * the historical set has no usable rows, so a missing/empty historical
 * source fails loudly rather than producing a fabricated prior.
 */
export function fitHistoricalPriorCoefficient(
  historicalRows: readonly NflTotalResearchDatasetRow[],
  baseLambda: number,
  featureIndex: number,
): number {
  const usable = historicalRows.filter((r) => rawResidualFeatures(r) !== null);
  if (usable.length === 0) {
    throw new Error("fitHistoricalPriorCoefficient: zero usable historical rows -- refusing to fabricate a prior.");
  }
  const rawRows = usable.map((r) => [...rawResidualFeatures(r)!]);
  const targets = usable.map((r) => r.actualTeamPoints);
  const model = fitRidgeModel(rawRows, targets, baseLambda);
  return model.coefficients[featureIndex];
}
