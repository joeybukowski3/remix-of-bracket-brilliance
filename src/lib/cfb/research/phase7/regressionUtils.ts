import { solveLinearSystem } from "../phase2/linearSolver";

export type MultiOlsResult = { intercept: number; coefficients: number[]; featureNames: string[] };

/** General-purpose OLS: y = intercept + sum(coefficients[i] * features[i]). Reuses Phase 2's Gaussian-elimination solver (frozen, read-only). */
export function fitMultiOls(rows: readonly { features: number[]; y: number }[], featureNames: readonly string[]): MultiOlsResult {
  const p = featureNames.length + 1;
  const ata = Array.from({ length: p }, () => new Array(p).fill(0));
  const atb = new Array(p).fill(0);
  for (const row of rows) {
    const x = [1, ...row.features];
    for (let i = 0; i < p; i += 1) {
      atb[i] += x[i] * row.y;
      for (let j = 0; j < p; j += 1) ata[i][j] += x[i] * x[j];
    }
  }
  const solved = solveLinearSystem(ata, atb);
  return { intercept: solved[0], coefficients: solved.slice(1), featureNames: [...featureNames] };
}

export function predictMultiOls(model: MultiOlsResult, features: readonly number[]): number {
  return model.intercept + model.coefficients.reduce((s, c, i) => s + c * features[i], 0);
}

export function rSquared(actual: readonly number[], predicted: readonly number[]): number {
  const n = actual.length;
  const meanY = actual.reduce((s, v) => s + v, 0) / n;
  const ssTot = actual.reduce((s, v) => s + (v - meanY) ** 2, 0);
  const ssRes = actual.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);
  return ssTot < 1e-9 ? 0 : 1 - ssRes / ssTot;
}
