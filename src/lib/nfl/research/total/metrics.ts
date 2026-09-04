/** Shared evaluation metrics for the NFL total-model research harness (Phase F/G). */

export function mae(errors: readonly number[]): number | null {
  if (errors.length === 0) return null;
  return errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
}

export function rmse(errors: readonly number[]): number | null {
  if (errors.length === 0) return null;
  return Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
}

export function meanBias(errors: readonly number[]): number | null {
  if (errors.length === 0) return null;
  return errors.reduce((s, e) => s + e, 0) / errors.length;
}

export function pearsonCorrelation(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

export type ErrorDistributionBucket = { label: string; min: number; max: number; count: number; share: number };

/** Buckets absolute error into fixed 3-point bands, plus an open-ended tail. */
export function errorDistribution(errors: readonly number[], bandWidth = 3, bands = 6): ErrorDistributionBucket[] {
  const abs = errors.map((e) => Math.abs(e));
  const buckets: ErrorDistributionBucket[] = [];
  for (let i = 0; i < bands; i += 1) {
    const min = i * bandWidth;
    const max = (i + 1) * bandWidth;
    const count = abs.filter((v) => v >= min && v < max).length;
    buckets.push({ label: `${min}-${max}`, min, max, count, share: abs.length > 0 ? count / abs.length : 0 });
  }
  const tailMin = bands * bandWidth;
  const tailCount = abs.filter((v) => v >= tailMin).length;
  buckets.push({ label: `${tailMin}+`, min: tailMin, max: Infinity, count: tailCount, share: abs.length > 0 ? tailCount / abs.length : 0 });
  return buckets;
}

export type CalibrationBucket = { label: string; min: number; max: number; count: number; meanProjected: number | null; meanActual: number | null; meanError: number | null };

/** Buckets rows by their PROJECTED total (never the actual) into fixed-width bands and reports mean actual vs projected inside each -- the standard calibration check. */
export function calibrationByProjectedBucket(
  projected: readonly number[],
  actual: readonly number[],
  bandWidth = 5,
): CalibrationBucket[] {
  if (projected.length === 0) return [];
  const minProjected = Math.floor(Math.min(...projected) / bandWidth) * bandWidth;
  const maxProjected = Math.ceil(Math.max(...projected) / bandWidth) * bandWidth;
  const buckets: CalibrationBucket[] = [];
  for (let min = minProjected; min < maxProjected; min += bandWidth) {
    const max = min + bandWidth;
    const indices = projected.map((p, i) => (p >= min && p < max ? i : -1)).filter((i) => i >= 0);
    const projSlice = indices.map((i) => projected[i]);
    const actualSlice = indices.map((i) => actual[i]);
    buckets.push({
      label: `${min}-${max}`,
      min,
      max,
      count: indices.length,
      meanProjected: projSlice.length > 0 ? projSlice.reduce((s, v) => s + v, 0) / projSlice.length : null,
      meanActual: actualSlice.length > 0 ? actualSlice.reduce((s, v) => s + v, 0) / actualSlice.length : null,
      meanError:
        indices.length > 0
          ? indices.reduce((s, i) => s + (projected[i] - actual[i]), 0) / indices.length
          : null,
    });
  }
  return buckets.filter((b) => b.count > 0);
}
