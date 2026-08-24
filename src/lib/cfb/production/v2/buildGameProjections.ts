// CFB Model V2 — production game-projection generator (WU3 §3/§17-§20).
// CfbV2TeamRating[] -> scoring model -> TOTAL_ONLY calibration -> empirical
// residual bootstrap -> CfbV2GameProjection[]. SHADOW MODE ONLY. Zero
// runtime dependency on src/lib/cfb/research/**.

import { CFB_V2_CONFIG_VERSION, CFB_V2_PROBABILITY_CONFIG, CFB_V2_SCORING_CONFIG } from "./config";
import { CFB_V2_CALIBRATION_VERSION, CFB_V2_IPR_MODEL_VERSION, CFB_V2_PROBABILITY_VERSION, CFB_V2_SCORING_VERSION } from "./versions";
import type { CfbV2GameProjection, CfbV2MatchupPopulation, CfbV2TeamRating } from "./types";
import type { CfbV2CalibrationResidualSeedArtifact, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";
import { predictCfbV2Score, selectCfbV2ScoringSnapshot, solveCfbV2ScoringModel, type CfbV2ScoringFeatureVector } from "./scoringModel";
import { estimateCfbV2ScoringEnvironment, type CfbV2ScoringEnvironmentInputs } from "./scoringEnvironment";
import { computeCfbV2TeamSuccessSoFar, type CfbV2TeamGameSuccessObservation } from "./successFeature";
import { applyCfbV2TotalOnlyCalibration, fitCfbV2TotalCalibration } from "./totalCalibration";
import { buildCfbV2ResidualPool, CFB_V2_MIN_RESIDUAL_POOL_SIZE } from "./residualPool";
import { createCfbV2SeededRandom, deriveCfbV2GameSeed, runCfbV2EmpiricalBootstrap } from "./probability";
import { isEligibleBeforeCutoff, type CfbV2CalibrationResidualSeedRow } from "./scoringSupportTypes";

export class CfbV2ProjectionBuildError extends Error {}

/** Minimal schedule-game input this module needs (§19 schedule join). Deliberately excludes any market/odds field. */
export type CfbV2ScheduleGame = {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  neutralSite: boolean;
  homeClassification: string | null;
  awayClassification: string | null;
};

export type CfbV2BuildProjectionsInput = {
  season: number;
  /** Explicit as-of cutoff (§18) — never derived from today's calendar date. Games/ratings/SUCCESS/calibration/residuals valid strictly before this are used; nothing at/after it. */
  dataAsOf: { season: number; week: number };
  /** Caller-supplied ISO provenance string for this cutoff (e.g. the last completed game's kickoff, or a fixed preseason anchor) — never derived from today's calendar date. */
  dataAsOfIso: string;
  generatedAt: string;
  scheduleGames: readonly CfbV2ScheduleGame[];
  /** WU2 team ratings, already filtered to the correct season/asOfWeek by the caller. Keyed by teamId. */
  teamRatingsByTeamId: ReadonlyMap<string, CfbV2TeamRating>;
  scoringArtifact: CfbV2ScoringNormalEquationsArtifact;
  calibrationArtifact: CfbV2CalibrationResidualSeedArtifact;
  /** §11/§28 — completed current-season SUCCESS observations (empty during the 2026 preseason: zero completed games, no /plays ingestion yet). */
  currentSeasonSuccessObservations: readonly CfbV2TeamGameSuccessObservation[];
  /** §7/§11 — completed current-season (home,away) actual point totals, for the BLENDED_CURRENT scoring-environment feature. Empty during the 2026 preseason. */
  currentSeasonCompletedGameScores: readonly { homePoints: number; awayPoints: number }[];
  /** §7 — mean points/team/game for the season immediately preceding `season`, and across all prior seasons. Null when unavailable (documented limitation — see buildGameProjections.test.ts). */
  previousSeasonMean: number | null;
  allPriorSeasonsMean: number | null;
  /** §11 — completed current-season (rawTotal, actualTotal) pairs appended to the calibration training pool. Empty during the 2026 preseason. */
  currentSeasonCalibrationRows: readonly { rawTotal: number; actualTotal: number; season: number; week: number }[];
};

function classifyMatchup(homeClassification: string | null, awayClassification: string | null): CfbV2MatchupPopulation {
  const home = (homeClassification ?? "").toLowerCase();
  const away = (awayClassification ?? "").toLowerCase();
  if (home === "fbs" && away === "fbs") return "fbs_vs_fbs";
  if ((home === "fbs" && away === "fcs") || (home === "fcs" && away === "fbs")) return "fbs_vs_fcs";
  return "unsupported";
}

function unavailableProjection(game: CfbV2ScheduleGame, population: CfbV2MatchupPopulation, generatedAt: string, dataAsOfIso: string): CfbV2GameProjection {
  return {
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    expectedHomePoints: null,
    expectedAwayPoints: null,
    projectedMargin: null,
    projectedTotal: null,
    homeWinProbability: null,
    awayWinProbability: null,
    marginInterval50: null,
    marginInterval80: null,
    marginInterval90: null,
    marginInterval95: null,
    totalInterval50: null,
    totalInterval80: null,
    totalInterval90: null,
    totalInterval95: null,
    matchupPopulation: population,
    projectionStatus: "unavailable",
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    scoringVersion: CFB_V2_SCORING_VERSION,
    calibrationVersion: CFB_V2_CALIBRATION_VERSION,
    probabilityVersion: CFB_V2_PROBABILITY_VERSION,
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt,
    dataAsOf: dataAsOfIso,
  };
}

/**
 * Builds CfbV2GameProjection[] for a full schedule slate at one as-of
 * cutoff. Fails closed (throws CfbV2ProjectionBuildError) on artifact
 * integrity mismatches (§22) or schedule-join violations (§19) — never
 * silently degrades to a wrong artifact. Per-game unavailability (missing
 * rating/SUCCESS/scoring-environment/insufficient residual pool) is NOT a
 * thrown error — it is an honest `projectionStatus: "unavailable"` row.
 */
export function buildCfbV2GameProjections(input: CfbV2BuildProjectionsInput): CfbV2GameProjection[] {
  // §22 support-artifact integrity — fail closed on any version/config-hash mismatch.
  if (input.scoringArtifact.configVersion !== CFB_V2_CONFIG_VERSION) {
    throw new CfbV2ProjectionBuildError(`scoring support artifact configVersion mismatch: expected ${CFB_V2_CONFIG_VERSION}, got ${input.scoringArtifact.configVersion}`);
  }
  if (input.calibrationArtifact.configVersion !== CFB_V2_CONFIG_VERSION) {
    throw new CfbV2ProjectionBuildError(`calibration support artifact configVersion mismatch: expected ${CFB_V2_CONFIG_VERSION}, got ${input.calibrationArtifact.configVersion}`);
  }

  const { season, dataAsOf, dataAsOfIso } = input;

  // §19 schedule join — fail closed on duplicate gameId.
  const seenGameIds = new Set<string>();
  for (const game of input.scheduleGames) {
    if (seenGameIds.has(game.gameId)) throw new CfbV2ProjectionBuildError(`duplicate gameId in schedule input: ${game.gameId}`);
    seenGameIds.add(game.gameId);
    if (game.season !== season) throw new CfbV2ProjectionBuildError(`schedule game ${game.gameId} season ${game.season} does not match requested season ${season}`);
  }

  // §7 scoring-environment estimate — one scalar for this entire cutoff (BLENDED_CURRENT), never per-team.
  const currentSeasonScores = input.currentSeasonCompletedGameScores.flatMap((g) => [g.homePoints, g.awayPoints]);
  const currentSeasonSoFarMean = currentSeasonScores.length === 0 ? null : currentSeasonScores.reduce((s, v) => s + v, 0) / currentSeasonScores.length;
  const scoringEnvironmentInputs: CfbV2ScoringEnvironmentInputs = {
    allPriorSeasonsMean: input.allPriorSeasonsMean,
    previousSeasonMean: input.previousSeasonMean,
    currentSeasonSoFarMean,
    currentSeasonGamesSoFar: input.currentSeasonCompletedGameScores.length,
  };
  const scoringEnvironmentEstimate = estimateCfbV2ScoringEnvironment(scoringEnvironmentInputs, CFB_V2_SCORING_CONFIG.priorGamesWeight);

  // §8/§28 SUCCESS block — own + opponent-allowed, from completed current-season observations only (empty during preseason).
  const successByTeam = computeCfbV2TeamSuccessSoFar(input.currentSeasonSuccessObservations);

  // §4/§5 scoring model — one snapshot reconstruction per cutoff (shared across every game in this slate).
  const snapshot = selectCfbV2ScoringSnapshot(input.scoringArtifact, dataAsOf.season, dataAsOf.week);
  const scoringModel = solveCfbV2ScoringModel(snapshot, CFB_V2_SCORING_CONFIG.scoringRidgeLambda);

  // §10/§11 total calibration — pooled fit from eligible historical + current-season calibration rows.
  const historicalCalibrationRows: CfbV2CalibrationResidualSeedRow[] = input.calibrationArtifact.records.filter((row) => isEligibleBeforeCutoff(row, dataAsOf.season, dataAsOf.week));
  const calibrationTrainingRows = [
    ...historicalCalibrationRows.map((r) => ({ rawTotal: r.rawProjectedTotal, actualTotal: r.actualTotal })),
    ...input.currentSeasonCalibrationRows.filter((r) => isEligibleBeforeCutoff(r, dataAsOf.season, dataAsOf.week)).map((r) => ({ rawTotal: r.rawTotal, actualTotal: r.actualTotal })),
  ];
  const calibrationCoefficients = fitCfbV2TotalCalibration(calibrationTrainingRows);

  // §12/§13 residual pool — individual pairs, canonical order (residualPool.ts documents the ordering decision).
  const residualPool = buildCfbV2ResidualPool(input.calibrationArtifact, dataAsOf.season, dataAsOf.week);

  const projections: CfbV2GameProjection[] = [];
  for (const game of input.scheduleGames) {
    const population = classifyMatchup(game.homeClassification, game.awayClassification);
    if (population !== "fbs_vs_fbs") {
      projections.push(unavailableProjection(game, population, input.generatedAt, dataAsOfIso));
      continue;
    }

    const homeRating = input.teamRatingsByTeamId.get(game.homeTeamId);
    const awayRating = input.teamRatingsByTeamId.get(game.awayTeamId);
    if (!homeRating || !awayRating) {
      throw new CfbV2ProjectionBuildError(`schedule game ${game.gameId}: missing rating for ${!homeRating ? game.homeTeamId : game.awayTeamId} (§19 fail-closed on missing rating)`);
    }
    if (homeRating.season !== season || awayRating.season !== season) {
      throw new CfbV2ProjectionBuildError(`schedule game ${game.gameId}: rating season mismatch`);
    }

    const homeSuccess = successByTeam.get(game.homeTeamId) ?? null;
    const awayOppSuccess = successByTeam.get(game.awayTeamId) ?? null;
    const awaySuccess = successByTeam.get(game.awayTeamId) ?? null;
    const homeOppSuccess = successByTeam.get(game.homeTeamId) ?? null;

    const homeFeatures: CfbV2ScoringFeatureVector | null =
      scoringEnvironmentEstimate === null || homeSuccess === null || awayOppSuccess === null
        ? null
        : {
            offenseRating: homeRating.offenseRating,
            opponentDefenseRating: awayRating.defenseRating,
            hfa: game.neutralSite ? 0 : 1,
            scoringEnvironmentEstimate,
            successOwn: homeSuccess,
            successOpponentAllowed: awayOppSuccess,
          };
    const awayFeatures: CfbV2ScoringFeatureVector | null =
      scoringEnvironmentEstimate === null || awaySuccess === null || homeOppSuccess === null
        ? null
        : {
            offenseRating: awayRating.offenseRating,
            opponentDefenseRating: homeRating.defenseRating,
            hfa: game.neutralSite ? 0 : -1,
            scoringEnvironmentEstimate,
            successOwn: awaySuccess,
            successOpponentAllowed: homeOppSuccess,
          };

    const expectedHomePoints = predictCfbV2Score(scoringModel, homeFeatures);
    const expectedAwayPoints = predictCfbV2Score(scoringModel, awayFeatures);

    if (expectedHomePoints === null || expectedAwayPoints === null) {
      projections.push(unavailableProjection(game, population, input.generatedAt, dataAsOfIso));
      continue;
    }
    if (residualPool.length < CFB_V2_MIN_RESIDUAL_POOL_SIZE) {
      projections.push(unavailableProjection(game, population, input.generatedAt, dataAsOfIso));
      continue;
    }

    const rawProjectedMargin = expectedHomePoints - expectedAwayPoints;
    const rawProjectedTotal = expectedHomePoints + expectedAwayPoints;
    const calibrated = applyCfbV2TotalOnlyCalibration(rawProjectedMargin, rawProjectedTotal, calibrationCoefficients);

    const gameSeed = deriveCfbV2GameSeed(CFB_V2_PROBABILITY_CONFIG.seed, game.gameId);
    const random = createCfbV2SeededRandom(gameSeed);
    const bootstrap = runCfbV2EmpiricalBootstrap(calibrated.calibratedHomePoints, calibrated.calibratedAwayPoints, residualPool, random, CFB_V2_PROBABILITY_CONFIG.drawCount);

    projections.push({
      gameId: game.gameId,
      season: game.season,
      week: game.week,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      expectedHomePoints: calibrated.calibratedHomePoints,
      expectedAwayPoints: calibrated.calibratedAwayPoints,
      projectedMargin: rawProjectedMargin,
      projectedTotal: calibrated.calibratedTotal,
      homeWinProbability: bootstrap.homeWinProbability,
      awayWinProbability: bootstrap.awayWinProbability,
      marginInterval50: bootstrap.intervals.margin.p50,
      marginInterval80: bootstrap.intervals.margin.p80,
      marginInterval90: bootstrap.intervals.margin.p90,
      marginInterval95: bootstrap.intervals.margin.p95,
      totalInterval50: bootstrap.intervals.total.p50,
      totalInterval80: bootstrap.intervals.total.p80,
      totalInterval90: bootstrap.intervals.total.p90,
      totalInterval95: bootstrap.intervals.total.p95,
      matchupPopulation: population,
      projectionStatus: "computed",
      modelVersion: CFB_V2_IPR_MODEL_VERSION,
      scoringVersion: CFB_V2_SCORING_VERSION,
      calibrationVersion: CFB_V2_CALIBRATION_VERSION,
      probabilityVersion: CFB_V2_PROBABILITY_VERSION,
      configVersion: CFB_V2_CONFIG_VERSION,
      generatedAt: input.generatedAt,
      dataAsOf: dataAsOfIso,
    });
  }

  return projections;
}
