import type { CfbDerivedTeamGameMetrics } from "../derived/types";
import type { CfbMetricName, GameObservation } from "../phase2/types";
import { estimateScoringEnvironment } from "../phase4/scoringEnvironment";
import { fitScoringModel, predictScore } from "../phase4/scoringRegression";
import type { ScoringModelConfig, ScoringObservation } from "../phase4/types";
import type { PriorRatings } from "../phase3/types";
import type { CfbResearchGame } from "../types";
import { computeCandidateTeamRatings } from "./candidateRatings";
import { buildWeekGraphSnapshots } from "./scheduleGraph";
import type { Phase8CandidateSpec, Phase8Prediction, WeekGraphSnapshot } from "./types";

const METRIC_SET: CfbMetricName[] = ["ypp", "ppp"];

function isFbsVsFbsGame(game: CfbResearchGame): boolean {
  return (game.homeClassification ?? "").toLowerCase() === "fbs" && (game.awayClassification ?? "").toLowerCase() === "fbs";
}

export type Phase8SeasonData = {
  games: readonly CfbResearchGame[];
  teamGames: readonly CfbDerivedTeamGameMetrics[];
  observationsByMetric: ReadonlyMap<CfbMetricName, readonly GameObservation[]>;
  priors: ReadonlyMap<string, PriorRatings> | undefined;
  teamConferenceById: ReadonlyMap<string, string | null>;
  prevSeasonRatingByTeam: ReadonlyMap<string, number | null>; // for transition-team flag only
};

type TeamPaceSecondaryAverages = { paceRaw: number | null; paceNeutral: number | null; ppa: number | null; success: number | null; explosive: number | null };

function teamPaceAndSecondaryAverages(teamGames: readonly CfbDerivedTeamGameMetrics[]): Map<string, TeamPaceSecondaryAverages> {
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

export type Phase8WalkForwardOptions = {
  scoringConfig: ScoringModelConfig;
  testSeasons: readonly number[];
  seasonData: ReadonlyMap<number, Phase8SeasonData>;
  candidateSpec: Phase8CandidateSpec;
};

/**
 * Section 23 — mirrors phase4/phase4WalkForwardCore.ts's leakage-safe
 * walk-forward EXACTLY (same rating-snapshot-per-cutoff discipline, same
 * scoring-regression training-pool accumulation, same
 * fitScoringModel/predictScore calls imported read-only from Phase 4), with
 * ONLY the rating step swapped: computeCandidateTeamRatings (per-team λ,
 * graph-aware) instead of Phase 4's computeCompositeRidgeWithPriorRatings
 * (single scalar λ). Phase 4 itself is never imported for its walk-forward
 * function, only its scoring-regression primitives.
 */
export function runPhase8WalkForwardCore(options: Phase8WalkForwardOptions): Phase8Prediction[] {
  const allObservationRows: ScoringObservation[] = [];
  const predictions: Phase8Prediction[] = [];
  const graphSnapshotsBySeason = new Map<number, WeekGraphSnapshot[]>();

  const seasonMeans = new Map<number, number>();
  for (const [season, data] of options.seasonData) {
    const scores = data.games.filter((g) => g.status === "final" && isFbsVsFbsGame(g)).flatMap((g) => [g.homeScore, g.awayScore]).filter((s): s is number => s !== null);
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

    if (!graphSnapshotsBySeason.has(season)) graphSnapshotsBySeason.set(season, buildWeekGraphSnapshots(season, data.games, data.teamConferenceById));
    const graphByWeek = new Map(graphSnapshotsBySeason.get(season)!.map((g) => [g.week, g]));

    const allPriorSeasonsScores: number[] = [];
    for (const [s, mean] of seasonMeans) if (s < season) allPriorSeasonsScores.push(mean);
    const allPriorSeasonsMean = allPriorSeasonsScores.length === 0 ? null : allPriorSeasonsScores.reduce((s, v) => s + v, 0) / allPriorSeasonsScores.length;
    const previousSeasonMean = seasonMeans.get(season - 1) ?? null;

    for (const week of weeks) {
      const trainGamesThisSeason = games.filter((g) => g.week < week);
      if (!priors) continue;
      const graphSnapshot = graphByWeek.get(week);
      if (!graphSnapshot) continue;

      const obsByMetric = new Map<CfbMetricName, GameObservation[]>();
      for (const metric of METRIC_SET) {
        const all = data.observationsByMetric.get(metric) ?? [];
        obsByMetric.set(metric, all.filter((o) => o.week < week));
      }
      const { ratings, stalenessByTeam } = computeCandidateTeamRatings(teamIds, METRIC_SET, obsByMetric, priors, graphSnapshot, options.candidateSpec);

      const teamGamesThisSeasonSoFar = data.teamGames.filter((r) => r.week < week);
      const paceSecondary = teamPaceAndSecondaryAverages(teamGamesThisSeasonSoFar);

      const currentSeasonScores = trainGamesThisSeason.flatMap((g) => [g.homeScore, g.awayScore]).filter((s): s is number => s !== null);
      const currentSeasonSoFarMean = currentSeasonScores.length === 0 ? null : currentSeasonScores.reduce((s, v) => s + v, 0) / currentSeasonScores.length;

      const scoringEnvironmentEstimate = estimateScoringEnvironment(
        { allPriorSeasonsMean, previousSeasonMean, currentSeasonSoFarMean, currentSeasonGamesSoFar: trainGamesThisSeason.length },
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

      for (const game of trainGamesThisSeason) {
        const home = buildRow(game, "home");
        const away = buildRow(game, "away");
        if (home) allObservationRows.push(home);
        if (away) allObservationRows.push(away);
      }

      if (!testSeasonSet.has(season)) continue;

      const trainingPool = allObservationRows.filter((r) => r.season < season || (r.season === season && r.week < week));
      if (trainingPool.length === 0) continue;
      const model = fitScoringModel(trainingPool, options.scoringConfig);

      for (const game of games.filter((g) => g.week === week)) {
        const homeRow = buildRow(game, "home");
        const awayRow = buildRow(game, "away");
        const expectedHomePoints = homeRow ? predictScore(model, homeRow) : null;
        const expectedAwayPoints = awayRow ? predictScore(model, awayRow) : null;
        const projectedMargin = expectedHomePoints === null || expectedAwayPoints === null ? null : expectedHomePoints - expectedAwayPoints;
        const projectedTotal = expectedHomePoints === null || expectedAwayPoints === null ? null : expectedHomePoints + expectedAwayPoints;
        const homeGraph = graphSnapshot.byTeam.get(game.homeExternalId);
        const awayGraph = graphSnapshot.byTeam.get(game.awayExternalId);

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
          homeComponentSize: homeGraph?.componentSize ?? null,
          awayComponentSize: awayGraph?.componentSize ?? null,
          homeGamesPlayed: homeGraph?.weightedDegree ?? null,
          awayGamesPlayed: awayGraph?.weightedDegree ?? null,
          homeConference: data.teamConferenceById.get(game.homeExternalId) ?? null,
          awayConference: data.teamConferenceById.get(game.awayExternalId) ?? null,
          homeTransitionTeam: (data.prevSeasonRatingByTeam.get(game.homeExternalId) ?? null) === null,
          awayTransitionTeam: (data.prevSeasonRatingByTeam.get(game.awayExternalId) ?? null) === null,
          homeStaleness: stalenessByTeam.get(game.homeExternalId) ?? null,
          awayStaleness: stalenessByTeam.get(game.awayExternalId) ?? null,
        });
      }
    }
  }

  return predictions;
}
