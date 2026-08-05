/**
 * Fantasy Football ranking schema.
 *
 * This module defines the *shape* of a Joe Knows Ball fantasy ranking set and
 * nothing else. The customized ranking list has not been supplied yet, so
 * `FANTASY_RANKINGS` is deliberately empty: no player rows are invented here,
 * and none are imported from a third party and relabelled as ours.
 *
 * Only `overallRank`, `player`, `team` and `position` are required. Every
 * analytical field is optional so the first supplied dataset can carry whatever
 * columns actually exist, and later datasets can add ADP, projections, tiers and
 * strength of schedule without a schema migration. The UI renders a column only
 * when at least one row populates it (see `getPopulatedColumns`).
 */

export type FantasyPosition = "QB" | "RB" | "WR" | "TE";

export const FANTASY_POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

/** Filter identifiers for the rankings table. "ALL" is the default view. */
export type FantasyPositionFilter = "ALL" | FantasyPosition;

export const FANTASY_POSITION_FILTERS: readonly FantasyPositionFilter[] = ["ALL", ...FANTASY_POSITIONS];

export type FantasyRankingRow = {
  /** 1-based rank across every position. Required — it is the list's identity. */
  overallRank: number;
  player: string;
  /** Canonical lowercase NFL abbreviation, matching the rest of the NFL data. */
  team: string;
  position: FantasyPosition;

  /** Rank within the player's own position. */
  positionRank?: number;
  byeWeek?: number;
  /** Joe Knows Ball composite score. Scale is defined by the supplied dataset. */
  customScore?: number;
  /** Average draft position from the supplied source, for value comparison. */
  adp?: number;
  consensusRank?: number;
  projectedPoints?: number;
  priorSeasonRank?: number;
  /** Rank over the closing stretch of the prior season. */
  lateSeasonRank?: number;
  /** Positional strength of schedule; 1 is the easiest slate unless stated. */
  strengthOfSchedule?: number;
  tier?: number;
  notes?: string;
};

export type FantasyRankingSet = {
  /** Season the rankings describe, e.g. 2026. */
  season: number;
  /** Scoring format the rankings assume, e.g. "PPR". Displayed, never derived. */
  scoring: string;
  /** ISO timestamp of the supplied list, shown so readers can judge freshness. */
  updatedAt: string | null;
  /** Where the list came from. "JoeKnowsBall" for our own customized rankings. */
  source: string;
  rows: readonly FantasyRankingRow[];
};

/**
 * The published ranking set.
 *
 * Empty until the customized list is supplied. `updatedAt: null` and an empty
 * `rows` array are what the page's empty state keys off — it is a real, honest
 * "no data yet", not a placeholder waiting to be mistaken for real rankings.
 */
export const FANTASY_RANKINGS: FantasyRankingSet = {
  season: 2026,
  scoring: "PPR",
  updatedAt: null,
  source: "JoeKnowsBall",
  rows: [],
};

/** Optional columns, in display order, with the accessor the table reads. */
export const FANTASY_OPTIONAL_COLUMNS = [
  { key: "positionRank", label: "Pos rank", align: "center" },
  { key: "tier", label: "Tier", align: "center" },
  { key: "customScore", label: "JKB score", align: "center" },
  { key: "projectedPoints", label: "Proj pts", align: "center" },
  { key: "adp", label: "ADP", align: "center" },
  { key: "consensusRank", label: "Consensus", align: "center" },
  { key: "byeWeek", label: "Bye", align: "center" },
  { key: "strengthOfSchedule", label: "SOS", align: "center" },
  { key: "priorSeasonRank", label: "2025 rank", align: "center" },
  { key: "lateSeasonRank", label: "Late 2025", align: "center" },
  { key: "notes", label: "Notes", align: "left" },
] as const satisfies readonly {
  key: keyof FantasyRankingRow;
  label: string;
  align: "left" | "center";
}[];

export type FantasyOptionalColumn = (typeof FANTASY_OPTIONAL_COLUMNS)[number];

/**
 * The optional columns at least one row actually populates.
 *
 * Keeps the table honest: a dataset without ADP renders no ADP column rather
 * than a column of em dashes that implies the figure exists but is missing.
 */
export function getPopulatedColumns(
  rows: readonly FantasyRankingRow[],
): readonly FantasyOptionalColumn[] {
  return FANTASY_OPTIONAL_COLUMNS.filter((column) =>
    rows.some((row) => row[column.key] != null && row[column.key] !== ""),
  );
}

export function filterFantasyRankings(
  rows: readonly FantasyRankingRow[],
  position: FantasyPositionFilter,
  query: string,
): readonly FantasyRankingRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (position !== "ALL" && row.position !== position) return false;
    if (!needle) return true;
    return (
      row.player.toLowerCase().includes(needle) ||
      row.team.toLowerCase().includes(needle)
    );
  });
}

export function countByPosition(
  rows: readonly FantasyRankingRow[],
): Record<FantasyPositionFilter, number> {
  const counts = { ALL: rows.length } as Record<FantasyPositionFilter, number>;
  for (const position of FANTASY_POSITIONS) {
    counts[position] = rows.filter((row) => row.position === position).length;
  }
  return counts;
}
