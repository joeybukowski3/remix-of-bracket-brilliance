/**
 * NFL rank-tier normalization.
 *
 * Every comparable team statistic in the matchup analyzer is coloured from its
 * league rank (1 = best) rather than from its raw value, so a "good" EPA/play
 * and a "good" sacks-allowed/game read identically even though their raw
 * directions are opposite. Raw-value direction still lives in the metric
 * metadata (see matchupMetrics.ts) and is used for labelling/sorting, never for
 * choosing a colour.
 *
 * Colour is deliberately restrained: a saturated rank badge carries the signal,
 * the surrounding cell only gets a faint wash. The numeric rank is always
 * rendered inside the badge, so tier is never communicated by colour alone.
 */

/** Teams in the league — the denominator for every rank tier. */
export const NFL_TEAM_COUNT = 32;

export type NflRankTierId =
  | "elite"
  | "excellent"
  | "good"
  | "above-average"
  | "below-average"
  | "weak"
  | "poor"
  | "very-poor";

export type NflRankTier = {
  id: NflRankTierId;
  /** Human label used in legends, tooltips and screen-reader text. */
  label: string;
  /** Inclusive rank bounds (1-based). */
  min: number;
  max: number;
  /** Saturated rank chip — carries the primary signal. */
  badge: string;
  /** Faint wash applied behind a value cell. Intentionally low-contrast. */
  cell: string;
  /** Thin accent rule used on the outer edge of a team's side of a row. */
  accent: string;
};

/**
 * Eight equal buckets of four ranks each across a 32-team league.
 * Ordered best → worst; the bounds are contiguous and exhaustive over 1..32.
 */
export const NFL_RANK_TIERS: readonly NflRankTier[] = [
  {
    id: "elite",
    label: "Elite",
    min: 1,
    max: 4,
    badge: "border-emerald-700 bg-emerald-700 text-white",
    cell: "bg-emerald-50",
    accent: "bg-emerald-700",
  },
  {
    id: "excellent",
    label: "Excellent",
    min: 5,
    max: 8,
    badge: "border-emerald-600 bg-emerald-100 text-emerald-900",
    cell: "bg-emerald-50/70",
    accent: "bg-emerald-500",
  },
  {
    id: "good",
    label: "Good",
    min: 9,
    max: 12,
    badge: "border-emerald-400 bg-emerald-50 text-emerald-800",
    cell: "bg-emerald-50/40",
    accent: "bg-emerald-300",
  },
  {
    id: "above-average",
    label: "Above Average",
    min: 13,
    max: 16,
    badge: "border-teal-300 bg-teal-50 text-teal-800",
    cell: "bg-teal-50/40",
    accent: "bg-teal-300",
  },
  {
    id: "below-average",
    label: "Below Average",
    min: 17,
    max: 20,
    badge: "border-amber-300 bg-amber-50 text-amber-800",
    cell: "bg-amber-50/40",
    accent: "bg-amber-300",
  },
  {
    id: "weak",
    label: "Weak",
    min: 21,
    max: 24,
    badge: "border-orange-400 bg-orange-100 text-orange-900",
    cell: "bg-orange-50/60",
    accent: "bg-orange-400",
  },
  {
    id: "poor",
    label: "Poor",
    min: 25,
    max: 28,
    badge: "border-red-400 bg-red-100 text-red-800",
    cell: "bg-red-50/60",
    accent: "bg-red-400",
  },
  {
    id: "very-poor",
    label: "Very Poor",
    min: 29,
    max: 32,
    badge: "border-red-700 bg-red-700 text-white",
    cell: "bg-red-50",
    accent: "bg-red-700",
  },
] as const;

/** Neutral styling for a genuinely missing rank. Never coloured as a tier. */
export const NFL_RANK_TIER_UNKNOWN = {
  badge: "border-slate-200 bg-slate-100 text-slate-500",
  cell: "",
  accent: "bg-slate-200",
} as const;

/**
 * Resolve a league rank to its tier.
 * Returns null for missing, non-finite, non-integer or out-of-league ranks so
 * callers render a neutral "N/A" state instead of guessing a colour.
 */
export function getRankTier(rank: number | null | undefined): NflRankTier | null {
  if (rank == null || !Number.isFinite(rank) || !Number.isInteger(rank)) return null;
  if (rank < 1 || rank > NFL_TEAM_COUNT) return null;
  return NFL_RANK_TIERS.find((tier) => rank >= tier.min && rank <= tier.max) ?? null;
}

/** Tier label for a rank, or "Unranked" when the rank is unavailable. */
export function getRankTierLabel(rank: number | null | undefined): string {
  return getRankTier(rank)?.label ?? "Unranked";
}

/** Rank-chip classes. Falls back to neutral slate when the rank is unavailable. */
export function rankBadgeClass(rank: number | null | undefined): string {
  return getRankTier(rank)?.badge ?? NFL_RANK_TIER_UNKNOWN.badge;
}

/** Faint value-cell wash. Empty string when the rank is unavailable. */
export function rankCellClass(rank: number | null | undefined): string {
  return getRankTier(rank)?.cell ?? NFL_RANK_TIER_UNKNOWN.cell;
}

/** Thin edge accent for a team's side of a comparison row. */
export function rankAccentClass(rank: number | null | undefined): string {
  return getRankTier(rank)?.accent ?? NFL_RANK_TIER_UNKNOWN.accent;
}
