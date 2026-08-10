/**
 * Fantasy Football ranking schema.
 *
 * This module defines the *shape* of a Joe Knows Ball fantasy ranking set and
 * the helpers used to render it. The published 2026 list lives in
 * `src/data/fantasyRankings2026.ts` (a verbatim extraction of the supplied
 * workbook) and is exposed here as `FANTASY_RANKINGS` so pages and tests share
 * one source.
 *
 * Only `overallRank`, `player` and `position` are required. Every analytical
 * field is optional so a supplied dataset can carry whatever columns actually
 * exist, and blank cells stay undefined (never coerced to zero). `team` is
 * also optional because the 2026 list contains free agents with no team.
 */

import { FANTASY_RANKING_ROWS_2026 } from "@/data/fantasyRankings2026";

export type FantasyPosition = "QB" | "RB" | "WR" | "TE";

export const FANTASY_POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

/** Filter identifiers for the rankings table. "ALL" is the default view. */
export type FantasyPositionFilter = "ALL" | FantasyPosition;

export const FANTASY_POSITION_FILTERS: readonly FantasyPositionFilter[] = ["ALL", ...FANTASY_POSITIONS];

/**
 * Position-specific metric ranks. Each position has three verified metrics from
 * the workbook; the field present for a row depends on `row.position`.
 */
export type FantasyPositionMetrics = {
  // QB: Passer Rating, Rush Yds/Game, Pass TD/Attempt
  passerRatingRank?: number;
  rushingYardsPerGameRank?: number;
  passTdPerAttemptRank?: number;
  // RB: Touches, Red Zone Touches, YPC
  touchesRank?: number;
  redZoneTouchesRank?: number;
  ypcRank?: number;
  // WR: Target Percent, Air Yards/Game, Targets/Game
  targetPercentRank?: number;
  airYardsPerGameRank?: number;
  targetsPerGameRank?: number;
  // TE: Target Share, Targets/Route Run, YPRR
  targetShareRank?: number;
  targetsPerRouteRunRank?: number;
  yprrRank?: number;
};

/** Display labels for each position's three metrics, in workbook column order. */
export const FANTASY_POSITION_METRIC_LABELS: Record<FantasyPosition, readonly [string, string, string]> = {
  QB: ["Passer Rating", "Rush Yds/Game", "Pass TD/Attempt"],
  RB: ["Touches", "Red Zone Touches", "YPC"],
  WR: ["Target Percent", "Air Yards/Game", "Targets/Game"],
  TE: ["Target Share", "Targets/Route Run", "YPRR"],
};

/** Returns the row's three metric rank values for its position, in label order. */
export function getFantasyMetricValues(row: FantasyRankingRow): readonly (number | undefined)[] {
  const m = row.metrics ?? {};
  switch (row.position) {
    case "QB":
      return [m.passerRatingRank, m.rushingYardsPerGameRank, m.passTdPerAttemptRank];
    case "RB":
      return [m.touchesRank, m.redZoneTouchesRank, m.ypcRank];
    case "WR":
      return [m.targetPercentRank, m.airYardsPerGameRank, m.targetsPerGameRank];
    case "TE":
      return [m.targetShareRank, m.targetsPerRouteRunRank, m.yprrRank];
  }
}

export type FantasyRankingRow = {
  /** 1-based rank across every position. Required — it is the list's identity. */
  overallRank: number;
  player: string;
  /** Canonical lowercase NFL abbreviation, matching the rest of the NFL data. Omitted for free agents. */
  team?: string;
  position: FantasyPosition;

  /** Rank within the player's own position (workbook col D). */
  positionRank?: number;
  /** Draft round of the player's pick in the 12-team mock draft (col A). */
  draftRound?: number;
  /** Pick number within that draft round (col B). */
  roundPick?: number;
  /** Average of the component ranks — WAR, late-season, projection, Vegas (col M). */
  averageRank?: number;
  /** JKB WAR rank within position (col I). */
  warRank?: number;
  /** FantasyPros projection rank within position (col K). */
  projectionRank?: number;
  /** Sportsbook season-long prop rank within position (col L); blank for WR/TE until TD props exist. */
  vegasRank?: number;
  /** Rank over the closing stretch of the prior season (col J, weeks 11-17). */
  lateSeasonRank?: number;
  /** Positional strength of schedule; 1 is the easiest slate (col N). */
  strengthOfSchedule?: number;
  /** Offensive-line rank for the player's team (col O). */
  offensiveLineRank?: number;
  /** Opponent in fantasy playoff week 15 (col P). "@" prefix = away. */
  playoffWeek15Opponent?: string;
  /** Opponent in fantasy playoff week 16 (col Q). "@" prefix = away. */
  playoffWeek16Opponent?: string;
  /** Opponent in fantasy playoff week 17 (col R). "@" prefix = away. */
  playoffWeek17Opponent?: string;
  /** The three position-specific metric ranks from the workbook (cols F-H). */
  metrics?: FantasyPositionMetrics;

  byeWeek?: number;
  /** Joe Knows Ball composite score. Scale is defined by the supplied dataset. */
  customScore?: number;
  /** Average draft position from the supplied source, for value comparison. */
  adp?: number;
  consensusRank?: number;
  projectedPoints?: number;
  priorSeasonRank?: number;
  tier?: number;
  notes?: string;
};

