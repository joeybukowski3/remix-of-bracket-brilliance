/**
 * Phase 5 — pure presentation helpers for the sportsbook betting-lines UI.
 *
 * These format the browser-safe view model produced by
 * {@link ../../../lib/nfl/bettingLinesView} for the compact matchup sheet. They
 * never fetch, never average books and never fabricate a value: every string
 * here is derived from one already-selected sportsbook's observations.
 *
 * The line-movement helpers deliberately say "First observed", never "Open" —
 * the provider does not supply an opening line, only the first state the
 * collector stored.
 */

import {
  formatMoneyline,
  formatSpread,
  formatTotal,
} from "@/lib/nfl/marketData";
import type {
  BettingLineMoneyline,
  BettingLineSpread,
} from "@/lib/market/lines/bettingLineTypes";
import type {
  FreshnessView,
  LineMovement,
} from "@/lib/nfl/bettingLinesView";
import type { GameProjection } from "@/lib/nfl/projectionData";

export const NA = "N/A";

/**
 * Current spread stated from the home team's side, matching how the movement
 * table and the JKB projection state theirs, so the three read as one unit.
 * A missing home line renders N/A rather than being inferred from the away line.
 */
export function currentSpreadLabel(
  spread: BettingLineSpread | null,
  homeAbbr: string,
): string {
  const home = spread?.homeLine;
  if (home == null || !Number.isFinite(home)) return NA;
  return `${homeAbbr.toUpperCase()} ${formatSpread(home)}`;
}

/** Favourite-side moneyline, e.g. "SEA −198". Independent of the spread. */
export function currentMoneylineLabel(
  moneyline: BettingLineMoneyline | null,
  homeAbbr: string,
  awayAbbr: string,
): string {
  const home = moneyline?.homePrice ?? null;
  const away = moneyline?.awayPrice ?? null;
  if (home == null && away == null) return NA;
  const homeIsFavourite =
    home != null && (away == null || home <= away);
  if (homeIsFavourite) {
    return `${homeAbbr.toUpperCase()} ${formatMoneyline(home)}`;
  }
  if (away != null) {
    return `${awayAbbr.toUpperCase()} ${formatMoneyline(away)}`;
  }
  return NA;
}

/**
 * The gap between the JKB projected home margin and this sportsbook's line,
 * expressed toward a team — never a bare signed number. "Even" when they agree,
 * N/A when either side is missing. A description of the gap, not an edge.
 */
export function modelVsMarketLabel(
  projection: GameProjection | null,
  spread: BettingLineSpread | null,
  homeAbbr: string,
  awayAbbr: string,
): string {
  if (!projection) return NA;
  const home = spread?.homeLine;
  if (home == null || !Number.isFinite(home)) return NA;
  const marketHomeMargin = -home;
  const rounded = Number(
    (projection.projectedHomeMargin - marketHomeMargin).toFixed(1),
  );
  if (rounded === 0) return "Even";
  const team = rounded > 0 ? homeAbbr : awayAbbr;
  return `${team.toUpperCase()} +${Math.abs(rounded).toFixed(1)}`;
}

/** Signed movement, e.g. "−0.5" / "+1.5" / "0.0". */
export function formatMove(value: number): string {
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}

/** Relative-age phrase from a freshness view, e.g. "Updated 8m ago". */
export function freshnessLabel(freshness: FreshnessView | null | undefined): string {
  if (!freshness || freshness.ageMs == null) return "Freshness unknown";
  return `Updated ${formatAge(freshness.ageMs)}`;
}

export function formatAge(ageMs: number): string {
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Tailwind text colour for a freshness level, themed by nflMatchupSheet.css. */
export function freshnessToneClass(
  freshness: FreshnessView | null | undefined,
): string {
  switch (freshness?.level) {
    case "fresh":
      return "text-emerald-700";
    case "stale":
      return "text-amber-600";
    default:
      return "text-slate-500";
  }
}

export interface MovementRowView {
  /** Market label, e.g. "SEA Spread" or "Game Total". */
  market: string;
  firstObserved: string;
  current: string;
  move: string;
  /** Actual stored observation values, oldest first. Never interpolated. */
  values: number[];
}

export function spreadMovementRow(
  movement: LineMovement | null,
  homeAbbr: string,
): MovementRowView | null {
  if (!movement) return null;
  return {
    market: `${homeAbbr.toUpperCase()} Spread`,
    firstObserved: formatSpread(movement.firstObserved),
    current: formatSpread(movement.current),
    move: formatMove(movement.move),
    values: movement.points.map((point) => point.value),
  };
}

export function totalMovementRow(
  movement: LineMovement | null,
): MovementRowView | null {
  if (!movement) return null;
  return {
    market: "Game Total",
    firstObserved: formatTotal(movement.firstObserved),
    current: formatTotal(movement.current),
    move: formatMove(movement.move),
    values: movement.points.map((point) => point.value),
  };
}
