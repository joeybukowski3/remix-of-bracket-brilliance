export type CfbComparisonEdge = "away" | "home" | "even" | "none";

/** Higher is better edge helper. */
export function higherIsBetterEdge(
  away: number | null | undefined,
  home: number | null | undefined,
): CfbComparisonEdge {
  if (away == null || home == null || Number.isNaN(away) || Number.isNaN(home)) {
    return "none";
  }
  if (away === home) return "even";
  return away > home ? "away" : "home";
}

/** Lower is better (e.g. rank, points allowed). */
export function lowerIsBetterEdge(
  away: number | null | undefined,
  home: number | null | undefined,
): CfbComparisonEdge {
  if (away == null || home == null || Number.isNaN(away) || Number.isNaN(home)) {
    return "none";
  }
  if (away === home) return "even";
  return away < home ? "away" : "home";
}

/**
 * Edge from two NATIONAL RANK numbers (lower = stronger; #12 beats #40).
 * Unlike lowerIsBetterEdge, a single missing side does not blank the row:
 * when only one side has a usable rank, that side gets the edge (the other
 * has no ranked unit to compare against). Both missing, or equal ranks,
 * yield no advantage.
 */
export function rankAdvantageEdge(
  away: number | null | undefined,
  home: number | null | undefined,
): CfbComparisonEdge {
  const awayUsable = away != null && !Number.isNaN(away);
  const homeUsable = home != null && !Number.isNaN(home);
  if (!awayUsable && !homeUsable) return "none";
  if (!homeUsable) return "away";
  if (!awayUsable) return "home";
  if (away === home) return "even";
  return away < home ? "away" : "home";
}
