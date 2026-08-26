/**
 * Row model for the PAR-first position research boards (QB, RB, WR, TE).
 *
 * Every board is ordered by projected PAR/G descending — the approved `parRank`
 * is already that ordering, so this module only re-projects it into display
 * shape. No PAR value is recomputed here, and tier membership always comes from
 * the approved `PAR_TIER_BOUNDARIES`.
 *
 * The displayed position rank is the canonical JKB workbook value carried by
 * the joined row. PAR/G can order the board, but it never supplies or
 * recomputes the displayed position rank.
 */

import {
  FANTASY_POSITION_RESEARCH_BOARDS,
  type FantasyResearchBoardRow,
} from "@/lib/fantasy/parRankings";
import {
  FANTASY_RANKINGS,
  getFantasyMetricValues,
  type FantasyPosition,
} from "@/lib/fantasy/rankings";
import {
  buildTeamContextIndex,
  resolveTeamContext,
  type TeamContext,
} from "@/lib/fantasy/teamContext";
import { getParActual2025, type FantasyParActual2025 } from "@/lib/fantasy/parActual2025";
import { getSeasonRank2025, type SeasonRank2025 } from "@/lib/fantasy/seasonRanks2025";
import {
  getMaxRank,
  getParPerGameThresholds,
  type ParPerGameThresholds,
} from "@/lib/fantasy/parPresentation";

export type PositionBoardRow = {
  row: FantasyResearchBoardRow;
  /** "QB1", "RB12"… from the canonical JKB workbook position rank. */
  positionRankLabel?: string;
  /** True when this row opens a new tier in the current (filtered) ordering. */
  isTierStart: boolean;
  metrics: readonly (number | undefined)[];
  /** 2025 actual season, joined on Source ID; undefined when there is no 2025 data. */
  actual2025?: FantasyParActual2025;
  /** 2025 positional finish by total points and by PPG; undefined with no 2025 data. */
  seasonRank2025?: SeasonRank2025;
  /**
   * Prior-season closing-stretch rank. Player level, so an unmatched row leaves
   * it undefined rather than borrowing a teammate's.
   */
  lateSeasonRank?: number;
  /**
   * SOS / O-line / playoff weeks. Taken from the row's own workbook match when
   * it has one, otherwise borrowed from a teammate.
   */
  teamContext: TeamContext;
};

/** A row before tier-start marking, which depends on the filtered ordering. */
export type UnmarkedPositionBoardRow = Omit<PositionBoardRow, "isTierStart">;

export type PositionBoardScales = {
  par: ParPerGameThresholds | null;
  metric0: number | null;
  metric1: number | null;
  metric2: number | null;
  late: number | null;
  sos: number | null;
  oline: number | null;
};

const TEAM_CONTEXT_INDEX = buildTeamContextIndex(FANTASY_RANKINGS.rows);

function toBoardRow(row: FantasyResearchBoardRow, position: FantasyPosition): UnmarkedPositionBoardRow {
  const canonicalPositionRank = row.jkb?.positionRank;
  return {
    row,
    positionRankLabel: Number.isInteger(canonicalPositionRank)
      ? `${position}${canonicalPositionRank}`
      : undefined,
    // Resolves each position's own three workbook metric fields. These are
    // player level, so an unmatched row keeps them undefined — never borrowed.
    metrics: row.jkb ? getFantasyMetricValues(row.jkb) : [undefined, undefined, undefined],
    actual2025: getParActual2025(row.par?.sourceId),
    seasonRank2025: getSeasonRank2025(row.par?.sourceId),
    lateSeasonRank: row.jkb?.lateSeasonRank,
    teamContext: resolveTeamContext(row.jkb, row.team, position, TEAM_CONTEXT_INDEX),
  };
}

function markTierStarts(rows: readonly UnmarkedPositionBoardRow[]): PositionBoardRow[] {
  return rows.map((entry, index) => ({
    ...entry,
    isTierStart: index > 0 && entry.row.tier !== rows[index - 1].row.tier,
  }));
}

/** Every tiered player at this position, ordered by projected PAR/G descending. */
export function getTieredRows(position: FantasyPosition): readonly UnmarkedPositionBoardRow[] {
  return FANTASY_POSITION_RESEARCH_BOARDS[position].tierGroups
    .flatMap((group) => group.rows)
    .filter((row) => row.par)
    .sort((a, b) => b.par!.parPerGame - a.par!.parPerGame || a.par!.parRank - b.par!.parRank)
    .map((row) => toBoardRow(row, position));
}

/** JKB-ranked players with no approved PAR row; they keep JKB position-rank order. */
export function getOutsideRows(position: FantasyPosition): readonly UnmarkedPositionBoardRow[] {
  return FANTASY_POSITION_RESEARCH_BOARDS[position].outsideDraftPool.map((row) =>
    toBoardRow(row, position),
  );
}

/**
 * Colour scales derived from this position's full tiered pool, so filtering
 * never shifts them and no cutoff leaks between positions.
 */
export function buildScales(rows: readonly UnmarkedPositionBoardRow[]): PositionBoardScales {
  return {
    par: getParPerGameThresholds(rows.map((entry) => entry.row.par?.parPerGame)),
    metric0: getMaxRank(rows.map((entry) => entry.metrics[0])),
    metric1: getMaxRank(rows.map((entry) => entry.metrics[1])),
    metric2: getMaxRank(rows.map((entry) => entry.metrics[2])),
    late: getMaxRank(rows.map((entry) => entry.lateSeasonRank)),
    sos: getMaxRank(rows.map((entry) => entry.teamContext.strengthOfSchedule)),
    oline: getMaxRank(rows.map((entry) => entry.teamContext.offensiveLineRank)),
  };
}

export function filterRows(
  rows: readonly UnmarkedPositionBoardRow[],
  query: string,
): PositionBoardRow[] {
  const matching = query
    ? rows.filter(
        (entry) =>
          entry.row.player.toLowerCase().includes(query) ||
          entry.row.team?.toLowerCase().includes(query) === true,
      )
    : rows;
  return markTierStarts(matching);
}
