import type { EvaluationSummary, WalkForwardPrediction } from "./types";

function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX < 1e-12 || varY < 1e-12) return null;
  return cov / Math.sqrt(varX * varY);
}

/** Calibration: OLS of actual ~ a + b*predicted. Slope 1 / intercept 0 is perfectly calibrated. */
function calibrationRegression(predicted: readonly number[], actual: readonly number[]): { slope: number | null; intercept: number | null } {
  const n = predicted.length;
  if (n < 2) return { slope: null, intercept: null };
  const meanP = predicted.reduce((s, v) => s + v, 0) / n;
  const meanA = actual.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varP = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (predicted[i] - meanP) * (actual[i] - meanA);
    varP += (predicted[i] - meanP) ** 2;
  }
  if (varP < 1e-12) return { slope: null, intercept: null };
  const slope = cov / varP;
  const intercept = meanA - slope * meanP;
  return { slope, intercept };
}

export function evaluatePredictions(predictions: readonly WalkForwardPrediction[]): EvaluationSummary {
  const valid = predictions.filter((p) => p.predictedMargin !== null && p.actualMargin !== null);
  if (valid.length === 0) {
    return { n: 0, mae: null, rmse: null, correlation: null, calibrationSlope: null, calibrationIntercept: null, directionalAccuracy: null };
  }
  const predicted = valid.map((p) => p.predictedMargin as number);
  const actual = valid.map((p) => p.actualMargin as number);
  const errors = valid.map((p) => (p.predictedMargin as number) - (p.actualMargin as number));

  const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  const correlation = pearsonCorrelation(predicted, actual);
  const { slope, intercept } = calibrationRegression(predicted, actual);
  const directional = valid.filter((p) => Math.sign(p.predictedMargin as number) === Math.sign(p.actualMargin as number));
  const directionalAccuracy = directional.length / valid.length;

  return {
    n: valid.length,
    mae,
    rmse,
    correlation,
    calibrationSlope: slope,
    calibrationIntercept: intercept,
    directionalAccuracy,
  };
}
