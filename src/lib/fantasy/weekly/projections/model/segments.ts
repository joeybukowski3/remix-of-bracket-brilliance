import type { HistorySegmentName, Row, SeasonSegmentName, UsageSegmentName } from "./types";

/**
 * Deterministic, pregame-known segmentation (spec section 3). Never uses
 * target-week participation, stats, or outcome to assign a segment.
 */

export function seasonSegment(row: Row): SeasonSegmentName {
  if (row.week <= 3) return "weeks-1-3";
  if (row.week <= 8) return "weeks-4-8";
  return "weeks-9-plus";
}

export function historySegment(row: Row): HistorySegmentName {
  return row.rookieOrNoPriorHistory ? "rookie-no-prior" : "prior-history";
}

/**
 * Established vs low usage is defined ONLY from strictly-prior, pregame-known
 * usage evidence (`gamesPlayedPrior`, `seasonPpgPrior`/`priorSeasonPpg`), never
 * from the target week. A player with fewer than 3 current-season games and no
 * prior-season games has no deterministic usage signal yet -> "usage-unknown".
 */
export function usageSegment(row: Row): UsageSegmentName {
  const referencePpg = row.seasonPpgPrior ?? row.priorSeasonPpg;
  if (referencePpg == null) return "usage-unknown";
  const hasEnoughSample = row.gamesPlayedPrior >= 3 || row.hasPriorSeason;
  if (!hasEnoughSample) return "usage-unknown";
  return referencePpg >= 8 ? "established-usage" : "low-usage";
}

export function segmentRows<T extends Row>(rows: readonly T[]) {
  return {
    weeks1to3: rows.filter((row) => seasonSegment(row) === "weeks-1-3"),
    weeks4to8: rows.filter((row) => seasonSegment(row) === "weeks-4-8"),
    weeks9plus: rows.filter((row) => seasonSegment(row) === "weeks-9-plus"),
    priorHistory: rows.filter((row) => historySegment(row) === "prior-history"),
    rookieNoPrior: rows.filter((row) => historySegment(row) === "rookie-no-prior"),
    establishedUsage: rows.filter((row) => usageSegment(row) === "established-usage"),
    lowUsage: rows.filter((row) => usageSegment(row) === "low-usage"),
    usageUnknown: rows.filter((row) => usageSegment(row) === "usage-unknown"),
  };
}
