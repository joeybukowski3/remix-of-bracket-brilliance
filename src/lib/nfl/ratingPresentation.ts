/**
 * NFL Power Rating (Current OVR) color-scale presentation.
 *
 * Score-based (not rank-based) gold -> green -> low-end scale for the
 * universal Current OVR (src/lib/nfl/currentRating2026.ts). Deliberately a
 * separate module from src/lib/cfb/ratingPresentation.ts rather than a
 * reused import: that helper's bands (Elite 95+, Poor <50) are calibrated to
 * CFB's rating scale, which routinely reaches the high-90s. NFL Current OVR
 * never does.
 *
 * Five seasons of NFL power ratings (public/data/nfl/<year>/power-ratings.json
 * and preseason-power-ratings.json, 2022-2026) consistently top out around
 * 80-88 and bottom out around 16-21:
 *   2022  max 80.87  min 16.30
 *   2023  max 86.75  min 18.24
 *   2024  max 87.81  min 20.34
 *   2025  max 87.51  min 17.39
 *   2026  max 80.85  min 16.25 (preseason)
 * centered on a league-average Current OVR of ~50.25 (see
 * projectionData.ts leagueAverageOVR). The bands below are fixed against
 * that real, multi-season distribution — not derived by ranking only the
 * current 32 teams — so the scale reads consistently week to week and year
 * to year, and a top team reliably lands in the gold "Elite" band.
 */

export type NflRatingBand =
  | "elite"
  | "great"
  | "strong"
  | "good"
  | "average"
  | "below-average"
  | "weak"
  | "poor"
  | "unavailable";

export type NflRatingPresentation = {
  band: NflRatingBand;
  label: string;
  range: string;
  className: string;
};

export const NFL_RATING_TIERS: ReadonlyArray<NflRatingPresentation & { minimum: number }> = [
  { band: "elite", label: "Elite", range: "78+", minimum: 78, className: "bg-amber-200 text-amber-950" },
  { band: "great", label: "Great", range: "70–77.9", minimum: 70, className: "bg-emerald-700 text-white" },
  { band: "strong", label: "Strong", range: "62–69.9", minimum: 62, className: "bg-emerald-200 text-emerald-950" },
  { band: "good", label: "Good", range: "54–61.9", minimum: 54, className: "bg-emerald-50 text-emerald-800" },
  { band: "average", label: "Average", range: "46–53.9", minimum: 46, className: "bg-lime-100 text-lime-900" },
  { band: "below-average", label: "Below Avg", range: "38–45.9", minimum: 38, className: "bg-amber-100 text-amber-900" },
  { band: "weak", label: "Weak", range: "30–37.9", minimum: 30, className: "bg-orange-100 text-orange-900" },
  { band: "poor", label: "Poor", range: "<30", minimum: Number.NEGATIVE_INFINITY, className: "bg-rose-100 text-rose-900" },
];

const UNAVAILABLE_PRESENTATION: NflRatingPresentation = {
  band: "unavailable",
  label: "Unavailable",
  range: "—",
  className: "text-slate-500",
};

/** Resolve a Current OVR value (1-99 scale, actual score, never league rank) to its tier. */
export function getNflRatingPresentation(value: number | null | undefined): NflRatingPresentation {
  if (value == null || Number.isNaN(value)) return UNAVAILABLE_PRESENTATION;
  return NFL_RATING_TIERS.find((tier) => value >= tier.minimum) ?? UNAVAILABLE_PRESENTATION;
}

export function getNflRatingBand(value: number | null | undefined): NflRatingBand {
  return getNflRatingPresentation(value).band;
}

export function getNflRatingHeatClass(value: number | null | undefined): string {
  return getNflRatingPresentation(value).className;
}
