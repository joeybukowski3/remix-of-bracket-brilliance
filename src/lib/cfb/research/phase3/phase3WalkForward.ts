import { buildSeasonObservations, loadSeasonGames, loadSeasonTeamGames } from "../phase2/loadTeamGameObservations";
import type { CfbMetricName, GameObservation, WalkForwardPrediction } from "../phase2/types";
import type { CfbResearchGame } from "../types";
import { buildPriorsForSeasons } from "./buildPriorsForSeasons";
import { runPhase3WalkForwardCore, type Phase3Method } from "./phase3WalkForwardCore";
import type { CfbPriorFeatureSet, PriorRatings } from "./types";

export type Phase3WalkForwardOptions = {
  method: Phase3Method;
  metricSet: readonly CfbMetricName[];
  testSeasons: readonly number[];
  /** Only needed for the two *_WITH_PRIOR method kinds. */
  priorFeatureSet?: CfbPriorFeatureSet;
  priorLambda?: number;
};

export function runPhase3WalkForward(options: Phase3WalkForwardOptions): WalkForwardPrediction[] {
  const gamesBySeason = new Map<number, CfbResearchGame[]>();
  const observationsByMetricAndSeason = new Map<CfbMetricName, Map<number, GameObservation[]>>();
  for (const metric of options.metricSet) observationsByMetricAndSeason.set(metric, new Map());

  for (const season of options.testSeasons) {
    const teamGames = loadSeasonTeamGames(season);
    const games = loadSeasonGames(season);
    gamesBySeason.set(season, games);
    for (const metric of options.metricSet) {
      const obs = buildSeasonObservations(teamGames, games, metric, "NONE", "gameWeighted");
      observationsByMetricAndSeason.get(metric)!.set(season, obs);
    }
  }

  let priorsBySeason: Map<number, Map<string, PriorRatings>> = new Map();
  const needsPrior = options.method.kind === "ITERATIVE_WITH_PRIOR" || options.method.kind === "RIDGE_WITH_PRIOR";
  let effectiveTestSeasons = options.testSeasons;
  if (needsPrior) {
    priorsBySeason = buildPriorsForSeasons(options.testSeasons, options.priorFeatureSet ?? "PRIOR_D", options.priorLambda ?? 3);
    effectiveTestSeasons = options.testSeasons.filter((s) => priorsBySeason.has(s));
  }

  return runPhase3WalkForwardCore({
    method: options.method,
    metricSet: options.metricSet,
    testSeasons: effectiveTestSeasons,
    gamesBySeason,
    observationsByMetricAndSeason,
    priorsBySeason,
  });
}
