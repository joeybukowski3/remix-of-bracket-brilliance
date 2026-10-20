/**
 * Error and probability scoring. Pure; no data access.
 */
export interface ErrorSummary {
  n: number;
  mae: number | null;
  medianAe: number | null;
  /** Mean of (predicted - actual); positive = over-projection. */
  bias: number | null;
  rmse: number | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @param pairs [predicted, actual] */
export function summarizeErrors(pairs: ReadonlyArray<readonly [number, number]>): ErrorSummary {
  if (pairs.length === 0) return { n: 0, mae: null, medianAe: null, bias: null, rmse: null };
  const errors = pairs.map(([predicted, actual]) => predicted - actual);
  const n = errors.length;
  return {
    n,
    mae: errors.reduce((sum, e) => sum + Math.abs(e), 0) / n,
    medianAe: median(errors.map(Math.abs)),
    bias: errors.reduce((sum, e) => sum + e, 0) / n,
    rmse: Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / n),
  };
}

export interface ProbabilityScore {
  n: number;
  brier: number | null;
  logLoss: number | null;
  /** Share correct at a 0.5 threshold. */
  accuracy: number | null;
  observedRate: number | null;
  meanPredicted: number | null;
}

const LOG_EPS = 1e-6;

/** @param pairs [predicted probability, outcome 0|1] */
export function scoreProbabilities(pairs: ReadonlyArray<readonly [number, 0 | 1]>): ProbabilityScore {
  const n = pairs.length;
  if (n === 0) return { n: 0, brier: null, logLoss: null, accuracy: null, observedRate: null, meanPredicted: null };
  const clamp = (p: number) => Math.min(Math.max(p, LOG_EPS), 1 - LOG_EPS);
  return {
    n,
    brier: pairs.reduce((sum, [p, y]) => sum + (p - y) ** 2, 0) / n,
    logLoss: -pairs.reduce((sum, [p, y]) => sum + (y === 1 ? Math.log(clamp(p)) : Math.log(1 - clamp(p))), 0) / n,
    accuracy: pairs.filter(([p, y]) => (p >= 0.5 ? 1 : 0) === y).length / n,
    observedRate: pairs.reduce((sum, [, y]) => sum + y, 0) / n,
    meanPredicted: pairs.reduce((sum, [p]) => sum + p, 0) / n,
  };
}

export interface CalibrationBin {
  lower: number;
  upper: number;
  n: number;
  meanPredicted: number | null;
  observedRate: number | null;
}

export const DEFAULT_CALIBRATION_EDGES = [0, 0.5, 0.8, 0.95, 1] as const;

/** Bins are [lower, upper) except the last, which includes its upper edge. */
export function calibrationBins(pairs: ReadonlyArray<readonly [number, 0 | 1]>, edges: readonly number[] = DEFAULT_CALIBRATION_EDGES): CalibrationBin[] {
  return edges.slice(0, -1).map((lower, i) => {
    const upper = edges[i + 1];
    const last = i === edges.length - 2;
    const inBin = pairs.filter(([p]) => p >= lower && (last ? p <= upper : p < upper));
    const n = inBin.length;
    return {
      lower,
      upper,
      n,
      meanPredicted: n === 0 ? null : inBin.reduce((sum, [p]) => sum + p, 0) / n,
      observedRate: n === 0 ? null : inBin.reduce((sum, [, y]) => sum + y, 0) / n,
    };
  });
}

/** Lower and upper tercile cut points, or null with fewer than 3 values. */
export function terciles(values: readonly number[]): [number, number] | null {
  if (values.length < 3) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
}
