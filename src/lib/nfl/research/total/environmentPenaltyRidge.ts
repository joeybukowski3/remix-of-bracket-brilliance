/**
 * Phase N, Model E -- ridge with an EXTRA targeted penalty pulling only the
 * scoringEnvironment coefficient toward 1 (a sensible "trust it as an
 * additive baseline" prior), instead of ridge's usual pull-toward-0 for
 * every coefficient. Loss:
 *
 *   sum_i (y_i - Xb)^2 + lambda * sum_{j != env} b_j^2 + lambdaEnv * (b_env - 1)^2
 *
 * Differentiating w.r.t. b_env and setting to 0 shows this only changes
 * the ridge normal equations in two places versus ordinary ridge: the
 * diagonal entry for the env column gets `lambdaEnv` instead of `lambda`,
 * and the right-hand-side vector gets an extra `+lambdaEnv` term at the
 * env row (from expanding (b_env-1)^2 = b_env^2 - 2*b_env + 1, whose
 * derivative contributes -2*lambdaEnv, which moves to the RHS as
 * +lambdaEnv when solving `(X'X + Lambda) b = X'y_centered + penaltyRhs`).
 * No other coefficient's target-prior changes (still 0, still `lambda`).
 *
 * Reuses the same local closed-form solver as boundedEnvironmentRidge.ts
 * (see that file's header for why an independent local copy, matching
 * ridge.ts's own documented convention).
 */
import { computeStandardization, standardizeRow, scoreRidgeModel, type FittedRidgeModel } from "@/lib/nfl/props/ridge";
import { REDUCED_RIDGE_FEATURE_NAMES } from "./ridgeModelReduced";
import type { NflTotalResearchDatasetRow } from "./types";

const ENV_COLUMN_INDEX = REDUCED_RIDGE_FEATURE_NAMES.indexOf("scoringEnvironment"); // 0

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-9) augmented[pivot][column] += 1e-6;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[size]);
}

function toFeatureVector(row: NflTotalResearchDatasetRow): readonly number[] | null {
  if (row.scoringEnvironment.value === null || row.offense.epaPerPlay === null || row.offense.successRate === null || row.opponentDefenseAllowed.epaPerPlay === null || row.opponentDefenseAllowed.successRate === null) return null;
  return [row.scoringEnvironment.value, row.offense.epaPerPlay, row.offense.successRate, row.opponentDefenseAllowed.epaPerPlay, row.opponentDefenseAllowed.successRate, row.homeAway === "home" ? 1 : 0];
}

export function fitEnvironmentPenaltyRidge(trainRows: readonly NflTotalResearchDatasetRow[], lambda: number, lambdaEnv: number): FittedRidgeModel {
  const usable = trainRows.map(toFeatureVector).map((v, i) => (v ? { features: v, target: trainRows[i].actualTeamPoints } : null)).filter((r): r is { features: readonly number[]; target: number } => r !== null);
  if (usable.length === 0) throw new Error("fitEnvironmentPenaltyRidge: zero usable training rows.");

  const rawRows = usable.map((r) => [...r.features]);
  const targets = usable.map((r) => r.target);
  const { means, stds } = computeStandardization(rawRows);
  const standardizedRows = rawRows.map((row) => standardizeRow(row, means, stds));

  const width = standardizedRows[0].length;
  const intercept = targets.reduce((s, v) => s + v, 0) / targets.length;
  const centered = targets.map((v) => v - intercept);

  const matrix = Array.from({ length: width }, (_, left) =>
    Array.from({ length: width }, (_, right) => {
      const base = standardizedRows.reduce((s, row) => s + row[left] * row[right], 0);
      if (left === right) return base + (left === ENV_COLUMN_INDEX ? lambdaEnv : lambda);
      return base;
    }),
  );
  const vector = Array.from({ length: width }, (_, col) => {
    const base = standardizedRows.reduce((s, row, i) => s + row[col] * centered[i], 0);
    return col === ENV_COLUMN_INDEX ? base + lambdaEnv : base;
  });
  const coefficients = solveLinearSystem(matrix, vector);

  return { intercept, coefficients, featureMeans: means, featureStds: stds };
}

export function scoreEnvironmentPenaltyRidge(model: FittedRidgeModel, row: NflTotalResearchDatasetRow): number | null {
  const features = toFeatureVector(row);
  if (features === null) return null;
  return scoreRidgeModel(model, features);
}
