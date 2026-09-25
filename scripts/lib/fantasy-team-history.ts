/**
 * Current-season team EPA history for the weekly fantasy projection generator.
 *
 * The trained RB residual (`frozenSpec.ts`) consumes `teamRushEpaPrior` and `teamOffensivePlaysPrior`, which `buildTrainingRow` derives from
 * `HistoricalTeamGameRow[]`. The TRAINING dataset generator builds those rows from the manifest-verified `epa-team-game` cache with exactly this
 * mapping; the production generator previously passed none, leaving both features null for every RB. This module is the single mapping used by
 * production so training and inference consume identical feature semantics.
 */
import { normalizeNflTeamAbbr } from "../../src/lib/fantasy/weekly/identity.ts";
import type { HistoricalTeamGameRow } from "../../src/lib/fantasy/weekly/projections/build.ts";

function num(row: Record<string, string>, key: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${key} in epa-team-game row ${row.game_id ?? "?"}.`);
  return value;
}

/** Same field mapping and team normalization as `generate-fantasy-player-week-projection-dataset.ts`. */
export function mapEpaTeamGameRows(rows: readonly Record<string, string>[]): HistoricalTeamGameRow[] {
  return rows.map((row) => ({
    season: num(row, "season"), week: num(row, "week"),
    team: normalizeNflTeamAbbr(row.team) ?? row.team, opponent: normalizeNflTeamAbbr(row.opponent) ?? row.opponent,
    offEpa: num(row, "off_epa"), offPlays: num(row, "off_plays"),
    passEpa: num(row, "pass_epa"), passPlays: num(row, "pass_plays"),
    rushEpa: num(row, "rush_epa"), rushPlays: num(row, "rush_plays"),
  }));
}

/**
 * Strictly-prior rows for a target week. Fails closed for week > 1 when the season has no rows at all -- a silent empty history is exactly the
 * defect this module exists to prevent. Returns the latest cached week so the caller can surface lag.
 */
export function priorSeasonTeamHistory(rows: readonly HistoricalTeamGameRow[], season: number, week: number): { rows: HistoricalTeamGameRow[]; latestWeek: number | null } {
  const prior = rows.filter((row) => row.season === season && row.week < week);
  if (week > 1 && prior.length === 0) {
    throw new Error(`Week ${week} requires current-season team EPA history (epa-team-game ${season}); refusing to generate RB projections with null team-context features.`);
  }
  return { rows: prior, latestWeek: prior.length ? Math.max(...prior.map((row) => row.week)) : null };
}
