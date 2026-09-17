/**
 * Shared position header colors for "N Allowed by Position" tables (Fantasy
 * Points Allowed, TDs Allowed by Position). Deliberately distinct from the
 * heatmap body palette (src/lib/shared/jkbHeat.ts) so the header row never
 * competes with the heatmap's green/gold/red meaning layer -- these are
 * dark, desaturated per-position accents, not a second heat scale.
 */

export type AllowedByPositionHeaderKey = "qb" | "rb" | "wideWr" | "slotWr" | "te";

export const ALLOWED_BY_POSITION_HEADER_CLASSNAMES: Record<AllowedByPositionHeaderKey, string> = {
  qb: "bg-[#6F3C57] text-white",
  rb: "bg-[#2E5D7B] text-white",
  wideWr: "bg-[#8A6A1F] text-white",
  slotWr: "bg-[#5F6B2F] text-white",
  te: "bg-[#5A4B7A] text-white",
};
