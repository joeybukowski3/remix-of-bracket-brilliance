/**
 * Presentation-only mapping from the Position Matchup artifact onto the
 * table's row shape, plus this page's rank/edge heat-tone helpers. No
 * ranks/edges are recomputed here -- see aggregate.ts/buildRows.ts for the
 * pipeline that produced them.
 */

import type { CSSProperties } from "react";
import { jkbHeatStyle, weeklyRankHeatTone, type WeeklyHeatTone } from "@/lib/shared/jkbHeat";
import { POSITION_MATCHUP_POSITION_KEYS, type PositionMatchupArtifact, type PositionMatchupPositionKey, type PositionMatchupRating, type PositionMatchupSampleKey } from "./types";

export type PositionMatchupTableCell = {
  forRank: number | null;
  forRaw: number | null;
  forDisplay: string | null;
  allowedRank: number | null;
  allowedRaw: number | null;
  allowedDisplay: string | null;
  edge: number | null;
  rating: PositionMatchupRating | null;
};

export type PositionMatchupTableRow = {
  id: string;
  team: string;
  opponent: string | null;
  location: "@" | "vs" | null;
  cells: Record<PositionMatchupPositionKey, PositionMatchupTableCell>;
};

/** Raw display uses fantasy points PER GAME (never the sample total), one decimal place. */
function formatPerGame(perGame: number | null | undefined): string | null {
  if (perGame == null) return null;
  return perGame.toFixed(1);
}

export function buildPositionMatchupTableRows(
  artifact: PositionMatchupArtifact | null,
  sample: PositionMatchupSampleKey,
): PositionMatchupTableRow[] {
  if (!artifact) return [];
  return artifact.rows.map((row): PositionMatchupTableRow => {
    const positionCells = row.samples[sample];
    const cells = {} as Record<PositionMatchupPositionKey, PositionMatchupTableCell>;
    for (const key of POSITION_MATCHUP_POSITION_KEYS) {
      const cell = positionCells[key];
      cells[key] = {
        forRank: cell.forRank,
        forRaw: cell.forPerGame,
        forDisplay: formatPerGame(cell.forPerGame),
        allowedRank: cell.allowedRank,
        allowedRaw: cell.allowedPerGame,
        allowedDisplay: formatPerGame(cell.allowedPerGame),
        edge: cell.edge,
        rating: cell.rating,
      };
    }
    return {
      id: row.team,
      team: row.team,
      opponent: row.opponent,
      location: row.location,
      cells,
    };
  });
}

export type HeatTone = { className?: string; style?: CSSProperties };

function toneFromWeeklyHeat(tone: WeeklyHeatTone): HeatTone {
  if (tone === "missing") return {};
  const style = jkbHeatStyle(tone);
  return { style: { backgroundColor: style.backgroundColor, color: style.color } };
}

/** Direct (un-inverted) read of the shared 32-team JKB heat scale: rank 1 = most fantasy points -> gold, rank 32 -> strong-red. Used for the FOR column (more production is better). */
export function positionMatchupForRankTone(rank: number | null): HeatTone {
  return toneFromWeeklyHeat(weeklyRankHeatTone(rank, 32));
}

/** Same direct scale for the ALLOWED column: rank 32 (most allowed = most exploitable defense) reads favorable-strong from the offense's perspective, so we invert the input rank before reading the shared scale. */
export function positionMatchupAllowedRankTone(rank: number | null): HeatTone {
  if (rank == null) return {};
  return toneFromWeeklyHeat(weeklyRankHeatTone(33 - rank, 32));
}

const RATING_TONE: Record<PositionMatchupRating, WeeklyHeatTone> = {
  "very-strong": "green",
  strong: "light-green",
  neutral: "gold",
  weak: "light-red",
  "very-weak": "strong-red",
};

/** JKB gold/green/red rating language, per the page spec: green = strongest, gold = neutral, red = weakest. */
export function positionMatchupRatingTone(rating: PositionMatchupRating | null): HeatTone {
  if (rating == null) return {};
  return toneFromWeeklyHeat(RATING_TONE[rating]);
}
