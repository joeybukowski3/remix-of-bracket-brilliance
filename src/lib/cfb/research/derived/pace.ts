import { CFB_PHASE1_METRICS_CONFIG } from "./metricsConfig";
import type { PlayMetricRow } from "./playMetricRow";

const SECONDS_PER_QUARTER = 15 * 60;
const MAX_PLAUSIBLE_GAP_SECONDS = SECONDS_PER_QUARTER;

function totalClockSeconds(row: Pick<PlayMetricRow, "clockMinutes" | "clockSeconds">): number | null {
  if (row.clockMinutes === null || row.clockSeconds === null) return null;
  return row.clockMinutes * 60 + row.clockSeconds;
}

/**
 * Section 8: elapsed seconds between consecutive plays, computed only
 * within the same period with strictly decreasing clock. Cross-period
 * (quarter/halftime/OT) boundaries and any non-decreasing or absurd gap
 * are skipped rather than guessed — "do not fabricate elapsed time when
 * clock ordering is invalid."
 */
export function computeSecondsPerPlay(
  rows: readonly Pick<PlayMetricRow, "period" | "clockMinutes" | "clockSeconds" | "gameId">[],
): { secondsPerPlay: number | null; playCount: number } {
  const ordered = [...rows].sort((a, b) => {
    if (a.period !== b.period) return (a.period ?? 0) - (b.period ?? 0);
    const aSeconds = totalClockSeconds(a) ?? -1;
    const bSeconds = totalClockSeconds(b) ?? -1;
    return bSeconds - aSeconds; // higher time-remaining first within a period
  });

  let totalElapsed = 0;
  let validIntervals = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (prev.period === null || cur.period === null || prev.period !== cur.period) continue;
    const prevSeconds = totalClockSeconds(prev);
    const curSeconds = totalClockSeconds(cur);
    if (prevSeconds === null || curSeconds === null) continue;
    const gap = prevSeconds - curSeconds;
    if (gap <= 0 || gap > MAX_PLAUSIBLE_GAP_SECONDS) continue; // invalid/non-decreasing clock — skip, don't fabricate
    totalElapsed += gap;
    validIntervals += 1;
  }

  return {
    secondsPerPlay: validIntervals === 0 ? null : totalElapsed / validIntervals,
    playCount: rows.length,
  };
}

/**
 * Section 8 situation-neutral pace: eligible scrimmage plays, |margin| <=
 * maxAbsScoreMargin, excludes the final `excludeFinalSecondsOfHalf` of
 * each half (periods 2 and 4 only — periods 1 and 3 always have a full
 * following quarter left in the half), regulation only when configured.
 */
export function filterSituationNeutralPlays(
  rows: readonly Pick<
    PlayMetricRow,
    "period" | "clockMinutes" | "clockSeconds" | "offenseScore" | "defenseScore" | "gameId"
  >[],
): typeof rows {
  const config = CFB_PHASE1_METRICS_CONFIG.situationNeutral;
  return rows.filter((row) => {
    if (config.regulationOnly && (row.period === null || row.period >= 5)) return false;
    if (row.offenseScore === null || row.defenseScore === null) return false;
    if (Math.abs(row.offenseScore - row.defenseScore) > config.maxAbsScoreMargin) return false;
    const seconds = totalClockSeconds(row);
    const isHalfEndingQuarter = row.period === 2 || row.period === 4;
    if (isHalfEndingQuarter && seconds !== null && seconds <= config.excludeFinalSecondsOfHalf) return false;
    return true;
  });
}
