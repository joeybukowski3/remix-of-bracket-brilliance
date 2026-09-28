/**
 * Builds the full Yards vs Avg artifact from normalized player-week rows.
 * Deterministic: identical rows/inputs always produce identical output apart
 * from the caller-supplied generatedAt, so the pipeline is a safe full rebuild.
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { selectDefenseGames } from "@/lib/nfl/fantasyAllowed/aggregate";
import { selectorForSample, type CurrentOpponentLookup } from "@/lib/nfl/fantasyAllowed/buildRows";
import { computeMetricSamples } from "./aggregate";
import { buildDefenseGames, YARDS_VS_AVERAGE_BASELINE_POLICY } from "./baseline";
import { buildOffenseGameLog } from "./gameLog";
import {
  YARDS_VS_AVERAGE_METRIC_DEFINITIONS,
  YARDS_VS_AVERAGE_METRIC_KEYS,
  YARDS_VS_AVERAGE_PCT_MIN_BASELINE_PER_GAME,
  YARDS_VS_AVERAGE_PCT_SUPPRESSED_METRICS,
  YARDS_VS_AVERAGE_SAMPLE_KEYS,
  YARDS_VS_AVERAGE_SCHEMA_VERSION,
  type YardsVsAverageArtifact,
  type YardsVsAverageGame,
  type YardsVsAverageMetricSamples,
  type YardsVsAverageRow,
  type YardsVsAverageSampleKey,
} from "./types";

export type BuildYardsVsAverageInput = {
  /** Player-week rows for seasons S-2, S-1 and S (S-2 only feeds S-1 prior means). */
  rows: readonly HistoricalPlayerWeek[];
  teams: readonly string[];
  season: number;
  week: number | null;
  opponents: CurrentOpponentLookup;
  generatedAt: string;
};

export function buildYardsVsAverageArtifact(input: BuildYardsVsAverageInput): YardsVsAverageArtifact {
  const priorSeason = input.season - 1;
  const teamSet = new Set(input.teams);
  const games = buildDefenseGames(buildOffenseGameLog(input.rows), [priorSeason, input.season])
    .filter((game) => teamSet.has(game.defense));

  // Only games with a baseline can be sampled (see baseline.ts's no-baseline rule).
  const sampleable = games.filter((game) => game.baseline != null).map((game) => ({ ...game, team: game.defense }));

  const samplesByKey = new Map<YardsVsAverageSampleKey, Map<string, YardsVsAverageMetricSamples>>();
  for (const sampleKey of YARDS_VS_AVERAGE_SAMPLE_KEYS) {
    const selector = selectorForSample(sampleKey, input.season, priorSeason);
    const gamesByTeam = new Map<string, YardsVsAverageGame[]>(
      input.teams.map((team) => [team, selectDefenseGames(sampleable, team, selector)]),
    );
    const byMetric = YARDS_VS_AVERAGE_METRIC_KEYS.map((metric) => [metric, computeMetricSamples(gamesByTeam, input.teams, metric)] as const);
    samplesByKey.set(sampleKey, new Map(input.teams.map((team) => [
      team,
      Object.fromEntries(byMetric.map(([metric, samples]) => [metric, samples.get(team)!])) as YardsVsAverageMetricSamples,
    ])));
  }

  const rows = input.teams.map((team): YardsVsAverageRow => {
    const opponent = input.opponents.get(team) ?? { opponent: null, location: null };
    return {
      team,
      opponent: opponent.opponent,
      location: opponent.location,
      samples: Object.fromEntries(YARDS_VS_AVERAGE_SAMPLE_KEYS.map((key) => [key, samplesByKey.get(key)!.get(team)!])) as YardsVsAverageRow["samples"],
    };
  });

  return {
    schemaVersion: YARDS_VS_AVERAGE_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    season: input.season,
    week: input.week,
    baselinePolicy: {
      version: YARDS_VS_AVERAGE_BASELINE_POLICY.version,
      priorWeights: [...YARDS_VS_AVERAGE_BASELINE_POLICY.projectionWeights],
      currentComponent: "Mean of the offense's other same-season REG games (leave-one-out); completedGames = that count",
      priorComponent: "Mean of the offense's REG games in the previous season",
    },
    percent: {
      formula: "100 * sum(actual - baseline) / sum(baseline) over the sampled games",
      minBaselinePerGame: YARDS_VS_AVERAGE_PCT_MIN_BASELINE_PER_GAME,
      suppressedMetrics: [...YARDS_VS_AVERAGE_PCT_SUPPRESSED_METRICS],
    },
    metrics: { ...YARDS_VS_AVERAGE_METRIC_DEFINITIONS },
    games,
    rows,
  };
}
