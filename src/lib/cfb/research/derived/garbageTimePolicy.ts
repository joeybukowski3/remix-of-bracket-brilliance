import { CFB_PHASE1_METRICS_CONFIG } from "./metricsConfig";
import type { CfbGarbageTimePolicyName } from "./types";
import type { PlayMetricRow } from "./playMetricRow";

/**
 * Returns a per-play weight in [0, 1] for the given policy. NONE is the
 * control (always 1). LEVERAGE has no weight function yet — deferred per
 * Section 10 ("remains deferred until it can be computed leakage-safely").
 */
export function computeGarbageTimeWeight(
  row: Pick<PlayMetricRow, "offenseScore" | "defenseScore" | "period">,
  policy: Exclude<CfbGarbageTimePolicyName, "LEVERAGE">,
): number {
  if (policy === "NONE") return 1;

  if (row.offenseScore === null || row.defenseScore === null) return 1; // cannot evaluate margin — do not fabricate exclusion
  const margin = Math.abs(row.offenseScore - row.defenseScore);

  if (policy === "SCORE_QUARTER") {
    if (row.period === null || row.period === 1 || row.period >= 5) return 1; // never auto-apply to Q1 or OT
    const threshold = CFB_PHASE1_METRICS_CONFIG.scoreQuarterThresholds[row.period];
    if (threshold === undefined) return 1;
    return margin > threshold ? 0 : 1;
  }

  // SOFT_WEIGHT: simple linear ramp from 1 down to minWeight between rampStartMargin and rampFullZeroMargin.
  const { rampStartMargin, rampFullZeroMargin, minWeight } = CFB_PHASE1_METRICS_CONFIG.softWeight;
  if (margin <= rampStartMargin) return 1;
  if (margin >= rampFullZeroMargin) return minWeight;
  const progress = (margin - rampStartMargin) / (rampFullZeroMargin - rampStartMargin);
  return 1 - progress * (1 - minWeight);
}
