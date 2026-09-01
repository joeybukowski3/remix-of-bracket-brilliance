/**
 * Presentation-only JKB Heat resolution for the /nfl/power-ratings board.
 *
 * This module does NOT compute, re-derive, or alter any rating, rank, or sort
 * value. It takes the board rows the hook already produced and maps each scored
 * column onto the canonical site-wide JKB Heat scale via the shared entry point
 * (`src/lib/shared/jkbHeat.ts`):
 *
 * - `computeTeamPercentiles` — the fixed 32-team `n − 1` endpoint percentile
 *   (docs/TABLE_CONVENTIONS.md section F, KS-011). The best finite team reads a
 *   true 100 (Elite gold), the worst a true 0 (Poor strong-red).
 * - `getPercentileTier` + `tierToWeeklyHeatTone` + `jkbHeatStyle` — the 8-tier
 *   favorable-percentile bands and their shared fills. No new palette, no new
 *   thresholds, no hand-rolled inverse mapping.
 *
 * Direction is explicit per column (KS-010 / docs/TABLE_CONVENTIONS.md section
 * E). Every scored power-ratings column is a composite 1–99 overall rating where
 * higher is better — the defensive source metrics are already league-normalised
 * and inverted upstream in `powerRatingsEfficiency.buildOverallRatings`, so the
 * displayed OFF/DEF/YPP/EPA/Success values are all "higher is better" here.
 *
 * SoS (an average opponent rank), Record, and Team are context-only and are
 * never resolved by this module.
 */

import {
  computeTeamPercentiles,
  getPercentileTier,
  jkbHeatStyle,
  tierToWeeklyHeatTone,
  type PercentileTierId,
} from "@/lib/shared/jkbHeat";
import type { NflMetricDirection } from "@/lib/nfl/matchupMetrics";
import type { PowerRatingsRow } from "@/hooks/useNflPowerRatingsBoard";

export type PowerRatingsHeatColumn = "ovr" | "off" | "def" | "ypp" | "epa" | "success";

export const POWER_RATINGS_HEAT_COLUMNS = [
  "ovr",
  "off",
  "def",
  "ypp",
  "epa",
  "success",
] as const satisfies readonly PowerRatingsHeatColumn[];

/** Explicit good/bad orientation for every scored column. */
const HEAT_DIRECTION: Record<PowerRatingsHeatColumn, NflMetricDirection> = {
  ovr: "higher-is-better",
  off: "higher-is-better",
  def: "higher-is-better",
  ypp: "higher-is-better",
  epa: "higher-is-better",
  success: "higher-is-better",
};

/** The shared JKB Heat cell style — background, accessible text, inset border. */
export type PowerRatingsHeatStyle = {
  backgroundColor: string;
  color: string;
  boxShadow: string;
};

export type PowerRatingsMetricHeat = {
  tierId: PercentileTierId;
  tierLabel: string;
  /** Favorable percentile over the period's team population (`n − 1` endpoints). */
  percentile: number;
  style: PowerRatingsHeatStyle;
};

export type PowerRatingsHeat = {
  /** Resolved heat for one team's scored column, or `null` when the value is missing. */
  resolve(column: PowerRatingsHeatColumn, teamAbbr: string): PowerRatingsMetricHeat | null;
};

type PowerRatingsHeatSourceRow = Pick<PowerRatingsRow, "abbr" | PowerRatingsHeatColumn>;

/**
 * Build a `column + team → heat` lookup from the board's full, UNSORTED row
 * population. Percentiles are computed once per column against that population,
 * so row sort order and the Rankings/Ratings display mode never change a cell's
 * heat, and switching period recomputes heat from that period's population only.
 */
export function buildPowerRatingsHeat(
  rows: readonly PowerRatingsHeatSourceRow[],
): PowerRatingsHeat {
  const byColumn = new Map<PowerRatingsHeatColumn, Map<string, PowerRatingsMetricHeat>>();

  for (const column of POWER_RATINGS_HEAT_COLUMNS) {
    const population = rows.map((row) => ({ teamAbbr: row.abbr, value: row[column].value }));
    const percentiles = computeTeamPercentiles(population, HEAT_DIRECTION[column]);

    const resolved = new Map<string, PowerRatingsMetricHeat>();
    for (const [teamAbbr, percentile] of percentiles) {
      // computeTeamPercentiles already maps favorable → 100, so the tier lookup
      // consumes the percentile directly (higherBetter).
      const tier = getPercentileTier(percentile, "higherBetter");
      if (!tier) continue;
      resolved.set(teamAbbr, {
        tierId: tier.id,
        tierLabel: tier.label,
        percentile,
        style: jkbHeatStyle(tierToWeeklyHeatTone(tier.id)),
      });
    }
    byColumn.set(column, resolved);
  }

  return {
    resolve: (column, teamAbbr) => byColumn.get(column)?.get(teamAbbr) ?? null,
  };
}
