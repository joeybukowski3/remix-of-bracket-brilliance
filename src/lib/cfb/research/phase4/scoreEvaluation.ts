import type { EvaluationSummary } from "../phase2/types";
import type { ScorePrediction } from "./types";

function summarize(pairs: { predicted: number; actual: number }[]): EvaluationSummary {
  if (pairs.length === 0) {
    return { n: 0, mae: null, rmse: null, correlation: null, calibrationSlope: null, calibrationIntercept: null, directionalAccuracy: null };
  }
  const errors = pairs.map((p) => p.predicted - p.actual);
  const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);

  const meanP = pairs.reduce((s, p) => s + p.predicted, 0) / pairs.length;
  const meanA = pairs.reduce((s, p) => s + p.actual, 0) / pairs.length;
  let cov = 0;
  let varP = 0;
  let varA = 0;
  for (const p of pairs) {
    cov += (p.predicted - meanP) * (p.actual - meanA);
    varP += (p.predicted - meanP) ** 2;
    varA += (p.actual - meanA) ** 2;
  }
  const correlation = varP < 1e-12 || varA < 1e-12 ? null : cov / Math.sqrt(varP * varA);
  const calibrationSlope = varP < 1e-12 ? null : cov / varP;
  const calibrationIntercept = calibrationSlope === null ? null : meanA - calibrationSlope * meanP;

  return { n: pairs.length, mae, rmse, correlation, calibrationSlope, calibrationIntercept, directionalAccuracy: null };
}

export type Phase4EvaluationBundle = {
  homeScore: EvaluationSummary;
  awayScore: EvaluationSummary;
  margin: EvaluationSummary & { directionalAccuracy: number | null };
  total: EvaluationSummary;
  n: number;
};

export function evaluateScorePredictions(predictions: readonly ScorePrediction[]): Phase4EvaluationBundle {
  const valid = predictions.filter(
    (p) =>
      p.expectedHomePoints !== null &&
      p.expectedAwayPoints !== null &&
      p.actualHomePoints !== null &&
      p.actualAwayPoints !== null,
  );

  const homeScore = summarize(valid.map((p) => ({ predicted: p.expectedHomePoints as number, actual: p.actualHomePoints as number })));
  const awayScore = summarize(valid.map((p) => ({ predicted: p.expectedAwayPoints as number, actual: p.actualAwayPoints as number })));
  const margin = summarize(valid.map((p) => ({ predicted: p.projectedMargin as number, actual: p.actualMargin as number })));
  const total = summarize(valid.map((p) => ({ predicted: p.projectedTotal as number, actual: p.actualTotal as number })));

  const directional = valid.filter((p) => Math.sign(p.projectedMargin as number) === Math.sign(p.actualMargin as number));
  const directionalAccuracy = valid.length === 0 ? null : directional.length / valid.length;

  return { homeScore, awayScore, margin: { ...margin, directionalAccuracy }, total, n: valid.length };
}