export type FantasyRankingSet = {
  season: number;
  scoring: string;
  updatedAt: string | null;
  source: string;
  rows: readonly FantasyRankingRow[];
};

/**
 * The published 2026 rankings: a verbatim extraction of the supplied workbook
 * (Main Rankings rows 5-254, Team Context rows 2-251).
 */
export const FANTASY_RANKINGS: FantasyRankingSet = {
  season: 2026,
  scoring: "PPR",
  updatedAt: "2026-08-08T00:00:00.000Z",
  source: "JoeKnowsBall",
  rows: FANTASY_RANKING_ROWS_2026,
};

export function countByPosition(rows: readonly FantasyRankingRow[]): Record<FantasyPosition, number> {
  const counts: Record<FantasyPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const row of rows) {
    counts[row.position] += 1;
  }
  return counts;
}

/**
 * Returns the subset of the optional-column catalog that at least one row in the
 * provided list actually populates. A column that no row populates is omitted so
 * the UI never renders an empty column.
 */
export function getPopulatedColumns(rows: readonly FantasyRankingRow[]) {
  const populated: Array<string> = [];
  for (const column of FANTASY_OPTIONAL_COLUMNS) {
    if (rows.some((row) => row[column.key] !== undefined && row[column.key] !== null)) {
      populated.push(column.key);
    }
  }
  return populated;
}

/**
 * Filters the rankings list by the chosen position and a free-text query.
 * The query matches the player name and the team abbreviation.
 */
export function filterFantasyRankings(
  rows: readonly FantasyRankingRow[],
  position: FantasyPositionFilter,
  query: string,
): readonly FantasyRankingRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle && position === "ALL") {
    return rows;
  }

  return rows.filter((row) => {
    const posOk = position === "ALL" || row.position === position;
    if (!posOk) return false;
    if (!needle) return true;
    const team = row.team?.toLowerCase() ?? "";
    return row.player.toLowerCase().includes(needle) || team.includes(needle);
  });
}

/** Catalog of optional columns, in display order. */
export const FANTASY_OPTIONAL_COLUMNS: ReadonlyArray<{
  key: keyof FantasyRankingRow;
  label: string;
  align: "left" | "right";
}> = [
  { key: "positionRank", label: "Pos Rank", align: "right" },
  { key: "draftRound", label: "Rd", align: "right" },
  { key: "roundPick", label: "Pick", align: "right" },
  { key: "averageRank", label: "AVG", align: "right" },
  { key: "warRank", label: "WAR", align: "right" },
  { key: "projectionRank", label: "Proj", align: "right" },
  { key: "vegasRank", label: "Vegas", align: "right" },
  { key: "lateSeasonRank", label: "Late", align: "right" },
  { key: "strengthOfSchedule", label: "SOS", align: "right" },
  { key: "offensiveLineRank", label: "O-Line", align: "right" },
  { key: "playoffWeek15Opponent", label: "W15", align: "right" },
  { key: "playoffWeek16Opponent", label: "W16", align: "right" },
  { key: "playoffWeek17Opponent", label: "W17", align: "right" },
  { key: "byeWeek", label: "Bye", align: "right" },
  { key: "customScore", label: "Score", align: "right" },
  { key: "adp", label: "ADP", align: "right" },
  { key: "consensusRank", label: "Consensus", align: "right" },
  { key: "projectedPoints", label: "Proj Pts", align: "right" },
  { key: "priorSeasonRank", label: "Prior", align: "right" },
  { key: "tier", label: "Tier", align: "right" },
  { key: "notes", label: "Notes", align: "left" },
];
