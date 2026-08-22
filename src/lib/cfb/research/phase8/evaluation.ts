import { evaluatePredictions } from "../phase2/evaluation";
import type { WalkForwardPrediction } from "../phase2/types";
import type { EvalRow, Phase8Prediction } from "./types";

export function toWalkForwardPredictions(predictions: readonly Phase8Prediction[]): WalkForwardPrediction[] {
  return predictions.map((p) => ({
    season: p.season,
    week: p.week,
    gameId: p.gameId,
    homeTeamExternalId: p.homeTeamExternalId,
    awayTeamExternalId: p.awayTeamExternalId,
    ratingDifferential: null,
    predictedMargin: p.projectedMargin,
    actualMargin: p.actualMargin,
  }));
}

export function evalRow(predictions: readonly Phase8Prediction[]): EvalRow {
  const summary = evaluatePredictions(toWalkForwardPredictions(predictions));
  return {
    n: summary.n,
    mae: summary.mae,
    rmse: summary.rmse,
    correlation: summary.correlation,
    calibrationSlope: summary.calibrationSlope,
    calibrationIntercept: summary.calibrationIntercept,
  };
}

/** Section 13 — the tuning-selection score: equal-weighted overall MAE + weeks 1-4 MAE (both lower-is-better, same units). Never touches market data. */
export function selectionScore(predictions: readonly Phase8Prediction[]): number | null {
  const overall = evalRow(predictions);
  const weeks1to4 = evalRow(predictions.filter((p) => p.week <= 4));
  if (overall.mae === null || weeks1to4.mae === null) return null;
  return 0.5 * overall.mae + 0.5 * weeks1to4.mae;
}
