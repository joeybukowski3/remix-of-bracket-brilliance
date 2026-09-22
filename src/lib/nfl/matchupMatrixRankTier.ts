/**
 * Weekly Matchups matrix heatmap palette.
 *
 * Reuses the canonical JKB 8-tier percentile scale (`PERCENTILE_TIERS`,
 * consumed through the shared `@/lib/shared/jkbHeat.ts` entry point — the
 * same one the site-wide JKB Heat vocabulary re-exports from its true
 * source, `@/lib/mlb/percentileColorScale.ts`, which also backs K Props /
 * Strikeout Props / HR Props / Batter vs. Pitcher via
 * `MlbPercentileScoreCell.tsx`) so this matrix's rank buckets look like the
 * same product as every other JKB tier table. No hand-picked colors here —
 * only the rank-bucket boundaries are matrix-specific.
 *
 * Same 8 contiguous rank buckets as before (1-4 .. 29-32), same
 * best-to-worst ordering, mapped 1:1 onto `PERCENTILE_TIERS` in its existing
 * best -> worst order (elite -> excellent -> great -> aboveAverage ->
 * average -> belowAverage -> weak -> poor). #1 is always best; that logic
 * lives in matchupMatrixData.ts and is untouched here.
 *
 * `style` is the exact `PercentileTierStyle` (backgroundColor/color/border)
 * from the shared scale — rendered as inline style, not a Tailwind class, so
 * nothing here can drift from the canonical hex/rgba values.
 */

import { PERCENTILE_TIERS, type PercentileTierId, type PercentileTierStyle } from "@/lib/shared/jkbHeat";

export const MATRIX_TEAM_COUNT = 32;

export type NflMatrixRankTierId = PercentileTierId;

export type NflMatrixRankTier = {
  id: NflMatrixRankTierId;
  /** Matrix's own tier label — distinct from the JKB tier label (e.g. "Good" vs "Great"); only the color is shared. */
  label: string;
  /** Inclusive rank bounds (1-based). */
  min: number;
  max: number;
  /** Exact canonical JKB tier style — never a locally reinterpreted color. */
  style: PercentileTierStyle;
};

/**
 * Matrix-specific bucket boundaries and labels, aligned 1:1 with
 * PERCENTILE_TIERS' existing best -> worst order. Labels are the matrix's
 * own established vocabulary (unchanged by this palette pass); only `style`
 * below is sourced from the canonical scale.
 */
const RANK_BUCKETS: readonly { label: string; min: number; max: number }[] = [
  { label: "Elite", min: 1, max: 4 },
  { label: "Excellent", min: 5, max: 8 },
  { label: "Good", min: 9, max: 12 },
  { label: "Above Average", min: 13, max: 16 },
  { label: "Below Average", min: 17, max: 20 },
  { label: "Weak", min: 21, max: 24 },
  { label: "Poor", min: 25, max: 28 },
  { label: "Very Poor", min: 29, max: 32 },
];

export const MATRIX_RANK_TIERS: readonly NflMatrixRankTier[] = PERCENTILE_TIERS.map((tier, index) => ({
  id: tier.id,
  label: RANK_BUCKETS[index].label,
  min: RANK_BUCKETS[index].min,
  max: RANK_BUCKETS[index].max,
  style: tier.style,
}));

/** Neutral styling for a genuinely missing rank. Never colored as a tier. */
export const MATRIX_RANK_TIER_UNKNOWN: PercentileTierStyle = {
  backgroundColor: "#f1f5f9",
  color: "#64748b",
  border: "1px solid rgba(148, 163, 184, 0.18)",
};

/**
 * Resolve a league rank to its matrix tier.
 * Returns null for missing, non-finite, non-integer or out-of-league ranks so
 * callers render a neutral state instead of guessing a colour.
 */
export function getMatrixRankTier(rank: number | null | undefined): NflMatrixRankTier | null {
  if (rank == null || !Number.isFinite(rank) || !Number.isInteger(rank)) return null;
  if (rank < 1 || rank > MATRIX_TEAM_COUNT) return null;
  return MATRIX_RANK_TIERS.find((tier) => rank >= tier.min && rank <= tier.max) ?? null;
}

/** Canonical JKB cell style. Falls back to neutral slate when the rank is unavailable. */
export function matrixCellStyle(rank: number | null | undefined): PercentileTierStyle {
  return getMatrixRankTier(rank)?.style ?? MATRIX_RANK_TIER_UNKNOWN;
}
