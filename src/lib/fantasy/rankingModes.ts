export type FantasyRankingMode = "weekly" | "ros";

/** A canonical weekly artifact exists and owns the primary Fantasy entry point. */
export const HAS_CANONICAL_WEEKLY_FANTASY_RANKINGS = true;

/** The root fantasy route defaults to the current weekly research board. */
export function getDefaultFantasyRankingMode(): FantasyRankingMode {
  return "weekly";
}
