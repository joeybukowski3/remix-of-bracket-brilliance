export type NflOpportunityMetrics = {
  n: number;
  mae: number;
  rmse: number;
  bias: number; // mean(predicted - actual); positive = overprojecting
  correlation: number | null;
  r2: number | null;
  medianAbsoluteError: number;
};

export type NflOpportunityPredictionPair = { actual: number; predicted: number };

function mean(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeMetrics(pairs: readonly NflOpportunityPredictionPair[]): NflOpportunityMetrics | null {
  if (pairs.length === 0) return null;
  const errors = pairs.map((p) => p.predicted - p.actual);
  const absErrors = errors.map((e) => Math.abs(e));
  const mae = mean(absErrors);
  const rmse = Math.sqrt(mean(errors.map((e) => e * e)));
  const bias = mean(errors);
  const medianAbsoluteError = median(absErrors);

  const actuals = pairs.map((p) => p.actual);
  const predicted = pairs.map((p) => p.predicted);
  const actualMean = mean(actuals);
  const predictedMean = mean(predicted);
  const covariance = mean(pairs.map((p) => (p.actual - actualMean) * (p.predicted - predictedMean)));
  const actualStd = Math.sqrt(mean(actuals.map((a) => (a - actualMean) ** 2)));
  const predictedStd = Math.sqrt(mean(predicted.map((p) => (p - predictedMean) ** 2)));
  const correlation = actualStd > 1e-9 && predictedStd > 1e-9 ? covariance / (actualStd * predictedStd) : null;

  const totalSumSquares = actuals.reduce((s, a) => s + (a - actualMean) ** 2, 0);
  const residualSumSquares = pairs.reduce((s, p) => s + (p.actual - p.predicted) ** 2, 0);
  const r2 = totalSumSquares > 1e-9 ? 1 - residualSumSquares / totalSumSquares : null;

  return { n: pairs.length, mae, rmse, bias, correlation, r2, medianAbsoluteError };
}

export type NflWeekBand = "week1" | "weeks2to3" | "weeks4to8" | "weeks9plus";

export function weekBand(week: number): NflWeekBand {
  if (week === 1) return "week1";
  if (week <= 3) return "weeks2to3";
  if (week <= 8) return "weeks4to8";
  return "weeks9plus";
}

export type NflTotalBand = "lowTotal" | "midTotal" | "highTotal" | "unknown";

/** Tertile-independent fixed bands so results are comparable across seasons; thresholds chosen from the observed 2022-2025 total distribution (~41-47 median). */
export function totalBand(total: number | null): NflTotalBand {
  if (total == null) return "unknown";
  if (total < 43) return "lowTotal";
  if (total <= 47) return "midTotal";
  return "highTotal";
}

/** Generic grouped-metrics helper: buckets pairs by `keyFn` and computes metrics per bucket. */
export function metricsByGroup<T>(
  rows: readonly T[],
  keyFn: (row: T) => string,
  pairFn: (row: T) => NflOpportunityPredictionPair,
): Record<string, NflOpportunityMetrics> {
  const groups = new Map<string, NflOpportunityPredictionPair[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = groups.get(key) ?? [];
    list.push(pairFn(row));
    groups.set(key, list);
  }
  const result: Record<string, NflOpportunityMetrics> = {};
  for (const [key, pairs] of groups) {
    const metrics = computeMetrics(pairs);
    if (metrics) result[key] = metrics;
  }
  return result;
}
