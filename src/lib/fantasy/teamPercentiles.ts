/**
 * League percentiles for a team-level metric, over the 32-team population.
 *
 * POPULATION IS TEAMS, NEVER PLAYERS. Several fantasy players share one team
 * environment, so ranking a metric across player rows would weight a team by
 * how many of its players happen to be ranked. Every percentile here is
 * computed once against the unique team population supplied by the caller and
 * then looked up per row.
 *
 * SCALE: 100 = best, 0 = worst, league middle ≈ 50. The percentile is the share
 * of the OTHER teams this team beats:
 *
 *   percentile = (teams strictly worse) / (teamsWithAValue - 1) * 100
 *
 * Dividing by n-1 rather than n is deliberate — it makes the endpoints exact,
 * so the best offense in the league reads 100 and the worst reads 0. This is
 * why `computePercentileRanks` in `src/lib/mlb/percentileColorScale.ts` is not
 * reused: it divides by n, which caps the best of 32 teams at 96.9 and is
 * calibrated for populations of hundreds (its top tier starts at 98, a band
 * that is unreachable in a 32-team league).
 *
 * TIES: teams with an identical value receive an identical percentile — the one
 * earned by the whole tied block (the count strictly worse than all of them).
 * Ordering is therefore fully deterministic and independent of input order.
 *
 * MISSING DATA: a team with no value is excluded from the population entirely
 * and resolves to `null`, never to 0 or to a league-average placeholder. A
 * metric no team can supply yields all nulls rather than a fabricated spread.
 */

import type { NflMetricDirection } from "@/lib/nfl/matchupMetrics";

/** A team's raw value for one metric. `null` means genuinely unavailable. */
export type TeamMetricValue = { teamAbbr: string; value: number | null };

/**
 * Percentiles by team abbreviation for one metric.
 *
 * `direction` is required rather than defaulted: a metric whose direction is
 * unknown must not be silently treated as higher-is-better. `"context-only"`
 * metrics have no good/bad orientation at all and always resolve to null, so a
 * volume or tendency stat can never be painted as if it were a quality signal.
 */
export function computeTeamPercentiles(
  population: readonly TeamMetricValue[],
  direction: NflMetricDirection,
): Map<string, number> {
  const result = new Map<string, number>();
  if (direction === "context-only") return result;

  const finite = population.filter(
    (entry): entry is { teamAbbr: string; value: number } =>
      entry.value != null && Number.isFinite(entry.value),
  );
  if (finite.length === 0) return result;
  if (finite.length === 1) {
    // A single team is neither above nor below the league; 50 is the only
    // honest answer, and matches the neutral middle of the colour ramp.
    result.set(finite[0].teamAbbr, 50);
    return result;
  }

  // Sort worst -> best so index position is "number of teams strictly worse"
  // once ties are collapsed. Higher-is-better sorts ascending; lower-is-better
  // sorts descending, which is the only place orientation changes anything.
  const sign = direction === "lower-is-better" ? -1 : 1;
  const sorted = [...finite].sort((a, b) => sign * (a.value - b.value));

  const denominator = finite.length - 1;
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) end += 1;
    const percentile = (index / denominator) * 100;
    for (let i = index; i < end; i += 1) result.set(sorted[i].teamAbbr, percentile);
    index = end;
  }

  return result;
}

/** Rounded 0-100 percentile for display. Null stays null. */
export function formatPercentile(percentile: number | null | undefined): string {
  if (percentile == null || !Number.isFinite(percentile)) return "N/A";
  return String(Math.round(percentile));
}
