import type { HistoryDeltaSummary } from "./contracts";

/** Missing/nonfinite references never enter the comparison denominator. */
export function summarizeHistoryDeltas(deltas: readonly (number | null | undefined)[]): HistoryDeltaSummary {
  const values = deltas.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  const count = values.length;
  const middle = Math.floor(count / 2);
  return {
    n: deltas.length,
    comparisonCount: count,
    mean: count ? values.reduce((sum, value) => sum + value, 0) / count : null,
    median: count ? count % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 : null,
    aboveCount: values.filter((value) => value > 0).length,
    belowCount: values.filter((value) => value < 0).length,
    equalCount: values.filter((value) => value === 0).length,
    missingCount: deltas.length - count,
  };
}
