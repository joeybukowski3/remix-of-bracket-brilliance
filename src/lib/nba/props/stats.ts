/**
 * Paired-loss comparison with cluster-robust confidence intervals.
 *
 * Errors from the same player (or the same stretch of the calendar) are
 * correlated, so a naive SE overstates certainty. The SE here is the
 * cluster-robust (CR1) standard error of the mean paired difference.
 */

export interface PairedLoss {
  /** Loss of the candidate (e.g. |error| of v1). */
  candidate: number;
  /** Loss of the benchmark (e.g. |error| of v0). */
  benchmark: number;
  cluster: string | number;
}

export interface PairedDifference {
  n: number;
  clusters: number;
  /** Mean of candidate - benchmark; negative favors the candidate. */
  meanDiff: number | null;
  se: number | null;
  ci95: [number, number] | null;
}

const Z95 = 1.959963984540054;
const DAY_MS = 86_400_000;

export function pairedDifference(items: readonly PairedLoss[]): PairedDifference {
  const n = items.length;
  if (n === 0) return { n: 0, clusters: 0, meanDiff: null, se: null, ci95: null };
  const meanDiff = items.reduce((sum, item) => sum + item.candidate - item.benchmark, 0) / n;
  const sums = new Map<string | number, number>();
  for (const item of items) {
    sums.set(item.cluster, (sums.get(item.cluster) ?? 0) + (item.candidate - item.benchmark - meanDiff));
  }
  const g = sums.size;
  if (g < 2) return { n, clusters: g, meanDiff, se: null, ci95: null };
  let squared = 0;
  for (const sum of sums.values()) squared += sum * sum;
  const se = (Math.sqrt(squared) / n) * Math.sqrt(g / (g - 1));
  return { n, clusters: g, meanDiff, se, ci95: [meanDiff - Z95 * se, meanDiff + Z95 * se] };
}

/** Calendar block index (days since 1970-01-01, bucketed) for time-clustered SEs. */
export function timeBlock(gameDate: string, blockDays: number): number {
  if (!Number.isInteger(blockDays) || blockDays < 1) throw new Error("blockDays must be a positive integer");
  return Math.floor(Date.parse(gameDate) / DAY_MS / blockDays);
}
