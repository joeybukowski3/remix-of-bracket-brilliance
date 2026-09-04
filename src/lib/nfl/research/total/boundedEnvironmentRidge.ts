/**
 * Phase N, Model D -- ridge with the scoringEnvironment coefficient
 * (standardized-feature space, same space every prior phase reported
 * coefficients in) constrained to `[lowerBound, upperBound]`. No other
 * coefficient is constrained.
 *
 * METHOD: closed-form active-set correction, exact (not approximate) for
 * this problem shape. Ridge regression is a convex quadratic; with a box
 * constraint on exactly one coordinate, the KKT conditions say: if the
 * unconstrained optimum already satisfies the bound, it IS the constrained
 * optimum (no change needed). If it violates a bound, the constrained
 * optimum fixes that one coordinate exactly at the violated bound and
 * re-solves the (still-convex, still-closed-form) ridge subproblem for
 * every other coefficient against the residual target
 * `y - fixedBeta * standardizedEnvColumn`. This is the exact global
 * constrained solution, not an iterative approximation -- there is only
 * one constrained coordinate, so no further active-set iteration is
 * needed once that one check is made.
 *
 * No new dependency: reuses ridge.ts's own `computeStandardization`,
 * `standardizeRow` and the same closed-form Gaussian-elimination solver
 * pattern it already uses internally (duplicated locally, exactly the
 * design choice ridge.ts's own file header documents for
 * src/lib/fantasy's independent ridge implementation -- see that file's
 * comment).
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

function ridgeFit(standardizedRows: number[][], targets: number[], lambda: number): { intercept: number; coefficients: number[] } {
  const width = standardizedRows[0]?.length ?? 0;
  const intercept = targets.reduce((s, v) => s + v, 0) / targets.length;
  const centered = targets.map((v) => v - intercept);
  const matrix = Array.from({ length: width }, (_, left) => Array.from({ length: width }, (_, right) => standardizedRows.reduce((s, row) => s + row[left] * row[right], 0) + (left === right ? lambda : 0)));
  const vector = Array.from({ length: width }, (_, col) => standardizedRows.reduce((s, row, i) => s + row[col] * centered[i], 0));
  const coefficients = width > 0 ? solveLinearSystem(matrix, vector) : [];
  return { intercept, coefficients };
}

function toFeatureVector(row: NflTotalResearchDatasetRow): readonly number[] | null {
  if (row.scoringEnvironment.value === null || row.offense.epaPerPlay === null || row.offense.successRate === null || row.opponentDefenseAllowed.epaPerPlay === null || row.opponentDefenseAllowed.successRate === null) return null;
  return [row.scoringEnvironment.value, row.offense.epaPerPlay, row.offense.successRate, row.opponentDefenseAllowed.epaPerPlay, row.opponentDefenseAllowed.successRate, row.homeAway === "home" ? 1 : 0];
}

export type BoundedEnvironmentResult = { model: FittedRidgeModel; boundHit: "none" | "lower" | "upper"; unconstrainedEnvCoefficient: number };

export function fitBoundedEnvironmentRidge(
  trainRows: readonly NflTotalResearchDatasetRow[],
  lambda: number,
  lowerBound: number,
  upperBound: number,
): BoundedEnvironmentResult {
  const usable = trainRows.map(toFeatureVector).map((v, i) => (v ? { features: v, target: trainRows[i].actualTeamPoints } : null)).filter((r): r is { features: readonly number[]; target: number } => r !== null);
  if (usable.length === 0) throw new Error("fitBoundedEnvironmentRidge: zero usable training rows.");

  const rawRows = usable.map((r) => [...r.features]);
  const targets = usable.map((r) => r.target);
  const { means, stds } = computeStandardization(rawRows);
  const standardizedRows = rawRows.map((row) => standardizeRow(row, means, stds));

  const unconstrained = ridgeFit(standardizedRows, targets, lambda);
  const unconstrainedEnvCoefficient = unconstrained.coefficients[ENV_COLUMN_INDEX];

  if (unconstrainedEnvCoefficient >= lowerBound && unconstrainedEnvCoefficient <= upperBound) {
    return {
      model: { intercept: unconstrained.intercept, coefficients: unconstrained.coefficients, featureMeans: means, featureStds: stds },
      boundHit: "none",
      unconstrainedEnvCoefficient,
    };
  }

  const fixedBeta = unconstrainedEnvCoefficient < lowerBound ? lowerBound : upperBound;
  const otherRows = standardizedRows.map((row) => row.filter((_, i) => i !== ENV_COLUMN_INDEX));
  const adjustedTargets = targets.map((t, i) => t - fixedBeta * standardizedRows[i][ENV_COLUMN_INDEX]);
  const refit = ridgeFit(otherRows, adjustedTargets, lambda);

  const fullCoefficients: number[] = [];
  let otherIndex = 0;
  for (let i = 0; i < REDUCED_RIDGE_FEATURE_NAMES.length; i += 1) {
    fullCoefficients.push(i === ENV_COLUMN_INDEX ? fixedBeta : refit.coefficients[otherIndex++]);
  }

  return {
    model: { intercept: refit.intercept, coefficients: fullCoefficients, featureMeans: means, featureStds: stds },
    boundHit: unconstrainedEnvCoefficient < lowerBound ? "lower" : "upper",
    unconstrainedEnvCoefficient,
  };
}

export function scoreBoundedEnvironmentRidge(result: BoundedEnvironmentResult, row: NflTotalResearchDatasetRow): number | null {
  const features = toFeatureVector(row);
  if (features === null) return null;
  return scoreRidgeModel(result.model, features);
}
