/** Pure filter/sort helpers for the NFL Yardage Props Review UI. No data fetching, no model logic. */
import type { NflMatchupScoreBand, NflYardageReviewRow } from "./yardageMarketJoin";

export type NflYardageReviewLineFilter = "all" | "available" | "unavailable";
export type NflYardageReviewRoleFilter = "all" | "uncertain" | "confident";
export type NflYardageReviewBandFilter = "all" | NflMatchupScoreBand;

export type NflYardageReviewFilters = {
  team: string | "all";
  position: string | "all";
  band: NflYardageReviewBandFilter;
  lineAvailability: NflYardageReviewLineFilter;
  roleUncertainty: NflYardageReviewRoleFilter;
};

export const DEFAULT_YARDAGE_REVIEW_FILTERS: NflYardageReviewFilters = {
  team: "all",
  position: "all",
  band: "all",
  lineAvailability: "all",
  roleUncertainty: "all",
};

export function applyYardageReviewFilters(
  entries: readonly NflYardageReviewRow[],
  filters: NflYardageReviewFilters,
): NflYardageReviewRow[] {
  return entries.filter((entry) => {
    if (filters.team !== "all" && entry.row.team !== filters.team && entry.row.opponent !== filters.team) return false;
    if (filters.position !== "all" && entry.row.position !== filters.position) return false;
    if (filters.band !== "all" && entry.band !== filters.band) return false;
    if (filters.lineAvailability === "available" && !entry.marketInfo.available) return false;
    if (filters.lineAvailability === "unavailable" && entry.marketInfo.available) return false;
    if (filters.roleUncertainty === "uncertain" && !entry.row.hardCaseFlags.roleUncertain) return false;
    if (filters.roleUncertainty === "confident" && entry.row.hardCaseFlags.roleUncertain) return false;
    return true;
  });
}

export type NflYardageReviewSortKey = "player" | "team" | "projectedYards" | "matchupScore" | "difference" | "depthRank";
export type NflYardageReviewSortState = { key: NflYardageReviewSortKey; direction: "asc" | "desc" } | null;

export function nextYardageReviewSort(
  current: NflYardageReviewSortState,
  key: NflYardageReviewSortKey,
  defaultDirection: "asc" | "desc" = "desc",
): NflYardageReviewSortState {
  if (!current || current.key !== key) return { key, direction: defaultDirection };
  if (current.direction === defaultDirection) return { key, direction: defaultDirection === "asc" ? "desc" : "asc" };
  return null;
}

function sortValue(entry: NflYardageReviewRow, key: NflYardageReviewSortKey): number | string | null {
  switch (key) {
    case "player":
      return entry.row.playerName.toLowerCase();
    case "team":
      return entry.row.team;
    case "projectedYards":
      return entry.row.projectedYards;
    case "matchupScore":
      return entry.row.matchupScore?.matchupScore ?? null;
    case "difference":
      return entry.marketInfo.available ? entry.marketInfo.rawDifference : null;
    case "depthRank":
      return entry.row.depthRank;
    default:
      return null;
  }
}

/** Rows with no value for the active sort key always sort last, regardless of direction. */
export function sortYardageReviewRows(
  entries: readonly NflYardageReviewRow[],
  sort: NflYardageReviewSortState,
): NflYardageReviewRow[] {
  const ordered = [...entries];
  if (!sort) {
    ordered.sort((a, b) => a.row.playerName.localeCompare(b.row.playerName));
    return ordered;
  }
  ordered.sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va == null && vb == null) return a.row.playerName.localeCompare(b.row.playerName);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" && typeof vb === "string") {
      return sort.direction === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    if (typeof va === "number" && typeof vb === "number") {
      return sort.direction === "asc" ? va - vb : vb - va;
    }
    return 0;
  });
  return ordered;
}
