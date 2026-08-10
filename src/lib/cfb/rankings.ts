import type { CfbConferenceId, CfbTeam } from "@/data/cfb/types";

/** Sort by JKB rank ascending (1 best). Teams without rank sink to the end. */
export function sortByJkbRank(teams: CfbTeam[]): CfbTeam[] {
  return [...teams].sort((a, b) => {
    const ar = a.ratings.jkbRank;
    const br = b.ratings.jkbRank;
    if (ar == null && br == null) return a.name.localeCompare(b.name);
    if (ar == null) return 1;
    if (br == null) return -1;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });
}

export function getTop25(teams: CfbTeam[]): CfbTeam[] {
  return sortByJkbRank(teams).slice(0, 25);
}

export type RankingsSortKey =
  | "jkbRank"
  | "jkbPowerRating"
  | "offensiveRating"
  | "defensiveRating"
  | "sosPlayedRank"
  | "sosRemainingRank";

/**
 * Sort rankings table. Rank fields: lower better (asc).
 * Rating fields (power/off/def): higher better (desc) unless sorting rank keys.
 */
export function sortRankings(
  teams: CfbTeam[],
  key: RankingsSortKey = "jkbRank",
  direction: "asc" | "desc" = key === "jkbRank" || key.endsWith("Rank")
    ? "asc"
    : "desc",
): CfbTeam[] {
  return [...teams].sort((a, b) => {
    const av = readSortValue(a, key);
    const bv = readSortValue(b, key);
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av !== bv) return direction === "asc" ? av - bv : bv - av;
    // Tie-break by JKB rank
    const ar = a.ratings.jkbRank ?? Number.POSITIVE_INFINITY;
    const br = b.ratings.jkbRank ?? Number.POSITIVE_INFINITY;
    return ar - br;
  });
}

function readSortValue(team: CfbTeam, key: RankingsSortKey): number | null {
  switch (key) {
    case "jkbRank":
      return team.ratings.jkbRank;
    case "jkbPowerRating":
      return team.ratings.jkbPowerRating;
    case "offensiveRating":
      return team.ratings.offensiveRating;
    case "defensiveRating":
      return team.ratings.defensiveRating;
    case "sosPlayedRank":
      return team.ratings.sosPlayedRank;
    case "sosRemainingRank":
      return team.ratings.sosRemainingRank;
    default:
      return null;
  }
}

export function filterByConference(
  teams: CfbTeam[],
  conference: CfbConferenceId | "all",
): CfbTeam[] {
  if (conference === "all") return teams;
  return teams.filter((t) => t.conference === conference);
}
