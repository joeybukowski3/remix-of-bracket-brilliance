import { weightedRate } from "./weightedStats";
import type { WeightedPlay } from "./teamGameAggregation.types";

export type SuccessRateBundle = {
  ppaSuccessRate: number | null;
  earlyDownPpaSuccessRate: number | null;
  passingDownPpaSuccessRate: number | null;
  downDistanceSuccessRate: number | null;
  earlyDownDownDistanceSuccessRate: number | null;
  passingDownDownDistanceSuccessRate: number | null;
};

/**
 * Section 6: two distinct, never-combined success definitions.
 * A) jkbPpaSuccess = providerPpa > 0 (only where providerPpa is non-null).
 * B) jkbDownDistanceSuccess = configurable gain-vs-distance rule (see metricsConfig).
 */
export function computeSuccessRates(rows: readonly WeightedPlay[]): SuccessRateBundle {
  const rate = (predicate: (row: WeightedPlay) => boolean, value: (row: WeightedPlay) => boolean | null) =>
    weightedRate(rows.filter(predicate).map((row) => ({ value: value(row), weight: row.weight }))).rate;

  return {
    ppaSuccessRate: rate(() => true, (row) => row.row.ppaSuccess),
    earlyDownPpaSuccessRate: rate((row) => row.row.isEarlyDown, (row) => row.row.ppaSuccess),
    passingDownPpaSuccessRate: rate((row) => row.row.isPassingDown, (row) => row.row.ppaSuccess),
    downDistanceSuccessRate: rate(() => true, (row) => row.row.downDistanceSuccess),
    earlyDownDownDistanceSuccessRate: rate((row) => row.row.isEarlyDown, (row) => row.row.downDistanceSuccess),
    passingDownDownDistanceSuccessRate: rate((row) => row.row.isPassingDown, (row) => row.row.downDistanceSuccess),
  };
}
