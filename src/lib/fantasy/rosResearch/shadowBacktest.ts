/**
 * ROS projection authority -- Phase 3/3B leakage-safe historical backtest.
 *
 * Compares each historical-baseline weighting option (and usage-adjusted
 * variants) against an actual future season's PPG, using only data
 * available before that season. The committed nflverse player-week caches
 * cover 2022-2025, so two leakage-safe folds are possible without
 * fabricating a source: train on 2022-2023 -> label actual 2024 PPG, and
 * train on 2023-2024 -> label actual 2025 PPG. There is no season before
 * 2022 in the cached source, so a third fold is not available. The
 * team/FPA/market adjustments still cannot be backtested here because their
 * inputs (the 2026 schedule and current market) have no historical
 * analogue for a past season in this dataset -- reported verbatim in the
 * generated artifact rather than glossed over.
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

export type BacktestPair = { playerId: string; position: FantasyPosition; predicted: number; actual: number };

export function computeBacktestMetrics(pairs: readonly BacktestPair[]): BacktestMetrics {
  return metrics(pairs);
}

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

/** Raw predicted/actual pairs for the selected weighting (recency-weighted-min-sample, no usage adjustment) for one fold's cases -- the input `aggregateFolds` pools across folds. */
export function selectedWeightingPairs(cases: readonly BacktestCase[]): BacktestPair[] {
  const pairs: BacktestPair[] = [];
  for (const testCase of cases) {
    const predicted = computeHistoricalBaselineOptions(testCase.trainingSeasons)["recency-weighted-min-sample"].ppg;
    if (predicted == null) continue;
    pairs.push({ playerId: testCase.playerId, position: testCase.position, predicted, actual: testCase.labelPpg });
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Phase 3B -- usage adjustment cap experiment
// ---------------------------------------------------------------------------

export type UsageCapExperimentResult = {
  capsTested: number[];
  byCap: Record<string, { overall: BacktestMetrics; byPosition: Partial<Record<FantasyPosition, BacktestMetrics>> }>;
  noUsageBaseline: { overall: BacktestMetrics; byPosition: Partial<Record<FantasyPosition, BacktestMetrics>> };
};

/**
 * Tests the recency-weighted-min-sample baseline with no usage adjustment
 * and with each cap in `capsToTest` applied, overall and split by position
 * (QB is always neutral -- see USAGE_SIGNAL_FIELD_BY_POSITION -- and is
 * reported as such rather than omitted). Every case uses only training-side
 * seasons; leakage-safe by construction, same as `runHistoricalBaselineBacktest`.
 */
export function runUsageCapExperiment(cases: readonly BacktestCase[], capsToTest: readonly number[]): UsageCapExperimentResult {
  function byPositionMetrics(pairs: readonly BacktestPair[]): Partial<Record<FantasyPosition, BacktestMetrics>> {
    const grouped = new Map<FantasyPosition, BacktestPair[]>();
    for (const pair of pairs) grouped.set(pair.position, [...(grouped.get(pair.position) ?? []), pair]);
    const out: Partial<Record<FantasyPosition, BacktestMetrics>> = {};
    for (const [position, positionPairs] of grouped) out[position] = metrics(positionPairs);
    return out;
  }

  function pairsWithCap(cap: number | null): BacktestPair[] {
    const pairs: BacktestPair[] = [];
    for (const testCase of cases) {
      const baseline = computeHistoricalBaselineOptions(testCase.trainingSeasons)["recency-weighted-min-sample"];
      if (baseline.ppg == null) continue;
      const factor = cap == null ? 1 : computeUsageAdjustment(testCase.position, testCase.trainingUsageSeasons, cap).factor;
      pairs.push({ playerId: testCase.playerId, position: testCase.position, predicted: baseline.ppg * factor, actual: testCase.labelPpg });
    }
    return pairs;
  }

  const noUsagePairs = pairsWithCap(null);
  const byCap: UsageCapExperimentResult["byCap"] = {};
  for (const cap of capsToTest) {
    const pairs = pairsWithCap(cap);
    byCap[String(cap)] = { overall: metrics(pairs), byPosition: byPositionMetrics(pairs) };
  }

  return {
    capsTested: [...capsToTest],
    byCap,
    noUsageBaseline: { overall: metrics(noUsagePairs), byPosition: byPositionMetrics(noUsagePairs) },
  };
}

// ---------------------------------------------------------------------------
// Phase 3B -- multi-fold aggregation
// ---------------------------------------------------------------------------

export type FoldResult = { labelSeason: number; trainingSeasons: number[]; metrics: BacktestMetrics };

/** Pools raw prediction/actual pairs across every fold that used the same weighting methodology and reports one combined metrics block, alongside each fold's own metrics for transparency. Never averages MAE-of-MAE; recomputes from pooled pairs so it is a real aggregate, not an approximation. */
export function aggregateFolds(folds: readonly { labelSeason: number; trainingSeasons: number[]; pairs: readonly BacktestPair[] }[]): {
  perFold: FoldResult[];
  aggregate: BacktestMetrics;
} {
  return {
    perFold: folds.map((fold) => ({ labelSeason: fold.labelSeason, trainingSeasons: fold.trainingSeasons, metrics: metrics(fold.pairs) })),
    aggregate: metrics(folds.flatMap((fold) => fold.pairs)),
  };
}
