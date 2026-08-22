import { WIN_PROBABILITY_BUCKETS } from "./config";

export type WinProbabilityRow = { pHomeWin: number; homeWon: boolean };

export function computeBrierScore(rows: readonly WinProbabilityRow[]): number | null {
  if (rows.length === 0) return null;
  const sum = rows.reduce((s, r) => s + (r.pHomeWin - (r.homeWon ? 1 : 0)) ** 2, 0);
  return sum / rows.length;
}

const LOG_LOSS_EPSILON = 1e-6;

export function computeLogLoss(rows: readonly WinProbabilityRow[]): number | null {
  if (rows.length === 0) return null;
  const sum = rows.reduce((s, r) => {
    const p = Math.min(1 - LOG_LOSS_EPSILON, Math.max(LOG_LOSS_EPSILON, r.pHomeWin));
    return s + (r.homeWon ? -Math.log(p) : -Math.log(1 - p));
  }, 0);
  return sum / rows.length;
}

export type CalibrationBucketResult = { label: string; n: number; meanPredicted: number | null; empiricalWinRate: number | null };

/** Section 10: reliability by probability bucket, using the STRONGER side's probability (max(pHome, 1-pHome)) so buckets represent confidence regardless of which side is favored. */
export function computeCalibrationBuckets(rows: readonly WinProbabilityRow[]): CalibrationBucketResult[] {
  return WIN_PROBABILITY_BUCKETS.map((bucket) => {
    const inBucket = rows
      .map((r) => {
        const favoredProb = Math.max(r.pHomeWin, 1 - r.pHomeWin);
        const favoredWon = r.pHomeWin >= 0.5 ? r.homeWon : !r.homeWon;
        return { favoredProb, favoredWon };
      })
      .filter((r) => r.favoredProb >= bucket.min && r.favoredProb < bucket.max);
    if (inBucket.length === 0) return { label: bucket.label, n: 0, meanPredicted: null, empiricalWinRate: null };
    return {
      label: bucket.label,
      n: inBucket.length,
      meanPredicted: inBucket.reduce((s, r) => s + r.favoredProb, 0) / inBucket.length,
      empiricalWinRate: inBucket.filter((r) => r.favoredWon).length / inBucket.length,
    };
  });
}

/** Expected Calibration Error: bucket-size-weighted mean |predicted - empirical|. */
export function computeExpectedCalibrationError(buckets: readonly CalibrationBucketResult[]): number | null {
  const withData = buckets.filter((b) => b.n > 0 && b.meanPredicted !== null && b.empiricalWinRate !== null);
  const total = withData.reduce((s, b) => s + b.n, 0);
  if (total === 0) return null;
  return withData.reduce((s, b) => s + b.n * Math.abs((b.meanPredicted as number) - (b.empiricalWinRate as number)), 0) / total;
}

export type IntervalCoverageRow = { actual: number; interval: [number, number] };

export function computeIntervalCoverage(rows: readonly IntervalCoverageRow[]): { n: number; coverage: number | null; meanWidth: number | null } {
  if (rows.length === 0) return { n: 0, coverage: null, meanWidth: null };
  const covered = rows.filter((r) => r.actual >= r.interval[0] && r.actual <= r.interval[1]).length;
  const meanWidth = rows.reduce((s, r) => s + (r.interval[1] - r.interval[0]), 0) / rows.length;
  return { n: rows.length, coverage: covered / rows.length, meanWidth };
}
