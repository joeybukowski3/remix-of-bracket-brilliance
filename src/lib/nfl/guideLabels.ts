/**
 * Centralized label logic for the NFL season guide (PR-5).
 *
 * Extracted verbatim from guide2026.ts so pages, data modules and tests share
 * one source of truth. Thresholds are the guide's existing behavior — do not
 * change them without a documented methodology update.
 */

export type NflMarketLean = "Over" | "Under" | "Pass";
export type NflConfidenceLabel = "Low" | "Medium" | "High";
export type NflRegressionSignal = "Bounce Back" | "Regression" | "Stable";

/** Minimum model-vs-market gap (in wins) before the guide leans Over/Under. */
export const MARKET_LEAN_THRESHOLD = 0.75;
/** Gap (in wins) at which a lean is labeled High confidence. */
export const HIGH_CONFIDENCE_THRESHOLD = 1.75;
/** Year-over-year win gap that flags Bounce Back / Regression. */
export const REGRESSION_SIGNAL_THRESHOLD = 1.5;

/** Model projection minus market win total; null when no market total exists. */
export function computeModelVsMarketGap(projectedWins: number, marketWinTotal: number | null): number | null {
  if (marketWinTotal == null) return null;
  return Math.round((projectedWins - marketWinTotal) * 10) / 10;
}

/** Positive gap ≥ threshold → Over; negative gap ≤ -threshold → Under; else Pass. */
export function computeMarketLean(modelVsMarketGap: number | null): NflMarketLean {
  if (modelVsMarketGap == null) return "Pass";
  if (modelVsMarketGap >= MARKET_LEAN_THRESHOLD) return "Over";
  if (modelVsMarketGap <= -MARKET_LEAN_THRESHOLD) return "Under";
  return "Pass";
}

/** Low below the lean threshold, High at/above the high threshold, else Medium. */
export function computeMarketConfidence(modelVsMarketGap: number | null): NflConfidenceLabel {
  if (modelVsMarketGap == null || Math.abs(modelVsMarketGap) < MARKET_LEAN_THRESHOLD) return "Low";
  if (Math.abs(modelVsMarketGap) >= HIGH_CONFIDENCE_THRESHOLD) return "High";
  return "Medium";
}

/** Projected wins vs last season's wins → Bounce Back / Regression / Stable. */
export function computeRegressionSignal(regressionGap: number): NflRegressionSignal {
  if (regressionGap >= REGRESSION_SIGNAL_THRESHOLD) return "Bounce Back";
  if (regressionGap <= -REGRESSION_SIGNAL_THRESHOLD) return "Regression";
  return "Stable";
}

/** Schedule difficulty label from schedule rank (#1 hardest … #32 easiest). */
export function computeScheduleLabel(scheduleRank: number | null): string {
  if (scheduleRank == null) return "Not available";
  if (scheduleRank <= 8) return "Hard";
  if (scheduleRank >= 25) return "Soft";
  return "Average";
}

/** Offense/defense identity from unit rank gap (< 6 apart = balanced). */
export function computeUnitIdentity(offRank: number, defRank: number): string {
  const unitGap = offRank - defRank;
  if (Math.abs(unitGap) < 6) return "balanced profile";
  return unitGap < 0 ? "offense-led profile" : "defense-led profile";
}
