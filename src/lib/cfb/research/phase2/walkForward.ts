import { buildSeasonObservations, loadSeasonGames, loadSeasonTeamGames } from "./loadTeamGameObservations";
import { runWalkForwardCore, type MethodConfig } from "./walkForwardCore";
import type { CfbAggregationMode, CfbGarbagePolicy, CfbMetricName, GameObservation, WalkForwardPrediction } from "./types";
import type { CfbResearchGame } from "../types";

export type { MethodConfig } from "./walkForwardCore";

export type WalkForwardOptions = {
  methodConfig: MethodConfig;
  metricSet: readonly CfbMetricName[];
  policy: CfbGarbagePolicy;
  aggregationMode: CfbAggregationMode;
  warmStartSeason: number;
  testSeasons: readonly number[];
};

/** File-loading wrapper around the pure runWalkForwardCore (see walkForwardCore.ts / walkForward.test.ts). */
export function runWalkForward(options: WalkForwardOptions): WalkForwardPrediction[] {
  const allSeasons = [options.warmStartSeason, ...options.testSeasons.filter((s) => s > options.warmStartSeason)];
  const uniqueSeasons = [...new Set(allSeasons)].sort((a, b) => a - b);

  const gamesBySeason = new Map<number, CfbResearchGame[]>();
  const observationsByMetricAndSeason = new Map<CfbMetricName, Map<number, GameObservation[]>>();
  for (const metric of options.metricSet) observationsByMetricAndSeason.set(metric, new Map());

  for (const season of uniqueSeasons) {
    const teamGames = loadSeasonTeamGames(season);
    const games = loadSeasonGames(season);
    gamesBySeason.set(season, games);
    for (const metric of options.metricSet) {
      const obs = buildSeasonObservations(teamGames, games, metric, options.policy, options.aggregationMode);
      observationsByMetricAndSeason.get(metric)!.set(season, obs);
    }
  }

  return runWalkForwardCore({
    methodConfig: options.methodConfig,
    metricSet: options.metricSet,
    warmStartSeason: options.warmStartSeason,
    testSeasons: options.testSeasons,
    gamesBySeason,
    observationsByMetricAndSeason,
  });
}
