export type DistributionStats = { n: number; mean: number | null; sd: number | null; skewness: number | null; kurtosis: number | null };

export function computeDistributionStats(values: readonly number[]): DistributionStats {
  const n = values.length;
  if (n === 0) return { n: 0, mean: null, sd: null, skewness: null, kurtosis: null };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd < 1e-9) return { n, mean, sd, skewness: null, kurtosis: null };
  const skewness = values.reduce((s, v) => s + ((v - mean) / sd) ** 3, 0) / n;
  const kurtosis = values.reduce((s, v) => s + ((v - mean) / sd) ** 4, 0) / n - 3;
  return { n, mean, sd, skewness, kurtosis };
}

export function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n < 2 || xs.length !== ys.length) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (xs[i] - meanX) * (ys[i] - meanY);
    varX += (xs[i] - meanX) ** 2;
    varY += (ys[i] - meanY) ** 2;
  }
  return varX < 1e-12 || varY < 1e-12 ? null : cov / Math.sqrt(varX * varY);
}

export function quantile(sortedValues: readonly number[], p: number): number | null {
  if (sortedValues.length === 0) return null;
  const idx = (sortedValues.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedValues[lower];
  const frac = idx - lower;
  return sortedValues[lower] * (1 - frac) + sortedValues[upper] * frac;
}
