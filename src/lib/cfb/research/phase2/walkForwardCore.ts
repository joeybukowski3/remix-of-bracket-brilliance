import { buildCompositeRatings, type CompositeTeamRating, type MetricAdjustmentResult } from "./compositeRating";
import { computeIterativeAdjustment, type IterativeAdjustmentConfig } from "./iterativeAdjustment";
import { computeRidgeAdjustment, type RidgeAdjustmentConfig } from "./ridgeAdjustment";
import { computePartialPoolingAdjustment, type PartialPoolingConfig } from "./partialPoolingAdjustment";
import { fitMarginTranslation, predictMargin } from "./marginTranslation";
import type { CfbMetricName, GameObservation, WalkForwardPrediction } from "./types";
import type { CfbResearchGame } from "../types";

export type MethodConfig =
  | { method: "ITERATIVE"; config: IterativeAdjustmentConfig }
  | { method: "RIDGE"; config: RidgeAdjustmentConfig }
  | { method: "PARTIAL_POOLING"; config: PartialPoolingConfig };

export type WalkForwardCoreOptions = {
  methodConfig: MethodConfig;
  metricSet: readonly CfbMetricName[];
  warmStartSeason: number;
  testSeasons: readonly number[];
  gamesBySeason: ReadonlyMap<number, readonly CfbResearchGame[]>;
  observationsByMetricAndSeason: ReadonlyMap<CfbMetricName, ReadonlyMap<number, readonly GameObservation[]>>;
};

function computeMethodResult(
  methodConfig: MethodConfig,
  teamIds: readonly string[],
  observations: readonly GameObservation[],
) {
  switch (methodConfig.method) {
    case "ITERATIVE":
      return computeIterativeAdjustment(teamIds, observations, methodConfig.config);
    case "RIDGE":
      return computeRidgeAdjustment(teamIds, observations, methodConfig.config);
    case "PARTIAL_POOLING":
      return computePartialPoolingAdjustment(teamIds, observations, methodConfig.config);
  }
}

function isFbsVsFbsGame(game: CfbResearchGame): boolean {
  return (
    (game.homeClassification ?? "").toLowerCase() === "fbs" &&
    (game.awayClassification ?? "").toLowerCase() === "fbs"
  );
}

/**
 * Pure walk-forward core — no file I/O, takes preloaded per-season data so
 * it is directly unit-testable (see walkForward.test.ts leakage tests).
 * Section 2 contract: for test week W of season S, training data is
 * strictly (season < S) OR (season === S AND week < W) — enforced here by
 * array filtering before any fit call; nothing from week W or later ever
 * reaches trainingObservations/trainingGames.
 */
export function runWalkForwardCore(options: WalkForwardCoreOptions): WalkForwardPrediction[] {
  function trainingObservations(metric: CfbMetricName, season: number, week: number): GameObservation[] {
    const bySeasonMap = options.observationsByMetricAndSeason.get(metric);
    if (!bySeasonMap) return [];
    const rows: GameObservation[] = [];
    for (const [s, obs] of bySeasonMap) {
      if (s < season) rows.push(...obs);
      else if (s === season) rows.push(...obs.filter((o) => o.week < week));
    }
    return rows;
  }

  function trainingGames(season: number, week: number): CfbResearchGame[] {
    const rows: CfbResearchGame[] = [];
    for (const [s, games] of options.gamesBySeason) {
      if (s < season) rows.push(...games);
      else if (s === season) rows.push(...games.filter((g) => g.week < week));
    }
    return rows.filter((g) => g.status === "final" && isFbsVsFbsGame(g));
  }

  const predictions: WalkForwardPrediction[] = [];

  for (const testSeason of options.testSeasons) {
    if (testSeason === options.warmStartSeason) continue;
    const testGames = (options.gamesBySeason.get(testSeason) ?? []).filter(
      (g) => g.status === "final" && isFbsVsFbsGame(g),
    );
    const weeks = [...new Set(testGames.map((g) => g.week))].sort((a, b) => a - b);

    for (const week of weeks) {
      const trainGamesForWeek = trainingGames(testSeason, week);
      if (trainGamesForWeek.length === 0) continue;

      const teamIds = [...new Set(trainGamesForWeek.flatMap((g) => [g.homeExternalId, g.awayExternalId]))];

      const perMetricResults: MetricAdjustmentResult[] = options.metricSet.map((metric) => ({
        metric,
        teams: computeMethodResult(options.methodConfig, teamIds, trainingObservations(metric, testSeason, week))
          .teams,
      }));
      const { ratings } = buildCompositeRatings(perMetricResults, teamIds);
      const ratingByTeam = new Map<string, CompositeTeamRating>(ratings.map((r) => [r.teamExternalId, r]));

      const translationRows = trainGamesForWeek
        .map((game) => {
          const home = ratingByTeam.get(game.homeExternalId);
          const away = ratingByTeam.get(game.awayExternalId);
          if (!home?.power || !away?.power || game.homeScore === null || game.awayScore === null) return null;
          return {
            ratingDifferential: home.power - away.power,
            actualMargin: game.homeScore - game.awayScore,
            isHome: true,
            isNeutral: game.neutralSite,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const coefficients = fitMarginTranslation(translationRows);

      for (const game of testGames.filter((g) => g.week === week)) {
        const home = ratingByTeam.get(game.homeExternalId);
        const away = ratingByTeam.get(game.awayExternalId);
        const ratingDifferential =
          home?.power !== null && home?.power !== undefined && away?.power !== null && away?.power !== undefined
            ? home.power - away.power
            : null;
        const predictedMargin =
          ratingDifferential === null ? null : predictMargin(ratingDifferential, true, game.neutralSite, coefficients);
        const actualMargin = game.homeScore === null || game.awayScore === null ? null : game.homeScore - game.awayScore;

        predictions.push({
          season: testSeason,
          week,
          gameId: game.gameId,
          homeTeamExternalId: game.homeExternalId,
          awayTeamExternalId: game.awayExternalId,
          ratingDifferential,
          predictedMargin,
          actualMargin,
        });
      }
    }
  }

  return predictions;
}
