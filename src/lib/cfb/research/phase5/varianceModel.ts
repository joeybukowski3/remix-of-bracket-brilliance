import { MIN_VARIANCE_ROWS } from "./config";
import type { LinearCoefficients } from "./types";

export type VarianceTrainingRow = { predictor: number; residual: number };

const MIN_SD_FLOOR = 3; // points — never let the model claim near-zero uncertainty

/**
 * Section 13 heteroskedasticity: fits variance(predictor) = a + b*predictor
 * via OLS on squared residuals, walk-forward (caller filters training rows
 * the same way as totalCalibration.ts). Returns null (homoskedastic
 * fallback) when there's too little training data to trust a slope.
 */
export function fitVarianceModel(rows: readonly VarianceTrainingRow[]): LinearCoefficients | null {
  if (rows.length < MIN_VARIANCE_ROWS) return null;
  const n = rows.length;
  const squared = rows.map((r) => ({ x: r.predictor, y: r.residual * r.residual }));
  const meanX = squared.reduce((s, r) => s + r.x, 0) / n;
  const meanY = squared.reduce((s, r) => s + r.y, 0) / n;
  let cov = 0;
  let varX = 0;
  for (const r of squared) {
    cov += (r.x - meanX) * (r.y - meanY);
    varX += (r.x - meanX) ** 2;
  }
  if (varX < 1e-9) return { intercept: meanY, slope: 0 };
  const slope = cov / varX;
  const intercept = meanY - slope * meanX;
  return { intercept, slope };
}

export function predictSd(predictor: number, model: LinearCoefficients | null, fallbackSd: number): number {
  if (model === null) return fallbackSd;
  const variance = model.intercept + model.slope * predictor;
  return Math.sqrt(Math.max(variance, MIN_SD_FLOOR ** 2));
}

export function homoskedasticSd(residuals: readonly number[]): number {
  if (residuals.length === 0) return MIN_SD_FLOOR;
  const mean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
  const variance = residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / residuals.length;
  return Math.max(Math.sqrt(variance), MIN_SD_FLOOR);
}
