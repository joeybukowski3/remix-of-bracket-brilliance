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
