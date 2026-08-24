import { CFB_PHASE1_METRICS_CONFIG } from "./metricsConfig";
import type { CfbResearchPlayCategory } from "./types";

const INELIGIBLE = new Set(CFB_PHASE1_METRICS_CONFIG.ineligibleScrimmageCategories);

/**
 * Section 4: turnovers and sacks are football outcomes and remain
 * eligible (they carry a meaningful providerPpa value). Only the
 * administrative/no-snap categories listed in metricsConfig are excluded.
 */
export function isEligibleScrimmagePlay(category: CfbResearchPlayCategory): boolean {
  return !INELIGIBLE.has(category);
}

export function isTwoPointTryCategory(category: CfbResearchPlayCategory): boolean {
  return category === "two_point_try";
}

/** CFBD periods 1-4 are regulation; period >= 5 is overtime. */
export function isOvertimePeriod(period: number | null): boolean {
  return period !== null && period >= 5;
}
