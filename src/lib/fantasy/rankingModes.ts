export type FantasyRankingMode = "weekly" | "ros";

/** A canonical weekly artifact exists; public fantasy navigation still keeps ROS as its explicit default. */
export const HAS_CANONICAL_WEEKLY_FANTASY_RANKINGS = true;

/** The root fantasy route remains the dedicated Rest-of-Season research surface. */
export function getDefaultFantasyRankingMode(): FantasyRankingMode {
  return "ros";
}
