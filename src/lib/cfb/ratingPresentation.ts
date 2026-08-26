export type CfbRatingBand =
  | "elite"
  | "great"
  | "strong"
  | "good"
  | "average"
  | "below-average"
  | "weak"
  | "poor"
  | "unavailable";

export type CfbRatingPresentation = {
  band: CfbRatingBand;
  label: string;
  range: string;
  className: string;
};

export const CFB_RATING_TIERS: ReadonlyArray<CfbRatingPresentation & { minimum: number }> = [
  { band: "elite", label: "Elite", range: "95+", minimum: 95, className: "bg-amber-200 text-amber-950" },
  { band: "great", label: "Great", range: "90–94", minimum: 90, className: "bg-emerald-700 text-white" },
  { band: "strong", label: "Strong", range: "85–89", minimum: 85, className: "bg-emerald-200 text-emerald-950" },
  { band: "good", label: "Good", range: "80–84", minimum: 80, className: "bg-emerald-50 text-emerald-800" },
  { band: "average", label: "Average", range: "70–79", minimum: 70, className: "bg-lime-100 text-lime-900" },
  { band: "below-average", label: "Below Avg", range: "60–69", minimum: 60, className: "bg-amber-100 text-amber-900" },
  { band: "weak", label: "Weak", range: "50–59", minimum: 50, className: "bg-orange-100 text-orange-900" },
  { band: "poor", label: "Poor", range: "<50", minimum: Number.NEGATIVE_INFINITY, className: "bg-rose-100 text-rose-900" },
];

const UNAVAILABLE_PRESENTATION: CfbRatingPresentation = {
  band: "unavailable",
  label: "Unavailable",
  range: "—",
  className: "text-slate-500",
};

export function getCfbRatingPresentation(
  value: number | null | undefined,
): CfbRatingPresentation {
  if (value == null || Number.isNaN(value)) return UNAVAILABLE_PRESENTATION;
  return CFB_RATING_TIERS.find((tier) => value >= tier.minimum) ?? UNAVAILABLE_PRESENTATION;
}

export function getCfbRatingBand(value: number | null | undefined): CfbRatingBand {
  return getCfbRatingPresentation(value).band;
}

export function getCfbRatingHeatClass(value: number | null | undefined): string {
  return getCfbRatingPresentation(value).className;
}

/**
 * Presentation-only anchors for the JKB power bar visualization.
 * Not a statistical scale — purely a clamped display range so ratings
 * render as a readable horizontal bar. Does not alter JKB rating math.
 */
export const CFB_POWER_BAR_MIN = 40;
export const CFB_POWER_BAR_MAX = 100;

/** Clamped 0–100 fill percentage for the JKB power bar. Null-safe. */
export function getCfbPowerBarWidthPercent(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  const clamped = Math.min(CFB_POWER_BAR_MAX, Math.max(CFB_POWER_BAR_MIN, value));
  return ((clamped - CFB_POWER_BAR_MIN) / (CFB_POWER_BAR_MAX - CFB_POWER_BAR_MIN)) * 100;
}

/**
 * Offense/defense ratings share the exact same generated 40–100 distribution
 * as JKB power (audited against data/generated/cfb/2026-preseason-ratings-v1.1.json:
 * jkbOffense/jkbDefense min 40.00, max 98.57 — identical range to jkbPower).
 * Reuse the same anchors rather than inventing a second scale.
 */
export const getCfbOffenseBarWidthPercent = getCfbPowerBarWidthPercent;
export const getCfbDefenseBarWidthPercent = getCfbPowerBarWidthPercent;

/**
 * Contiguous two-team split (0-100 each, summing to 100) for a single shared
 * comparison bar. Computed directly from each side's raw rating value —
 * NOT from two independently clamped/rescaled display widths — so the
 * visual ratio matches the actual relative magnitude of the two ratings.
 *
 * Taking a ratio of two already-clamped widths would distort the comparison:
 * e.g. raw 45.1 vs 78.5 clamps to display widths 8.5 vs 64.2 (both compressed
 * toward the 40-point floor by different amounts), whose ratio (~12/88) wildly
 * overstates the real ~36/64 gap between the raw values.
 */
export function getCfbSharedBarSplit(
  awayValue: number | null | undefined,
  homeValue: number | null | undefined,
): { awayShare: number; homeShare: number } {
  const awayUsable = awayValue != null && !Number.isNaN(awayValue);
  const homeUsable = homeValue != null && !Number.isNaN(homeValue);
  if (!awayUsable && !homeUsable) return { awayShare: 50, homeShare: 50 };
  if (!awayUsable) return { awayShare: 0, homeShare: 100 };
  if (!homeUsable) return { awayShare: 100, homeShare: 0 };
  const total = awayValue + homeValue;
  if (total <= 0) return { awayShare: 50, homeShare: 50 };
  const awayShare = (awayValue / total) * 100;
  return { awayShare, homeShare: 100 - awayShare };
}
