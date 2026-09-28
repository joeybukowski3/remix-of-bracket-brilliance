/**
 * Opponent baselines: for offense O, metric M and target game G in season S,
 *
 *   baseline = priorWeight * mean(O's season S-1 games)
 *            + currentWeight * mean(O's OTHER season S games, excluding G)
 *
 * The weights come from the existing nfl-comparison-blend-v1 fade
 * (getProjectionBlendWeights), with completedGames = O's other season-S games.
 * A baseline depends only on the offense and the game -- never on which
 * defense window the game is later displayed in -- so a 2025 game inside
 * Last 8 always uses its own 2025 baseline.
 *
 * Explicit no-baseline rule: when the blend gives the prior season any weight
 * but O has no prior-season games, the baseline is null (the game is kept in
 * games[] for transparency but excluded from every sample). No other fallback
 * is substituted.
 */

import { getProjectionBlendWeights, PROJECTION_BLEND_POLICY } from "@/lib/nfl/projectionBlendPolicy";
import type { OffenseGame } from "./gameLog";
import { YARDS_VS_AVERAGE_METRIC_KEYS, type YardsVsAverageGame, type YardsVsAverageMetricValues } from "./types";

export const YARDS_VS_AVERAGE_BASELINE_POLICY = PROJECTION_BLEND_POLICY;

export const round1 = (value: number) => Math.round(value * 10) / 10;

function meanValues(games: readonly OffenseGame[]): YardsVsAverageMetricValues | null {
  if (!games.length) return null;
  return Object.fromEntries(YARDS_VS_AVERAGE_METRIC_KEYS.map((metric) => [
    metric,
    games.reduce((sum, game) => sum + game.actual[metric], 0) / games.length,
  ])) as YardsVsAverageMetricValues;
}

export function defenseGameKey(game: Pick<OffenseGame, "season" | "week" | "defense" | "offense">): string {
  return `${game.season}-W${String(game.week).padStart(2, "0")}-${game.defense}-${game.offense}`;
}

/**
 * Attaches a baseline to every offense-game in `targetSeasons`. `offenseGames`
 * must include each target season's prior season so the blend's prior
 * component is available. Baselines/actuals are rounded to one decimal so
 * every aggregate is reproducible from the published game rows.
 */
export function buildDefenseGames(offenseGames: readonly OffenseGame[], targetSeasons: readonly number[]): YardsVsAverageGame[] {
  const byOffenseSeason = new Map<string, OffenseGame[]>();
  for (const game of offenseGames) {
    const key = `${game.offense}|${game.season}`;
    const list = byOffenseSeason.get(key) ?? [];
    list.push(game);
    byOffenseSeason.set(key, list);
  }
  const priorMeans = new Map<string, YardsVsAverageMetricValues | null>();
  const priorMean = (offense: string, season: number) => {
    const key = `${offense}|${season}`;
    if (!priorMeans.has(key)) priorMeans.set(key, meanValues(byOffenseSeason.get(key) ?? []));
    return priorMeans.get(key) ?? null;
  };

  const targets = new Set(targetSeasons);
  const result: YardsVsAverageGame[] = [];
  for (const game of offenseGames) {
    if (!targets.has(game.season)) continue;
    const others = (byOffenseSeason.get(`${game.offense}|${game.season}`) ?? []).filter((other) => other.week !== game.week);
    const { projectionWeight: priorWeight, observedWeight: currentWeight } = getProjectionBlendWeights(others.length);
    const prior = priorMean(game.offense, game.season - 1);
    const current = meanValues(others);

    let baseline: YardsVsAverageMetricValues | null = null;
    if (!(priorWeight > 0 && prior == null)) {
      baseline = Object.fromEntries(YARDS_VS_AVERAGE_METRIC_KEYS.map((metric) => [
        metric,
        round1((priorWeight > 0 ? priorWeight * prior![metric] : 0) + (currentWeight > 0 ? currentWeight * current![metric] : 0)),
      ])) as YardsVsAverageMetricValues;
    }

    result.push({
      key: defenseGameKey(game),
      season: game.season,
      week: game.week,
      defense: game.defense,
      offense: game.offense,
      otherGames: others.length,
      priorWeight,
      currentWeight,
      actual: Object.fromEntries(YARDS_VS_AVERAGE_METRIC_KEYS.map((metric) => [metric, round1(game.actual[metric])])) as YardsVsAverageMetricValues,
      baseline,
    });
  }
  return result.sort((a, b) => a.season - b.season || a.week - b.week || a.defense.localeCompare(b.defense));
}
