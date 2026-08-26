/**
 * Minimal, self-contained closed-form ridge regression. Deliberately NOT
 * imported from `src/lib/fantasy/weekly/projections/model/linear.ts` (a
 * structurally similar but separate implementation) -- this namespace does
 * not depend on `src/lib/fantasy/**` for anything beyond the one approved
 * identity reuse boundary (`src/lib/nfl/identity`), per the architecture
 * review. No fitted coefficients, weights, or football domain knowledge
 * are shared with the fantasy pipeline; only the standard closed-form
 * ridge algorithm, which both pipelines independently implement.
 */

export type FittedRidgeModel = {
  intercept: number;
  coefficients: readonly number[];
  /** Per-feature mean/std used to standardize inputs before fitting -- required to score a new row consistently. */
  featureMeans: readonly number[];
  featureStds: readonly number[];
};

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

/** Standardizes columns to zero mean / unit variance using ONLY the provided (training) rows. */
export function computeStandardization(rows: readonly number[][]): { means: number[]; stds: number[] } {
  const width = rows[0]?.length ?? 0;
  const n = rows.length;
  const means = Array.from({ length: width }, (_, col) => rows.reduce((s, r) => s + r[col], 0) / n);
  const stds = Array.from({ length: width }, (_, col) => {
    const variance = rows.reduce((s, r) => s + (r[col] - means[col]) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    return std > 1e-9 ? std : 1; // a constant column standardizes to 0, never divides by 0
  });
  return { means, stds };
}

export function standardizeRow(row: readonly number[], means: readonly number[], stds: readonly number[]): number[] {
  return row.map((value, i) => (value - means[i]) / stds[i]);
}

/** Fits ridge on already-standardized rows (caller standardizes using TRAIN-only statistics). */
export function fitRidge(standardizedRows: readonly number[][], targets: readonly number[], lambda: number): { intercept: number; coefficients: number[] } {
  const width = standardizedRows[0]?.length ?? 0;
  const intercept = targets.reduce((s, v) => s + v, 0) / targets.length;
  const centered = targets.map((v) => v - intercept);
  const matrix = Array.from({ length: width }, (_, left) =>
    Array.from({ length: width }, (_, right) =>
      standardizedRows.reduce((s, row) => s + row[left] * row[right], 0) + (left === right ? lambda : 0),
    ),
  );
  const vector = Array.from({ length: width }, (_, col) =>
    standardizedRows.reduce((s, row, i) => s + row[col] * centered[i], 0),
  );
  const coefficients = width > 0 ? solveLinearSystem(matrix, vector) : [];
  return { intercept, coefficients };
}

/** Fits ridge on RAW (unstandardized) rows and targets, standardizing internally from these same rows. Convenience wrapper for training. */
export function fitRidgeModel(rawRows: readonly number[][], targets: readonly number[], lambda: number): FittedRidgeModel {
  const { means, stds } = computeStandardization(rawRows);
  const standardized = rawRows.map((row) => standardizeRow(row, means, stds));
  const { intercept, coefficients } = fitRidge(standardized, targets, lambda);
  return { intercept, coefficients, featureMeans: means, featureStds: stds };
}

export function scoreRidgeModel(model: FittedRidgeModel, rawRow: readonly number[]): number {
  const standardized = standardizeRow(rawRow, model.featureMeans, model.featureStds);
  return model.intercept + standardized.reduce((s, v, i) => s + v * model.coefficients[i], 0);
}

/** Preregistered, fixed, small grid -- documented before any holdout is viewed. */
export const RIDGE_ALPHA_GRID: readonly number[] = [0.1, 1, 3, 10, 30, 100];
