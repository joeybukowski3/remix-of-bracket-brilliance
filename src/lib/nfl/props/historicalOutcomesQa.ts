import type { NflYardageOutcomeRow, NflYardageOutcomeSkipReason } from "./historicalOutcomes";
import { outcomeRowKey } from "./historicalOutcomes";

/**
 * Pure QA/integrity helpers for the Phase 1 historical outcome artifact.
 * Separated from `historicalOutcomes.ts` (row-level normalization) so the
 * generator, and any future consumer, can independently verify integrity
 * without re-deriving it from the artifact by hand. Every function here is
 * a read-only summary -- none of them mutate or drop rows.
 */

export type NflYardagePositionCoverage = {
  position: string;
  rows: number;
  players: number;
  weeks: number;
  minWeek: number;
  maxWeek: number;
};

export type NflYardageSeasonCoverage = {
  season: number;
  positions: readonly NflYardagePositionCoverage[];
};

/** Returns every duplicate `season|week|playerId` key found, empty if none. */
export function findDuplicateOutcomeKeys(rows: readonly NflYardageOutcomeRow[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const key = outcomeRowKey(row);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

/** Per-season, per-position row/player/week coverage. */
export function summarizeSeasonCoverage(
  rows: readonly NflYardageOutcomeRow[],
): NflYardageSeasonCoverage[] {
  const seasons = [...new Set(rows.map((row) => row.context.season))].sort((a, b) => a - b);
  return seasons.map((season) => {
    const seasonRows = rows.filter((row) => row.context.season === season);
    const positions = [...new Set(seasonRows.map((row) => row.context.position))].sort();
    return {
      season,
      positions: positions.map((position) => {
        const positionRows = seasonRows.filter((row) => row.context.position === position);
        const weeks = [...new Set(positionRows.map((row) => row.context.week))];
        return {
          position,
          rows: positionRows.length,
          players: new Set(positionRows.map((row) => row.context.playerId)).size,
          weeks: weeks.length,
          minWeek: Math.min(...weeks),
          maxWeek: Math.max(...weeks),
        };
      }),
    };
  });
}

/**
 * Counts players who appear under more than one team within the same
 * season -- an expected fact (trades, waiver claims), not a defect. Reported
 * as an informational QA count rather than silently absorbed.
 */
export function countPlayersWithMultipleTeamsInSeason(rows: readonly NflYardageOutcomeRow[]): number {
  const teamsByPlayerSeason = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = `${row.context.season}|${row.context.playerId}`;
    const teams = teamsByPlayerSeason.get(key) ?? new Set<string>();
    teams.add(row.context.team);
    teamsByPlayerSeason.set(key, teams);
  }
  let count = 0;
  for (const teams of teamsByPlayerSeason.values()) {
    if (teams.size > 1) count += 1;
  }
  return count;
}

export function countGameContextResolution(
  rows: readonly NflYardageOutcomeRow[],
): { resolved: number; unresolved: number } {
  let resolved = 0;
  let unresolved = 0;
  for (const row of rows) {
    if (row.context.gameId != null) resolved += 1;
    else unresolved += 1;
  }
  return { resolved, unresolved };
}

export function emptySkipCounts(): Record<NflYardageOutcomeSkipReason, number> {
  return {
    "missing-gsis-id": 0,
    "unsupported-position": 0,
    "invalid-name": 0,
    "non-regular-season": 0,
  };
}
