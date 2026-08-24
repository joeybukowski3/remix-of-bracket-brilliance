// CFB Model V2 — WU5 §10/§11 current-season calibration-row append.
// Reconstructs a RAW (pre-calibration) projected total for each eligible
// completed FBS-vs-FBS game, paired with its actual final total, so the
// orchestrator can append real current-season signal to
// fitCfbV2TotalCalibration's training pool (buildGameProjections.ts's
// `currentSeasonCalibrationRows` hook). Zero research runtime dependency.
//
// DOCUMENTED LIMITATION (not silently absorbed): this reuses the single
// as-of-cutoff rating/SUCCESS state for every eligible game, rather than
// each game's own strictly-prior walk-forward state the way Phase 9's
// validated research methodology does — a game from week N-1 may itself
// have contributed to the SUCCESS averages used to "predict" it here, a
// small amount of circularity. Building a fully walk-forward-safe version
// would mean re-deriving ratings/SUCCESS per game (new rating
// architecture), explicitly out of WU5's scope. The residual bootstrap
// pool (buildCfbV2ResidualPool) does NOT consume these rows — only
// fitCfbV2TotalCalibration's coefficient fit does — so this limitation
// cannot affect probability/interval correctness, only a minor
// calibration-coefficient refinement.

import { CFB_V2_SCORING_CONFIG } from "./config";
import { predictCfbV2Score, selectCfbV2ScoringSnapshot, solveCfbV2ScoringModel, type CfbV2ScoringFeatureVector } from "./scoringModel";
import type { CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";
import type { CfbV2TeamRating } from "./types";

export type CfbV2CompletedGameForCalibration = {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homePoints: number;
  awayPoints: number;
};

export type CfbV2CurrentSeasonCalibrationRow = { rawTotal: number; actualTotal: number; season: number; week: number };

export function buildCfbV2CurrentSeasonCalibrationRows(input: {
  games: readonly CfbV2CompletedGameForCalibration[];
  teamRatingsByTeamId: ReadonlyMap<string, CfbV2TeamRating>;
  scoringArtifact: CfbV2ScoringNormalEquationsArtifact;
  successByTeam: ReadonlyMap<string, number>;
  scoringEnvironmentEstimate: number | null;
  dataAsOf: { season: number; week: number };
}): CfbV2CurrentSeasonCalibrationRow[] {
  if (input.scoringEnvironmentEstimate === null) return [];
  const snapshot = selectCfbV2ScoringSnapshot(input.scoringArtifact, input.dataAsOf.season, input.dataAsOf.week);
  const scoringModel = solveCfbV2ScoringModel(snapshot, CFB_V2_SCORING_CONFIG.scoringRidgeLambda);

  const rows: CfbV2CurrentSeasonCalibrationRow[] = [];
  for (const game of input.games) {
    const homeRating = input.teamRatingsByTeamId.get(game.homeTeamId);
    const awayRating = input.teamRatingsByTeamId.get(game.awayTeamId);
    if (!homeRating || !awayRating) continue;
    const homeSuccess = input.successByTeam.get(game.homeTeamId) ?? null;
    const awayOppSuccess = input.successByTeam.get(game.awayTeamId) ?? null;
    const awaySuccess = input.successByTeam.get(game.awayTeamId) ?? null;
    const homeOppSuccess = input.successByTeam.get(game.homeTeamId) ?? null;
    if (homeSuccess === null || awayOppSuccess === null || awaySuccess === null || homeOppSuccess === null) continue;

    const homeFeatures: CfbV2ScoringFeatureVector = {
      offenseRating: homeRating.offenseRating,
      opponentDefenseRating: awayRating.defenseRating,
      hfa: 1,
      scoringEnvironmentEstimate: input.scoringEnvironmentEstimate,
      successOwn: homeSuccess,
      successOpponentAllowed: awayOppSuccess,
    };
    const awayFeatures: CfbV2ScoringFeatureVector = {
      offenseRating: awayRating.offenseRating,
      opponentDefenseRating: homeRating.defenseRating,
      hfa: -1,
      scoringEnvironmentEstimate: input.scoringEnvironmentEstimate,
      successOwn: awaySuccess,
      successOpponentAllowed: homeOppSuccess,
    };
    const expectedHomePoints = predictCfbV2Score(scoringModel, homeFeatures);
    const expectedAwayPoints = predictCfbV2Score(scoringModel, awayFeatures);
    if (expectedHomePoints === null || expectedAwayPoints === null) continue;

    rows.push({
      rawTotal: expectedHomePoints + expectedAwayPoints,
      actualTotal: game.homePoints + game.awayPoints,
      season: game.season,
      week: game.week,
    });
  }
  return rows;
}
