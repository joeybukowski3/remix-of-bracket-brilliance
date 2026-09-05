/** Pure filter/sort helpers for the NFL Yardage Props Review UI. No data fetching, no model logic. */
import type { NflYardageOpponentContext } from "./opponentContext";
import type { NflMatchupScoreBand, NflYardageReviewRow } from "./yardageMarketJoin";

export type NflYardageReviewLineFilter = "all" | "available" | "unavailable";
export type NflYardageReviewBandFilter = "all" | NflMatchupScoreBand;

export type NflYardageReviewFilters = {
  /** A `gameId`, or "all" -- matches both teams playing in that game. Replaces the old per-team filter. */
  matchup: string | "all";
  position: string | "all";
  band: NflYardageReviewBandFilter;
  lineAvailability: NflYardageReviewLineFilter;
};

export const DEFAULT_YARDAGE_REVIEW_FILTERS: NflYardageReviewFilters = {
  matchup: "all",
  position: "all",
  band: "all",
  lineAvailability: "all",
};

export function applyYardageReviewFilters(
  entries: readonly NflYardageReviewRow[],
  filters: NflYardageReviewFilters,
): NflYardageReviewRow[] {
  return entries.filter((entry) => {
    if (filters.matchup !== "all" && entry.row.gameId !== filters.matchup) return false;
    if (filters.position !== "all" && entry.row.position !== filters.position) return false;
    if (filters.band !== "all" && entry.band !== filters.band) return false;
    if (filters.lineAvailability === "available" && !entry.marketInfo.available) return false;
    if (filters.lineAvailability === "unavailable" && entry.marketInfo.available) return false;
    return true;
  });
}

export type NflYardageReviewSortKey =
  | "player"
  | "team"
  | "projectedYards"
  | "matchupScore"
  | "difference"
  | "line"
  | "depthRank"
  | "oppYardsAllowedSeason"
  | "oppYardsAllowedL5"
  | "oppEpaAllowedRank"
  | "oppSuccessAllowedRank";
export type NflYardageReviewSortState = { key: NflYardageReviewSortKey; direction: "asc" | "desc" } | null;

/** Initial/post-market-change sort: highest projected yards first. */
export const DEFAULT_YARDAGE_REVIEW_SORT: NflYardageReviewSortState = { key: "projectedYards", direction: "desc" };

export function nextYardageReviewSort(
  current: NflYardageReviewSortState,
  key: NflYardageReviewSortKey,
  defaultDirection: "asc" | "desc" = "desc",
): NflYardageReviewSortState {
  if (!current || current.key !== key) return { key, direction: defaultDirection };
  if (current.direction === defaultDirection) return { key, direction: defaultDirection === "asc" ? "desc" : "asc" };
  return null;
}

function opponentContextSortValue(
  entry: NflYardageReviewRow,
  key: NflYardageReviewSortKey,
  contextByKey: ReadonlyMap<string, NflYardageOpponentContext>,
): number | null {
  const context = contextByKey.get(`${entry.row.market}-${entry.row.playerId}`);
  if (!context) return null;
  switch (key) {
    case "oppYardsAllowedSeason":
      return context.productionAllowed.season?.yardsAllowedPerGame ?? null;
    case "oppYardsAllowedL5":
      return context.productionAllowed.last5?.yardsAllowedPerGame ?? null;
    case "oppEpaAllowedRank":
      return context.epaEdge.defense?.rank ?? null;
    case "oppSuccessAllowedRank":
      return context.successEdge.defense?.rank ?? null;
    default:
      return null;
  }
}

function sortValue(
  entry: NflYardageReviewRow,
  key: NflYardageReviewSortKey,
  contextByKey: ReadonlyMap<string, NflYardageOpponentContext>,
): number | string | null {
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
    case "line":
      return entry.marketInfo.available ? entry.marketInfo.line : null;
    case "depthRank":
      return entry.row.depthRank;
    case "oppYardsAllowedSeason":
    case "oppYardsAllowedL5":
    case "oppEpaAllowedRank":
    case "oppSuccessAllowedRank":
      return opponentContextSortValue(entry, key, contextByKey);
    default:
      return null;
  }
}

const EMPTY_CONTEXT_MAP: ReadonlyMap<string, NflYardageOpponentContext> = new Map();

/**
 * Rows with no value for the active sort key always sort last, regardless of
 * direction. `contextByKey` is optional -- the four opponent-context sort
 * keys resolve to null (sort last) without it, so callers that don't have
 * the context map yet degrade gracefully rather than breaking.
 */
export function sortYardageReviewRows(
  entries: readonly NflYardageReviewRow[],
  sort: NflYardageReviewSortState,
  contextByKey: ReadonlyMap<string, NflYardageOpponentContext> = EMPTY_CONTEXT_MAP,
): NflYardageReviewRow[] {
  const ordered = [...entries];
  if (!sort) {
    ordered.sort((a, b) => a.row.playerName.localeCompare(b.row.playerName));
    return ordered;
  }
  ordered.sort((a, b) => {
    const va = sortValue(a, sort.key, contextByKey);
    const vb = sortValue(b, sort.key, contextByKey);
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
