/**
 * Phase E -- market-free per-team scoring ridge, modeled conceptually after
 * the production CFB v2 total architecture (src/lib/cfb/production/v2/,
 * src/lib/cfb/research/phase4/scoringRegression.ts): a ridge regression
 * predicting one team's points from a scoring-environment baseline plus
 * that team's own offense composite and its opponent's defense-allowed
 * composite, standardized on TRAIN-FOLD statistics only.
 *
 * Reuses src/lib/nfl/props/ridge.ts's closed-form ridge solver verbatim
 * (fitRidgeModel/scoreRidgeModel) rather than re-implementing linear
 * algebra -- the same helper WU4A/passing/rushing ridge fits already use.
 *
 * Feature vector (order fixed, matches the Phase E spec exactly):
 *   [scoringEnvironment, offenseEPA, offenseSuccess, offenseExplosive,
 *    opponentDefenseEPAAllowed, opponentDefenseSuccessAllowed,
 *    opponentDefenseExplosiveAllowed, homeIndicator]
 *
 * Rows with any null input are excluded from both fitting and scoring --
 * never zero-imputed (matches baselines.ts and the master spec's "Missing
 * values MUST NOT be silently converted to zero" principle).
 */
import { fitRidgeModel, scoreRidgeModel, type FittedRidgeModel } from "@/lib/nfl/props/ridge";
import type { NflTotalResearchDatasetRow } from "./types";

export const RIDGE_FEATURE_NAMES = [
  "scoringEnvironment",
  "offenseEpaPerPlay",
  "offenseSuccessRate",
  "offenseExplosiveRate",
  "opponentDefenseEpaAllowed",
  "opponentDefenseSuccessAllowed",
  "opponentDefenseExplosiveAllowed",
  "homeIndicator",
] as const;

export function isRowUsableForRidge(row: NflTotalResearchDatasetRow): boolean {
  return (
    row.scoringEnvironment.value !== null &&
    row.offense.epaPerPlay !== null &&
    row.offense.successRate !== null &&
    row.offense.explosiveRate !== null &&
    row.opponentDefenseAllowed.epaPerPlay !== null &&
    row.opponentDefenseAllowed.successRate !== null &&
    row.opponentDefenseAllowed.explosiveRate !== null
  );
}

export function rowToFeatureVector(row: NflTotalResearchDatasetRow): readonly number[] {
  return [
    row.scoringEnvironment.value!,
    row.offense.epaPerPlay!,
    row.offense.successRate!,
    row.offense.explosiveRate!,
    row.opponentDefenseAllowed.epaPerPlay!,
    row.opponentDefenseAllowed.successRate!,
    row.opponentDefenseAllowed.explosiveRate!,
    row.homeAway === "home" ? 1 : 0,
  ];
}

export function fitTotalRidge(trainRows: readonly NflTotalResearchDatasetRow[], lambda: number): FittedRidgeModel {
  const usable = trainRows.filter(isRowUsableForRidge);
  if (usable.length === 0) {
    throw new Error("fitTotalRidge: zero usable training rows (every row had a null/insufficient feature) -- cannot fit, refusing to silently produce NaN.");
  }
  const rawRows = usable.map(rowToFeatureVector) as number[][];
  const targets = usable.map((r) => r.actualTeamPoints);
  return fitRidgeModel(rawRows, targets, lambda);
}

export function scoreTotalRidge(model: FittedRidgeModel, row: NflTotalResearchDatasetRow): number | null {
  if (!isRowUsableForRidge(row)) return null;
  return scoreRidgeModel(model, rowToFeatureVector(row));
}
