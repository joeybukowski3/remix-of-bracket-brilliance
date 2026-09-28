/**
 * Per-defense aggregation of game deltas (actual - opponent baseline) and
 * league ranking. Pure: inputs are the published game rows, so every value
 * here is reproducible from games[] alone.
 *
 * Rank 1 = most negative delta (opponents fell furthest below their normal
 * production = best defense), matching Fantasy Points Allowed's direction.
 * Ties break by fewer games above average, then team abbreviation.
 */

import { round1 } from "./baseline";
import {
  YARDS_VS_AVERAGE_PCT_MIN_BASELINE_PER_GAME,
  YARDS_VS_AVERAGE_PCT_SUPPRESSED_METRICS,
  type YardsVsAverageGame,
  type YardsVsAverageMetricKey,
  type YardsVsAverageMetricSample,
} from "./types";

type Unranked = Omit<YardsVsAverageMetricSample, "rankYds" | "rankPct">;

/** Game delta rounded to one decimal (baselines are already one-decimal values). */
export function gameDelta(game: YardsVsAverageGame, metric: YardsVsAverageMetricKey): number | null {
  if (!game.baseline) return null;
  return round1(game.actual[metric] - game.baseline[metric]);
}

/**
 * deltaPct = 100 * sum(actual - baseline) / sum(baseline) -- a ratio of sums,
 * never a mean of per-game percentages. Null for suppressed metrics, empty
 * samples, and any sample whose mean baseline is below the per-game floor
 * (which also rules out zero/negative denominators).
 */
export function deltaPercent(metric: YardsVsAverageMetricKey, sumDelta: number, sumBaseline: number, games: number): number | null {
  if (YARDS_VS_AVERAGE_PCT_SUPPRESSED_METRICS.includes(metric)) return null;
  if (games <= 0 || !(sumBaseline / games >= YARDS_VS_AVERAGE_PCT_MIN_BASELINE_PER_GAME)) return null;
  const pct = round1((100 * sumDelta) / sumBaseline);
  return Number.isFinite(pct) ? pct : null;
}

/** Aggregates one defense's selected games for one metric. Games without a baseline must already be excluded. */
export function aggregateMetric(games: readonly YardsVsAverageGame[], metric: YardsVsAverageMetricKey): Unranked {
  let sumDelta = 0;
  let sumBaseline = 0;
  let gamesAbove = 0;
  let gamesBelow = 0;
  for (const game of games) {
    const delta = gameDelta(game, metric);
    if (delta == null) throw new Error(`Game ${game.key} has no baseline and cannot be sampled.`);
    sumDelta += delta;
    sumBaseline += game.baseline![metric];
    if (delta > 0) gamesAbove += 1;
    else if (delta < 0) gamesBelow += 1;
  }
  const gamesSampled = games.length;
  return {
    gamesSampled,
    deltaYds: gamesSampled ? round1(sumDelta / gamesSampled) : null,
    deltaPct: deltaPercent(metric, sumDelta, sumBaseline, gamesSampled),
    gamesAbove,
    gamesBelow,
  };
}

/** Ascending ranks over non-null values (1 = most negative). */
export function rankAscending(
  entries: readonly { team: string; value: number | null; gamesAbove: number }[],
): Map<string, number> {
  const eligible = entries.filter((entry): entry is { team: string; value: number; gamesAbove: number } => entry.value != null);
  eligible.sort((a, b) => a.value - b.value || a.gamesAbove - b.gamesAbove || a.team.localeCompare(b.team));
  return new Map(eligible.map((entry, index) => [entry.team, index + 1]));
}

/** Aggregates and ranks one metric across all teams. */
export function computeMetricSamples(
  gamesByTeam: ReadonlyMap<string, readonly YardsVsAverageGame[]>,
  teams: readonly string[],
  metric: YardsVsAverageMetricKey,
): Map<string, YardsVsAverageMetricSample> {
  const unranked = new Map(teams.map((team) => [team, aggregateMetric(gamesByTeam.get(team) ?? [], metric)]));
  const entries = (select: (sample: Unranked) => number | null) =>
    teams.map((team) => ({ team, value: select(unranked.get(team)!), gamesAbove: unranked.get(team)!.gamesAbove }));
  const rankYds = rankAscending(entries((sample) => sample.deltaYds));
  const rankPct = rankAscending(entries((sample) => sample.deltaPct));
  return new Map(teams.map((team) => [team, {
    ...unranked.get(team)!,
    rankYds: rankYds.get(team) ?? null,
    rankPct: rankPct.get(team) ?? null,
  }]));
}
