/**
 * Simple empirical prediction-interval groundwork (Phase 7 §8). No formal
 * distributional assumption -- intervals are built from the empirical
 * quantiles of (actual - predicted) residuals observed on DEVELOPMENT
 * folds only, then their REALIZED coverage is checked against the 2025
 * frozen benchmark (held out, never used to build the interval itself).
 * Never claims a coverage level without measuring it.
 */

export type NflResidualQuantiles = {
  nominalLevel: number; // e.g. 0.9 for a 90% nominal interval
  lowQuantile: number; // signed residual (actual - predicted) at the low tail
  highQuantile: number; // signed residual at the high tail
  sampleSize: number;
};

function quantile(sortedValues: readonly number[], p: number): number {
  if (sortedValues.length === 0) throw new Error("Cannot compute a quantile of an empty sample.");
  const index = p * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/** Builds an empirical residual-quantile interval from a DEVELOPMENT sample of (actual, predicted) pairs. */
export function computeResidualQuantiles(
  pairs: readonly { actual: number; predicted: number }[],
  nominalLevel: number,
): NflResidualQuantiles {
  const residuals = [...pairs.map((p) => p.actual - p.predicted)].sort((a, b) => a - b);
  const tail = (1 - nominalLevel) / 2;
  return {
    nominalLevel,
    lowQuantile: quantile(residuals, tail),
    highQuantile: quantile(residuals, 1 - tail),
    sampleSize: residuals.length,
  };
}

export type NflPredictionInterval = { low: number; high: number };

/** Applies a residual-quantile interval to a single point prediction, clamped to be non-negative (a yardage total cannot be negative). */
export function applyInterval(pointPrediction: number, quantiles: NflResidualQuantiles): NflPredictionInterval {
  return {
    low: Math.max(0, pointPrediction + quantiles.lowQuantile),
    high: Math.max(0, pointPrediction + quantiles.highQuantile),
  };
}

/** Fraction of held-out pairs whose actual value fell inside the interval built from a (different) development sample -- the honest, measured coverage number. */
export function realizedCoverage(
  heldOutPairs: readonly { actual: number; predicted: number }[],
  quantiles: NflResidualQuantiles,
): number {
  if (heldOutPairs.length === 0) return 0;
  let covered = 0;
  for (const pair of heldOutPairs) {
    const interval = applyInterval(pair.predicted, quantiles);
    if (pair.actual >= interval.low && pair.actual <= interval.high) covered += 1;
  }
  return covered / heldOutPairs.length;
}

export function averageIntervalWidth(
  pairs: readonly { predicted: number }[],
  quantiles: NflResidualQuantiles,
): number {
  if (pairs.length === 0) return 0;
  const widths = pairs.map((p) => {
    const interval = applyInterval(p.predicted, quantiles);
    return interval.high - interval.low;
  });
  return widths.reduce((s, w) => s + w, 0) / widths.length;
}
