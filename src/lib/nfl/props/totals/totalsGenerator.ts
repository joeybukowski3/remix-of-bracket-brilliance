/**
 * NFL projected game total -- v1 production prediction generator.
 *
 * Pure composition: given a fitted model and the home/away feature rows
 * for one game, produces the full prediction output contract (Phase T).
 * `projectedGameTotal` is computed as the exact, unrounded sum of the two
 * unrounded expected-points values -- no intermediate rounding. Rounding
 * for display is strictly a downstream/presentation concern and must
 * happen outside this module.
 */
import { NFL_TOTAL_MODEL_VERSION, NFL_TOTAL_TRAINING_SEASONS, type NflTotalHistoryStatus } from "./totalsModelContract";
import { scoreNflTotalModel, type NflTotalFittedModel } from "./totalsModel";
import type { NflTotalSideFeatures } from "./totalsFeatures";

export type NflTotalMatchupInput = {
  season: number;
  week: number;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeFeatures: NflTotalSideFeatures;
  awayFeatures: NflTotalSideFeatures;
};

export type NflTotalPrediction = {
  season: number;
  week: number;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeExpectedPoints: number | null;
  awayExpectedPoints: number | null;
  /** Exact unrounded homeExpectedPoints + awayExpectedPoints; null if either side is unresolved. */
  projectedGameTotal: number | null;
  modelVersion: typeof NFL_TOTAL_MODEL_VERSION;
  generatedAt: string;
  trainingCutoff: { seasons: readonly number[] };
  homeHistoryGames: { offense: number; defense: number };
  awayHistoryGames: { offense: number; defense: number };
  homeEffectiveSampleSize: { offense: number; defense: number };
  awayEffectiveSampleSize: { offense: number; defense: number };
  homeHistoryStatus: NflTotalHistoryStatus;
  awayHistoryStatus: NflTotalHistoryStatus;
  status: "projected" | "eligible_insufficient_history";
};

export function generateNflTotalPrediction(model: NflTotalFittedModel, input: NflTotalMatchupInput, generatedAt: string): NflTotalPrediction {
  const homeExpectedPoints = scoreNflTotalModel(model, input.homeFeatures);
  const awayExpectedPoints = scoreNflTotalModel(model, input.awayFeatures);
  const projectedGameTotal = homeExpectedPoints !== null && awayExpectedPoints !== null ? homeExpectedPoints + awayExpectedPoints : null;

  return {
    season: input.season,
    week: input.week,
    gameId: input.gameId,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    homeExpectedPoints,
    awayExpectedPoints,
    projectedGameTotal,
    modelVersion: NFL_TOTAL_MODEL_VERSION,
    generatedAt,
    trainingCutoff: { seasons: NFL_TOTAL_TRAINING_SEASONS },
    homeHistoryGames: { offense: input.homeFeatures.offenseGamesUsed, defense: input.homeFeatures.defenseGamesUsed },
    awayHistoryGames: { offense: input.awayFeatures.offenseGamesUsed, defense: input.awayFeatures.defenseGamesUsed },
    homeEffectiveSampleSize: { offense: input.homeFeatures.offenseEffectiveSampleSize, defense: input.homeFeatures.defenseEffectiveSampleSize },
    awayEffectiveSampleSize: { offense: input.awayFeatures.offenseEffectiveSampleSize, defense: input.awayFeatures.defenseEffectiveSampleSize },
    homeHistoryStatus: input.homeFeatures.historyStatus,
    awayHistoryStatus: input.awayFeatures.historyStatus,
    status: projectedGameTotal === null ? "eligible_insufficient_history" : "projected",
  };
}
