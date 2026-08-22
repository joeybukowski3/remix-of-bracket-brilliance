import type { CfbDerivedTeamGameMetrics } from "../derived/types";
import { buildSeasonObservations } from "../phase2/loadTeamGameObservations";
import type { CfbMetricName, GameObservation } from "../phase2/types";
import type { PriorRatings } from "../phase3/types";
import { computeCompositeRidgeWithPriorRatings, type TeamRatings } from "./ratingProvider";
import { estimateScoringEnvironment } from "./scoringEnvironment";
import { fitScoringModel, predictScore } from "./scoringRegression";
import type { ScoringModelConfig, ScoringObservation, ScorePrediction } from "./types";
import type { CfbResearchGame } from "../types";

const METRIC_SET: CfbMetricName[] = ["ypp", "ppp"];

function isFbsVsFbsGame(game: CfbResearchGame): boolean {
  return (
    (game.homeClassification ?? "").toLowerCase() === "fbs" &&
    (game.awayClassification ?? "").toLowerCase() === "fbs"
  );
}

function classifyMatchup(game: CfbResearchGame): ScorePrediction["matchupPopulation"] {
  const home = (game.homeClassification ?? "").toLowerCase();
  const away = (game.awayClassification ?? "").toLowerCase();
  if (!home || !away) return "unknown";
  if (home === "fbs" && away === "fbs") return "fbs_vs_fbs";
  if (home === "fbs" && away === "fcs") return "fbs_vs_fcs";
  if (home === "fcs" && away === "fbs") return "fcs_vs_fbs";
  if (home !== "fbs" && away !== "fbs") return "non_fbs_only";
  return "unknown";
}

type TeamPaceSecondaryAverages = {
  paceRaw: number | null;
  paceNeutral: number | null;
  ppa: number | null;
  success: number | null;
  explosive: number | null;
};

function teamPaceAndSecondaryAverages(
  teamGames: readonly CfbDerivedTeamGameMetrics[],
): Map<string, TeamPaceSecondaryAverages> {
  const byTeam = new Map<string, CfbDerivedTeamGameMetrics[]>();
  for (const row of teamGames) {
    const arr = byTeam.get(row.teamExternalId) ?? [];
    arr.push(row);
    byTeam.set(row.teamExternalId, arr);
  }
  const avg = (values: (number | null)[]) => {
    const finite = values.filter((v): v is number => v !== null);
    return finite.length === 0 ? null : finite.reduce((s, v) => s + v, 0) / finite.length;
  };
  const result = new Map<string, TeamPaceSecondaryAverages>();
  for (const [teamId, rows] of byTeam) {
    result.set(teamId, {
      paceRaw: avg(rows.map((r) => r.policyVariants.NONE.secondsPerPlay)),
      paceNeutral: avg(rows.map((r) => r.situationNeutralSecondsPerPlay)),
      ppa: avg(rows.map((r) => r.policyVariants.NONE.ppaPerPlay)),
      success: avg(rows.map((r) => r.policyVariants.NONE.ppaSuccessRate)),
      explosive: avg(rows.map((r) => r.policyVariants.NONE.explosivePlayRate)),
    });
  }
  return result;
}

export type SeasonData = {
  games: readonly CfbResearchGame[];
  teamGames: readonly CfbDerivedTeamGameMetrics[];
  observationsByMetric: ReadonlyMap<CfbMetricName, readonly GameObservation[]>;
  priors: ReadonlyMap<string, PriorRatings> | undefined;
};

export type Phase4WalkForwardOptions = {
  scoringConfig: ScoringModelConfig;
  testSeasons: readonly number[];
  seasonData: ReadonlyMap<number, SeasonData>;
  /** Ridge+prior rating penalty (Phase 3's "Ridge λ" — Section 20 sensitivity dimension). */
  ratingLambda?: number;
};

/**
 * Section 10 leakage-safe walk-forward for the scoring model. Precomputes
 * ONE rating/pace/secondary snapshot per (season, week) cutoff and reuses
 * it both to predict that week's games AND as the walk-forward-correct
 * feature values for any earlier game later used as a scoring-regression
 * training row — never a single end-of-history snapshot reused across
 * time (which would leak future ratings into training rows for old games).
 */
