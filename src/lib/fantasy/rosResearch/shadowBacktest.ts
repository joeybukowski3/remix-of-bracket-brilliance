/**
 * ROS projection authority -- Phase 3 leakage-safe historical backtest.
 *
 * Compares each historical-baseline weighting option (and a usage-adjusted
 * variant of the selected one) against an actual future season's PPG,
 * using only data available before that season. With three approved
 * history seasons (2023-2025) the only leakage-safe fold available is
 * training on 2023-2024 to predict actual 2025 PPG -- there is no season
 * before 2023 in the approved source to run a second fold, and the
 * team/FPA/market adjustments cannot be backtested at all here because
 * their inputs (the 2026 schedule and current market) have no historical
 * analogue for a past season in this dataset. That limitation is reported
 * verbatim in the generated artifact rather than glossed over.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { computeHistoricalBaselineOptions, computeUsageAdjustment } from "@/lib/fantasy/rosResearch/shadowProjection";
import type { PlayerSeasonBaseline } from "@/lib/fantasy/rosResearch/historicalBaseline";
import type { SeasonUsageAverage } from "@/lib/fantasy/rosResearch/usageRoleContext";
import type { HistoricalBaselineWeightingId } from "@/lib/fantasy/rosResearch/shadowProjectionConfig";

export type BacktestCase = {
  playerId: string;
  position: FantasyPosition;
  trainingSeasons: readonly PlayerSeasonBaseline[]; // seasons strictly before the label season
  trainingUsageSeasons: readonly SeasonUsageAverage[];
  labelSeason: number;
  labelPpg: number;
};

export type BacktestMetrics = {
  n: number;
  mae: number;
  rmse: number;
  bias: number; // mean(predicted - actual); positive = model runs hot
  correlation: number | null;
  positionalCalibration: Partial<Record<FantasyPosition, { n: number; meanPredicted: number; meanActual: number }>>;
  outliers: Array<{ playerId: string; predicted: number; actual: number; residual: number }>;
};

function metrics(pairs: readonly { playerId: string; position: FantasyPosition; predicted: number; actual: number }[]): BacktestMetrics {
  const n = pairs.length;
  if (!n) {
    return { n: 0, mae: NaN, rmse: NaN, bias: NaN, correlation: null, positionalCalibration: {}, outliers: [] };
  }
  const residuals = pairs.map((p) => p.predicted - p.actual);
  const mae = residuals.reduce((s, r) => s + Math.abs(r), 0) / n;
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);
  const bias = residuals.reduce((s, r) => s + r, 0) / n;

  let correlation: number | null = null;
  if (n >= 2) {
    const meanP = pairs.reduce((s, p) => s + p.predicted, 0) / n;
    const meanA = pairs.reduce((s, p) => s + p.actual, 0) / n;
    const cov = pairs.reduce((s, p) => s + (p.predicted - meanP) * (p.actual - meanA), 0);
    const varP = pairs.reduce((s, p) => s + (p.predicted - meanP) ** 2, 0);
    const varA = pairs.reduce((s, p) => s + (p.actual - meanA) ** 2, 0);
    correlation = varP > 0 && varA > 0 ? cov / Math.sqrt(varP * varA) : null;
  }

  const byPosition = new Map<FantasyPosition, { predicted: number; actual: number; n: number }>();
  for (const p of pairs) {
    const cell = byPosition.get(p.position) ?? { predicted: 0, actual: 0, n: 0 };
    cell.predicted += p.predicted;
    cell.actual += p.actual;
    cell.n += 1;
    byPosition.set(p.position, cell);
  }
  const positionalCalibration: BacktestMetrics["positionalCalibration"] = {};
  for (const [position, cell] of byPosition) {
    positionalCalibration[position] = { n: cell.n, meanPredicted: cell.predicted / cell.n, meanActual: cell.actual / cell.n };
  }

  const outlierThreshold = 8;
  const outliers = pairs
    .map((p, index) => ({ playerId: p.playerId, predicted: p.predicted, actual: p.actual, residual: residuals[index] }))
    .filter((row) => Math.abs(row.residual) >= outlierThreshold)
    .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));

  return { n, mae, rmse, bias, correlation, positionalCalibration, outliers };
}

export type BacktestResult = {
  labelSeason: number;
  trainingSeasons: number[];
  baselineWeighting: Record<HistoricalBaselineWeightingId, BacktestMetrics>;
  usageAdjustedRecencyWeightedMinSample: BacktestMetrics;
};

export function runHistoricalBaselineBacktest(cases: readonly BacktestCase[], trainingSeasons: number[]): BacktestResult {
  const byWeighting: Record<HistoricalBaselineWeightingId, Array<{ playerId: string; position: FantasyPosition; predicted: number; actual: number }>> = {
    "latest-season": [],
    "recency-weighted": [],
    "recency-weighted-min-sample": [],
  };
  const usageAdjustedPairs: Array<{ playerId: string; position: FantasyPosition; predicted: number; actual: number }> = [];

  for (const testCase of cases) {
    const options = computeHistoricalBaselineOptions(testCase.trainingSeasons);
    for (const weightingId of Object.keys(byWeighting) as HistoricalBaselineWeightingId[]) {
      const predicted = options[weightingId].ppg;
      if (predicted == null) continue;
      byWeighting[weightingId].push({ playerId: testCase.playerId, position: testCase.position, predicted, actual: testCase.labelPpg });
    }

    const selected = options["recency-weighted-min-sample"];
    if (selected.ppg == null) continue;
    const usageFactor = computeUsageAdjustment(testCase.position, testCase.trainingUsageSeasons);
    usageAdjustedPairs.push({
      playerId: testCase.playerId,
      position: testCase.position,
      predicted: selected.ppg * usageFactor.factor,
      actual: testCase.labelPpg,
    });
  }

  return {
    labelSeason: cases[0]?.labelSeason ?? NaN,
    trainingSeasons,
    baselineWeighting: {
      "latest-season": metrics(byWeighting["latest-season"]),
      "recency-weighted": metrics(byWeighting["recency-weighted"]),
      "recency-weighted-min-sample": metrics(byWeighting["recency-weighted-min-sample"]),
    },
    usageAdjustedRecencyWeightedMinSample: metrics(usageAdjustedPairs),
  };
}
