/**
 * Phase M, item 7/8 -- "fixed-offset" architecture: separates learning the
 * league scoring LEVEL (handled by scoringEnvironment, a fixed additive
 * offset, never fit by the ridge) from learning RELATIVE team strength
 * (handled by a ridge fit on the residual actualTeamPoints -
 * scoringEnvironment, over 5 relative-strength features -- no
 * scoringEnvironment column, no explosive-rate columns per this phase's
 * scope). `prediction = row.scoringEnvironment.value + ridge(features)`.
 *
 * Generic over the feature-extraction function so the same fit/score path
 * serves both:
 *   - item 7 (Model D): raw EWMA EPA/success values (rawResidualFeatures)
 *   - item 8 (Model E): contemporaneous-relative EWMA values
 *     (built by the caller using leagueAverage.ts's point-in-time league
 *     references -- see evaluate-phase-m.ts)
 *
 * Feature order (fixed): [offenseEpaPerPlay, offenseSuccessRate,
 * opponentDefenseEpaAllowed, opponentDefenseSuccessAllowed, homeIndicator]
 */
import { fitRidgeModel, scoreRidgeModel, type FittedRidgeModel } from "@/lib/nfl/props/ridge";
import type { NflTotalResearchDatasetRow } from "./types";

export const RESIDUAL_RIDGE_FEATURE_NAMES = [
  "offenseEpaPerPlay",
  "offenseSuccessRate",
  "opponentDefenseEpaAllowed",
  "opponentDefenseSuccessAllowed",
  "homeIndicator",
] as const;

export type ResidualFeatureFn = (row: NflTotalResearchDatasetRow) => readonly number[] | null;

/** Raw (non-relative) EWMA feature extractor -- item 7's Model D. */
export const rawResidualFeatures: ResidualFeatureFn = (row) => {
  if (row.offense.epaPerPlay === null || row.offense.successRate === null || row.opponentDefenseAllowed.epaPerPlay === null || row.opponentDefenseAllowed.successRate === null) {
    return null;
  }
  return [row.offense.epaPerPlay, row.offense.successRate, row.opponentDefenseAllowed.epaPerPlay, row.opponentDefenseAllowed.successRate, row.homeAway === "home" ? 1 : 0];
};

export function fitResidualRidge(
  trainRows: readonly NflTotalResearchDatasetRow[],
  lambda: number,
  featureFn: ResidualFeatureFn,
): FittedRidgeModel {
  const usable = trainRows.filter((r) => r.scoringEnvironment.value !== null && featureFn(r) !== null);
  if (usable.length === 0) {
    throw new Error("fitResidualRidge: zero usable training rows -- refusing to silently produce NaN.");
  }
  const rawRows = usable.map((r) => [...featureFn(r)!]);
  const targets = usable.map((r) => r.actualTeamPoints - r.scoringEnvironment.value!);
  return fitRidgeModel(rawRows, targets, lambda);
}

export function scoreResidualRidge(model: FittedRidgeModel, row: NflTotalResearchDatasetRow, featureFn: ResidualFeatureFn): number | null {
  if (row.scoringEnvironment.value === null) return null;
  const features = featureFn(row);
  if (features === null) return null;
  return row.scoringEnvironment.value + scoreRidgeModel(model, features);
}
