import { flattenEncodedRow } from "./scaling";
import type { EncodedRow } from "./scaling";

/**
 * Hand-rolled ridge (closed-form, adapted from `weekly/backtest/models.ts`'s
 * standardized-normal-equations solver) and elastic net (coordinate descent)
 * regressors. No new npm dependency. Both operate on an already-encoded design
 * matrix (see `scaling.ts`) so they are agnostic to whether they are fitting a
 * direct target or a residual target.
 */

export type FittedLinearModel = {
  intercept: number;
  coefficients: number[];
  width: number;
};

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-9) {
      augmented[pivot][column] += 1e-6; // near-singular guard; ridge lambda already regularizes this in practice
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

export function fitRidge(rows: readonly number[][], targets: readonly number[], lambda: number): FittedLinearModel {
  const width = rows[0]?.length ?? 0;
  const intercept = targets.reduce((sum, value) => sum + value, 0) / targets.length;
  const centered = targets.map((value) => value - intercept);
  const matrix = Array.from({ length: width }, (_, left) =>
    Array.from({ length: width }, (_, right) =>
      rows.reduce((sum, row) => sum + row[left] * row[right], 0) + (left === right ? lambda : 0),
    ),
  );
  const vector = Array.from({ length: width }, (_, column) =>
    rows.reduce((sum, row, index) => sum + row[column] * centered[index], 0),
  );
  const coefficients = width > 0 ? solveLinearSystem(matrix, vector) : [];
  return { intercept, coefficients, width };
}

/** Elastic net via cyclic coordinate descent on an already-standardized design matrix. `alpha` is overall regularization strength; `l1Ratio` in [0,1] splits it between L1 (lasso) and L2 (ridge). */
export function fitElasticNet(
  rows: readonly number[][],
  targets: readonly number[],
  alpha: number,
  l1Ratio: number,
  options: { maxIterations?: number; tolerance?: number } = {},
): FittedLinearModel {
  const width = rows[0]?.length ?? 0;
  const n = rows.length;
  const intercept = targets.reduce((sum, value) => sum + value, 0) / (n || 1);
  const residualTargets = targets.map((value) => value - intercept);
  const coefficients = new Array(width).fill(0);
  const columnNormSquared = Array.from({ length: width }, (_, column) =>
    rows.reduce((sum, row) => sum + row[column] * row[column], 0),
  );
  const l1Penalty = alpha * l1Ratio * n;
  const l2Penalty = alpha * (1 - l1Ratio) * n;
  const maxIterations = options.maxIterations ?? 500;
  const tolerance = options.tolerance ?? 1e-6;

  const residual = residualTargets.slice();
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let maxDelta = 0;
    for (let column = 0; column < width; column += 1) {
      const oldCoefficient = coefficients[column];
      if (oldCoefficient !== 0) {
        for (let row = 0; row < n; row += 1) residual[row] += rows[row][column] * oldCoefficient;
      }
      const rho = rows.reduce((sum, row, index) => sum + row[column] * residual[index], 0);
      const denominator = columnNormSquared[column] + l2Penalty;
      const softThreshold = Math.sign(rho) * Math.max(Math.abs(rho) - l1Penalty / 2, 0);
      const newCoefficient = denominator > 0 ? softThreshold / denominator : 0;
      coefficients[column] = newCoefficient;
      if (newCoefficient !== 0) {
        for (let row = 0; row < n; row += 1) residual[row] -= rows[row][column] * newCoefficient;
      }
      maxDelta = Math.max(maxDelta, Math.abs(newCoefficient - oldCoefficient));
    }
    if (maxDelta < tolerance) break;
  }
  return { intercept, coefficients, width };
}

export function scoreLinearModel(model: FittedLinearModel, encoded: EncodedRow): number {
  const flat = flattenEncodedRow(encoded);
  return model.intercept + flat.reduce((sum, value, index) => sum + value * model.coefficients[index], 0);
}

/** Preregistered hyperparameter grids (spec section 9): modest, fixed, documented before validation is viewed. */
export const RIDGE_ALPHA_GRID = [0.1, 1, 3, 10, 30, 100] as const;
export const ELASTIC_NET_ALPHA_GRID = [0.01, 0.05, 0.1, 0.3, 1] as const;
export const ELASTIC_NET_L1_RATIO_GRID = [0.1, 0.5, 0.9] as const;