export function runPhase4WalkForwardCore(options: Phase4WalkForwardOptions): ScorePrediction[] {
  const allObservationRows: ScoringObservation[] = [];
  const predictions: ScorePrediction[] = [];

  // Section 4: all-prior-seasons and previous-season scoring means, built incrementally.
  const seasonMeans = new Map<number, number>(); // season -> mean points/team/game (full season)
  for (const [season, data] of options.seasonData) {
    const scores = data.games
      .filter((g) => g.status === "final" && isFbsVsFbsGame(g))
      .flatMap((g) => [g.homeScore, g.awayScore])
      .filter((s): s is number => s !== null);
    if (scores.length > 0) seasonMeans.set(season, scores.reduce((s, v) => s + v, 0) / scores.length);
  }

  const orderedSeasons = [...options.seasonData.keys()].sort((a, b) => a - b);
  const testSeasonSet = new Set(options.testSeasons);

  for (const season of orderedSeasons) {
    const data = options.seasonData.get(season)!;
    const games = data.games.filter((g) => g.status === "final" && isFbsVsFbsGame(g));
    const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
    const teamIds = [...new Set(games.flatMap((g) => [g.homeExternalId, g.awayExternalId]))];
    const priors = data.priors;

    const allPriorSeasonsScores: number[] = [];
    for (const [s, mean] of seasonMeans) if (s < season) allPriorSeasonsScores.push(mean);
    const allPriorSeasonsMean =
      allPriorSeasonsScores.length === 0 ? null : allPriorSeasonsScores.reduce((s, v) => s + v, 0) / allPriorSeasonsScores.length;
    const previousSeasonMean = seasonMeans.get(season - 1) ?? null;

    for (const week of weeks) {
      const trainGamesThisSeason = games.filter((g) => g.week < week);
      if (!priors) continue; // no trainable prior for this season (e.g. 2019) — Phase 3 already documents this

      // Ratings snapshot as of this cutoff (pooled: this season's weeks < week only — Phase 3 never pools seasons into one network).
      const obsByMetric = new Map<CfbMetricName, GameObservation[]>();
      for (const metric of METRIC_SET) {
        const all = data.observationsByMetric.get(metric) ?? [];
        obsByMetric.set(metric, all.filter((o) => o.week < week));
      }
      const ratings = computeCompositeRidgeWithPriorRatings(teamIds, METRIC_SET, obsByMetric, priors, options.ratingLambda ?? 20);

      const teamGamesThisSeasonSoFar = data.teamGames.filter((r) => r.week < week);
      const paceSecondary = teamPaceAndSecondaryAverages(teamGamesThisSeasonSoFar);

      const currentSeasonScores = trainGamesThisSeason
        .flatMap((g) => [g.homeScore, g.awayScore])
        .filter((s): s is number => s !== null);
      const currentSeasonSoFarMean =
        currentSeasonScores.length === 0 ? null : currentSeasonScores.reduce((s, v) => s + v, 0) / currentSeasonScores.length;

      const scoringEnvironmentInputs = {
        allPriorSeasonsMean,
        previousSeasonMean,
        currentSeasonSoFarMean,
        currentSeasonGamesSoFar: trainGamesThisSeason.length,
      };
      const scoringEnvironmentEstimate = estimateScoringEnvironment(
        scoringEnvironmentInputs,
        options.scoringConfig.scoringEnvironment,
        options.scoringConfig.priorGamesWeight,
      );

      function buildRow(game: CfbResearchGame, side: "home" | "away"): ScoringObservation | null {
        const teamId = side === "home" ? game.homeExternalId : game.awayExternalId;
        const oppId = side === "home" ? game.awayExternalId : game.homeExternalId;
        const teamRating = ratings.get(teamId);
        const oppRating = ratings.get(oppId);
        const teamPace = paceSecondary.get(teamId);
        const oppPace = paceSecondary.get(oppId);
        const actualPoints = side === "home" ? game.homeScore : game.awayScore;
        return {
          gameId: game.gameId,
          season: game.season,
          week: game.week,
          teamExternalId: teamId,
          opponentExternalId: oppId,
          teamClassification: side === "home" ? game.homeClassification : game.awayClassification,
          opponentClassification: side === "home" ? game.awayClassification : game.homeClassification,
          isHome: side === "home",
          isNeutral: game.neutralSite,
          teamOffenseRating: teamRating?.offense ?? null,
          opponentDefenseRating: oppRating?.defense ?? null,
          teamPaceRaw: teamPace?.paceRaw ?? null,
          opponentPaceRaw: oppPace?.paceRaw ?? null,
          teamPaceSituationNeutral: teamPace?.paceNeutral ?? null,
          opponentPaceSituationNeutral: oppPace?.paceNeutral ?? null,
          teamPpaPerPlay: teamPace?.ppa ?? null,
          opponentPpaAllowed: oppPace?.ppa ?? null,
          teamSuccessRate: teamPace?.success ?? null,
          opponentSuccessRateAllowed: oppPace?.success ?? null,
          teamExplosiveRate: teamPace?.explosive ?? null,
          opponentExplosiveRateAllowed: oppPace?.explosive ?? null,
          scoringEnvironmentEstimate,
          actualPoints,
        };
      }

      // Training rows: this week's cutoff features applied to games ALREADY completed before this week
      // (each such game, when it was itself "this week" earlier in the season, got this exact same
      // rating-as-of-that-week treatment — see module doc).
      for (const game of trainGamesThisSeason) {
        const home = buildRow(game, "home");
        const away = buildRow(game, "away");
        if (home) allObservationRows.push(home);
        if (away) allObservationRows.push(away);
      }

      if (!testSeasonSet.has(season)) continue; // loaded for training-pool/rating context only, not a requested test season

      const trainingPool = allObservationRows.filter((r) => r.season < season || (r.season === season && r.week < week));
      if (trainingPool.length === 0) continue;
      const model = fitScoringModel(trainingPool, options.scoringConfig);

      for (const game of games.filter((g) => g.week === week)) {
        const homeRow = buildRow(game, "home");
        const awayRow = buildRow(game, "away");
        const expectedHomePoints = homeRow ? predictScore(model, homeRow) : null;
        const expectedAwayPoints = awayRow ? predictScore(model, awayRow) : null;
        const projectedMargin =
          expectedHomePoints === null || expectedAwayPoints === null ? null : expectedHomePoints - expectedAwayPoints;
        const projectedTotal =
          expectedHomePoints === null || expectedAwayPoints === null ? null : expectedHomePoints + expectedAwayPoints;

        predictions.push({
          gameId: game.gameId,
          season: game.season,
          week: game.week,
          homeTeamExternalId: game.homeExternalId,
          awayTeamExternalId: game.awayExternalId,
          expectedHomePoints,
          expectedAwayPoints,
          projectedMargin,
          projectedTotal,
          actualHomePoints: game.homeScore,
          actualAwayPoints: game.awayScore,
          actualMargin: game.homeScore === null || game.awayScore === null ? null : game.homeScore - game.awayScore,
          actualTotal: game.homeScore === null || game.awayScore === null ? null : game.homeScore + game.awayScore,
          matchupPopulation: classifyMatchup(game),
        });
      }
    }
  }

  return predictions;
}
