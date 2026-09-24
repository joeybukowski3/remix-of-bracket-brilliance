/**
 * Shared position header colors for "N Allowed by Position" tables (Fantasy
 * Points Allowed, TDs Allowed by Position). Deliberately distinct from the
 * heatmap body palette (src/lib/shared/jkbHeat.ts) so the header row never
 * competes with the heatmap's green/gold/red meaning layer -- these are
 * dark, desaturated per-position accents, not a second heat scale.
 */

export type AllowedByPositionHeaderKey =
  | "qb"
  | "rb"
  | "wideWr"
  | "slotWr"
  | "wr"
  | "te"
  | "qbPass"
  | "qbRush"
  | "rbRush"
  | "rbRec"
  | "wrRec"
  | "teRec";

export const ALLOWED_BY_POSITION_HEADER_CLASSNAMES: Record<
  AllowedByPositionHeaderKey,
  string
> = {
  qb: "bg-[#6F3C57] text-white",
  rb: "bg-[#2E5D7B] text-white",
  wideWr: "bg-[#486A6F] text-white",
  slotWr: "bg-[#5F6B2F] text-white",

  // Combined WR column remains for unsplit Fantasy Points Allowed samples.
  // TDs Allowed uses scoring-method-specific columns; each position keeps its family color,
  // with the second method of a position (QB RUSH, RB REC) using a lighter step.
  wr: "bg-[#2F6B63] text-white",
  te: "bg-[#544B7A] text-white",

  qbPass: "bg-[#6F3C57] text-white",
  qbRush: "bg-[#8A4A6C] text-white",
  rbRush: "bg-[#2E5D7B] text-white",
  rbRec: "bg-[#3F7A9A] text-white",
  wrRec: "bg-[#2F6B63] text-white",
  teRec: "bg-[#544B7A] text-white",
};