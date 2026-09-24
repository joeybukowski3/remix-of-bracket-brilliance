import type { CSSProperties } from "react";
import { PERCENTILE_TIERS } from "@/lib/mlb/percentileColorScale";

/**
 * JKB gold → cream → neutral → orange → red rank palette for College Football.
 *
 * Neutral average and poor red are the site-wide JKB Heat tokens
 * (`PERCENTILE_TIERS` in the shared percentile scale); elite is a deeper variant of
 * the JKB gold family so it reads stronger than the yellow "great" tier. The MLB scale uses emerald
 * for its favorable middle; CFB replaces that stretch with warm gold/cream and
 * inserts light-orange / salmon steps before red, so green is never a "best" color.
 * Tiers are resolved from the national FBS rank only — never from the raw value.
 */
export type CfbRankTierId =
  | "elite"
  | "great"
  | "strong"
  | "good"
  | "average"
  | "below-average"
  | "weak"
  | "poor";

export type CfbRankTier = {
  id: CfbRankTierId;
  label: string;
  /** Inclusive upper bound of rank / fieldSize for this tier. */
  maxRankShare: number;
  style: CSSProperties;
};

const jkbHeat = (id: string) => {
  const tier = PERCENTILE_TIERS.find((item) => item.id === id);
  if (!tier) throw new Error(`Missing JKB heat tier: ${id}`);
  return { ...tier.style } as CSSProperties;
};

export const CFB_RANK_TIERS: readonly CfbRankTier[] = [
  { id: "elite", label: "Elite", maxRankShare: 0.1, style: { backgroundColor: "#e6c25a", color: "#4a3208", border: "1px solid rgba(146, 112, 42, 0.5)" } },
  { id: "great", label: "Great", maxRankShare: 0.2, style: { backgroundColor: "#f4e39a", color: "#5c4a0a", border: "1px solid rgba(180, 140, 30, 0.3)" } },
  { id: "strong", label: "Strong", maxRankShare: 0.35, style: { backgroundColor: "#f8efc6", color: "#5c4a0a", border: "1px solid rgba(180, 140, 30, 0.2)" } },
  { id: "good", label: "Good", maxRankShare: 0.5, style: { backgroundColor: "#fbf7e6", color: "#57534e", border: "1px solid rgba(180, 140, 30, 0.14)" } },
  { id: "average", label: "Average", maxRankShare: 0.65, style: jkbHeat("average") },
  { id: "below-average", label: "Below Avg", maxRankShare: 0.8, style: { backgroundColor: "#fde3c8", color: "#7c2d12", border: "1px solid rgba(234, 120, 40, 0.28)" } },
  { id: "weak", label: "Weak", maxRankShare: 0.92, style: { backgroundColor: "#f9a97a", color: "#7c2d12", border: "1px solid rgba(220, 90, 30, 0.35)" } },
  { id: "poor", label: "Poor", maxRankShare: Number.POSITIVE_INFINITY, style: jkbHeat("poor") },
];

/** Neutral treatment for missing values — never colored as average. */
export const CFB_RANK_UNAVAILABLE_STYLE: CSSProperties = {
  backgroundColor: "#f8fafc",
  color: "#64748b",
};

export function getCfbRankTier(rank: number | null | undefined, fieldSize: number): CfbRankTier | null {
  if (rank == null || !Number.isFinite(rank) || rank < 1) return null;
  const share = rank / Math.max(fieldSize, 1);
  return CFB_RANK_TIERS.find((tier) => share <= tier.maxRankShare) ?? CFB_RANK_TIERS[CFB_RANK_TIERS.length - 1];
}

/** Spread onto a cell: `data-rank-tier` hook plus the tier style. */
export function getCfbRankCellProps(rank: number | null | undefined, fieldSize: number) {
  const tier = getCfbRankTier(rank, fieldSize);
  return {
    "data-rank-tier": tier?.id ?? "unavailable",
    style: tier?.style ?? CFB_RANK_UNAVAILABLE_STYLE,
  };
}
