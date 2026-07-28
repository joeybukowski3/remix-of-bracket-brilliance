import { buildPercentileLookup, getPercentileTier } from "@/lib/mlb/percentileColorScale";
import type { PgaTournamentModelRow } from "@/lib/pga/historyModel";

export type PgaScoreComparisonMode = "field" | "tour";

/**
 * Select the complete, pre-search comparison population for the active table mode.
 * Field mode uses every modeled official entrant. Tour mode uses every modeled player.
 * The returned rows preserve the input order and never alter scores or ranks.
 */
export function selectPgaScoreComparisonRows(
  modelRows: readonly PgaTournamentModelRow[],
  mode: PgaScoreComparisonMode,
): PgaTournamentModelRow[] {
  if (mode === "tour") return [...modelRows];
  return modelRows.filter((row) => row.fieldRank != null);
}

export function buildPgaScorePercentileLookup(rows: readonly PgaTournamentModelRow[]) {
  return buildPercentileLookup(rows.map((row) => row.modelScore));
}

export function getPgaScoreTier(
  score: number,
  percentileLookup: ReadonlyMap<number, number>,
) {
  return getPercentileTier(percentileLookup.get(score) ?? null);
}
