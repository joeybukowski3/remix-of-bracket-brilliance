/**
 * Weekly Matchups matrix heatmap palette — JKB gold -> red.
 *
 * Deliberately separate from rankTier.ts: that module's green -> red scale is
 * shared by Standings, Team Comparison and several other NFL pages (see its
 * usages), so recoloring it would silently repaint surfaces this matrix
 * doesn't own. This module is the ONLY place the matrix's gold/yellow/
 * orange/red bucket colors are defined.
 *
 * Same 8 contiguous rank buckets as rankTier.ts (1-4 .. 29-32), same
 * best-to-worst ordering — only the color assignment changes. #1 is always
 * best; that logic lives in matchupMatrixData.ts and is untouched here.
 *
 * Each tier's `cell` class is a solid, full-cell background (not a faint
 * wash) per the matrix's "entire cell background is the heatmap" design, so
 * `text` pairs a readable foreground with it. Green is never used anywhere in
 * this palette.
 */

export const MATRIX_TEAM_COUNT = 32;

export type NflMatrixRankTierId =
  | "elite"
  | "excellent"
  | "good"
  | "above-average"
  | "below-average"
  | "weak"
  | "poor"
  | "very-poor";

export type NflMatrixRankTier = {
  id: NflMatrixRankTierId;
  label: string;
  /** Inclusive rank bounds (1-based). */
  min: number;
  max: number;
  /** Solid full-cell background — carries the heatmap signal directly. */
  cell: string;
  /** Foreground text color paired for contrast against `cell`. */
  text: string;
};

export const MATRIX_RANK_TIERS: readonly NflMatrixRankTier[] = [
  { id: "elite", label: "Elite", min: 1, max: 4, cell: "bg-amber-500", text: "text-slate-900" },
  { id: "excellent", label: "Excellent", min: 5, max: 8, cell: "bg-amber-400", text: "text-slate-900" },
  { id: "good", label: "Good", min: 9, max: 12, cell: "bg-yellow-300", text: "text-slate-900" },
  { id: "above-average", label: "Above Average", min: 13, max: 16, cell: "bg-amber-100", text: "text-slate-800" },
  { id: "below-average", label: "Below Average", min: 17, max: 20, cell: "bg-orange-200", text: "text-slate-800" },
  { id: "weak", label: "Weak", min: 21, max: 24, cell: "bg-orange-400", text: "text-slate-900" },
  { id: "poor", label: "Poor", min: 25, max: 28, cell: "bg-orange-600", text: "text-white" },
  { id: "very-poor", label: "Very Poor", min: 29, max: 32, cell: "bg-red-700", text: "text-white" },
] as const;

/** Neutral styling for a genuinely missing rank. Never colored as a tier. */
export const MATRIX_RANK_TIER_UNKNOWN = {
  cell: "bg-slate-100",
  text: "text-slate-500",
} as const;

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

/** Full-cell background class. Falls back to neutral slate when the rank is unavailable. */
export function matrixCellClass(rank: number | null | undefined): string {
  return getMatrixRankTier(rank)?.cell ?? MATRIX_RANK_TIER_UNKNOWN.cell;
}

/** Foreground text class paired with `matrixCellClass`. */
export function matrixTextClass(rank: number | null | undefined): string {
  return getMatrixRankTier(rank)?.text ?? MATRIX_RANK_TIER_UNKNOWN.text;
}
