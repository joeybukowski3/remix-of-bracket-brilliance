/**
 * Per-position display config for the PAR-first research boards.
 *
 * Only presentation lives here. The three evidence-metric *values* are resolved
 * by `getFantasyMetricValues`, which already switches on the row's position and
 * reads the workbook's existing `metrics` fields — these are just the labels for
 * those columns, in the same workbook order.
 */

import type { FantasyPosition } from "@/lib/fantasy/rankings";

export type PositionBoardConfig = {
  position: FantasyPosition;
  /** Board heading, e.g. "Running backs". */
  name: string;
  /** Approved replacement-baseline label, e.g. "RB25". */
  baselineLabel: string;
  /** Labels for the three "Position evidence" columns, in workbook order. */
  metricLabels: readonly [string, string, string];
};

export const POSITION_BOARD_CONFIGS: Record<FantasyPosition, PositionBoardConfig> = {
  QB: {
    position: "QB",
    name: "Quarterbacks",
    baselineLabel: "QB13",
    metricLabels: ["Passer Rating Rk", "Rushing Yds/Game Rk", "Pass TD/Attempt Rk"],
  },
  RB: {
    position: "RB",
    name: "Running backs",
    baselineLabel: "RB25",
    metricLabels: ["Touches Rk", "Red Zone Touches Rk", "YPC Rk"],
  },
  WR: {
    position: "WR",
    name: "Wide receivers",
    baselineLabel: "WR37",
    metricLabels: ["Target % Rk", "Air Yds/Game Rk", "Targets/Game Rk"],
  },
  TE: {
    position: "TE",
    name: "Tight ends",
    baselineLabel: "TE13",
    metricLabels: ["Target Share Rk", "Targets/Route Run Rk", "YPRR Rk"],
  },
};
