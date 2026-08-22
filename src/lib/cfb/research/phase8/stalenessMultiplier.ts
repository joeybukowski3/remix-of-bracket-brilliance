import type { StalenessFormId } from "./types";

export type StalenessFormParams = {
  floor: number;
  thresholdLow: number;
  thresholdHigh: number;
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Section 8 — stalenessAdjustment multiplies the prior-ward Ridge penalty
 * λ_i: 1.0 = full baseline pull toward the prior (no acceleration), the
 * configured floor = maximally accelerated decay. THRESHOLD_RAMP is a
 * simple piecewise-linear ramp from 1.0 (at/below thresholdLow) down to
 * floor (at/above thresholdHigh) — transparent and monotonic, never a
 * black-box model (Section 8 requirement). BOUNDED_LOGISTIC is the same
 * idea with a smooth transition instead of a hard ramp, still fully
 * determined by the same three interpretable parameters.
 */
export function stalenessAdjustmentMultiplier(
  form: StalenessFormId,
  adjustedStaleness: number | null,
  params: StalenessFormParams,
): number {
  if (form === "NONE" || adjustedStaleness === null) return 1;
  const { floor, thresholdLow, thresholdHigh } = params;

  if (form === "THRESHOLD_RAMP") {
    if (adjustedStaleness <= thresholdLow) return 1;
    if (adjustedStaleness >= thresholdHigh) return floor;
    const t = (adjustedStaleness - thresholdLow) / (thresholdHigh - thresholdLow);
    return 1 - t * (1 - floor);
  }

  // BOUNDED_LOGISTIC: centered at the midpoint of [thresholdLow, thresholdHigh], scaled so the
  // curve is ~flat outside that window — same three parameters, smoother transition.
  const midpoint = (thresholdLow + thresholdHigh) / 2;
  const scale = Math.max(1e-6, (thresholdHigh - thresholdLow) / 4);
  const sigmoid = 1 / (1 + Math.exp(-(adjustedStaleness - midpoint) / scale));
  return 1 - clamp01(sigmoid) * (1 - floor);
}
