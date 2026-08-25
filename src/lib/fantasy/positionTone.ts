/**
 * Fixed categorical colour per fantasy position.
 *
 * Used by the Overall board, which mixes all four positions in one table. A
 * continuous rank gradient is misleading there: a WR's rank 15 and an RB's rank
 * 15 sit on different scales, so shading them identically implies a comparison
 * that does not exist. The Overall board instead tints each row by *which*
 * position it is, and leaves good-vs-bad shading to the single-position boards.
 *
 * These are categorical identity colours, never a quality scale — do not order
 * them or read meaning into one being "better" than another.
 */

import type { FantasyPosition } from "@/lib/fantasy/rankings";

export type PositionTone = {
  /** Saturated chip for the position-rank badge. */
  badge: string;
  /** Light wash for stat cells, sized to keep bold slate text readable. */
  cell: string;
};

export const POSITION_TONES: Record<FantasyPosition, PositionTone> = {
  QB: {
    badge: "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-300",
    cell: "bg-sky-50",
  },
  RB: {
    badge: "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300",
    cell: "bg-emerald-50",
  },
  WR: {
    badge: "bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-300",
    cell: "bg-violet-50",
  },
  TE: {
    badge: "bg-orange-100 text-orange-900 ring-1 ring-inset ring-orange-300",
    cell: "bg-orange-50",
  },
};

/** Weekly/ROS position-tab states using the same categorical position language. */
export const POSITION_TAB_TONES: Record<FantasyPosition, { active: string; inactive: string }> = {
  QB: {
    active: "border-sky-600 bg-sky-600 text-white shadow-sm",
    inactive: "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100",
  },
  RB: {
    active: "border-emerald-600 bg-emerald-600 text-white shadow-sm",
    inactive: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  },
  WR: {
    active: "border-violet-600 bg-violet-600 text-white shadow-sm",
    inactive: "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100",
  },
  TE: {
    active: "border-orange-600 bg-orange-600 text-white shadow-sm",
    inactive: "border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100",
  },
};

export function getPositionTone(position: FantasyPosition): PositionTone {
  return POSITION_TONES[position];
}

/** Human-readable colour name per position, for the Overall board's legend. */
export const POSITION_TONE_NAMES: Record<FantasyPosition, string> = {
  QB: "Sky",
  RB: "Emerald",
  WR: "Violet",
  TE: "Orange",
};
