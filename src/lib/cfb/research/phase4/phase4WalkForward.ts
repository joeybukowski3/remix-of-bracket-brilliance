import { buildSeasonObservations, loadSeasonGames, loadSeasonTeamGames } from "../phase2/loadTeamGameObservations";
import type { CfbMetricName, GameObservation } from "../phase2/types";
import { buildPriorsForSeasons } from "../phase3/buildPriorsForSeasons";
import type { CfbPriorFeatureSet, PriorRatings } from "../phase3/types";
import { runPhase4WalkForwardCore, type SeasonData } from "./phase4WalkForwardCore";
import type { ScoringModelConfig, ScorePrediction } from "./types";

const METRIC_SET: CfbMetricName[] = ["ypp", "ppp"];

export type Phase4WalkForwardOptions = {
  scoringConfig: ScoringModelConfig;
  testSeasons: readonly number[];
  priorFeatureSet?: CfbPriorFeatureSet;
  priorLambda?: number;
  ratingLambda?: number;
};

export function runPhase4WalkForward(options: Phase4WalkForwardOptions): ScorePrediction[] {
  const warmStartSeason = 2018;
  const allSeasons = [...new Set([warmStartSeason, 2019, ...options.testSeasons])].sort((a, b) => a - b);

  const priorsBySeason = buildPriorsForSeasons(
    options.testSeasons,
    options.priorFeatureSet ?? "PRIOR_D",
    options.priorLambda ?? 3,
  );

  const seasonData = new Map<number, SeasonData>();
  for (const season of allSeasons) {
    const games = loadSeasonGames(season);
    const teamGames = loadSeasonTeamGames(season);
    const observationsByMetric = new Map<CfbMetricName, GameObservation[]>();
    for (const metric of METRIC_SET) {
      observationsByMetric.set(metric, buildSeasonObservations(teamGames, games, metric, "NONE", "gameWeighted"));
    }
    seasonData.set(season, {
      games,
      teamGames,
      observationsByMetric,
      priors: priorsBySeason.get(season),
    });
  }

  return runPhase4WalkForwardCore({
    scoringConfig: options.scoringConfig,
    testSeasons: options.testSeasons,
    seasonData,
    ratingLambda: options.ratingLambda,
  });
}
