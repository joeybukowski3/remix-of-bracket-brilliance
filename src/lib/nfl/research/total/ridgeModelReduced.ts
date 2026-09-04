/**
 * Phase J, Model D -- simplified ridge: same discipline as ridgeModel.ts
 * (train-fold-only standardization, null-safe row filtering, reuses
 * src/lib/nfl/props/ridge.ts's closed-form solver) but drops BOTH
 * explosive-rate terms (offense and opponent-defense-allowed) to test
 * whether they contribute real independent out-of-sample signal or were
 * just adding coefficient instability (see Phase F/G findings:
 * offenseExplosiveRate and opponentDefenseExplosiveAllowed were the two
 * features with unstable/sign-flipping coefficients across folds).
 *
 * Feature vector (6 features, fixed order):
 *   [scoringEnvironment, offenseEpaPerPlay, offenseSuccessRate,
 *    opponentDefenseEpaAllowed, opponentDefenseSuccessAllowed, homeIndicator]
 */
import { fitRidgeModel, scoreRidgeModel, type FittedRidgeModel } from "@/lib/nfl/props/ridge";
import type { NflTotalResearchDatasetRow } from "./types";

export const REDUCED_RIDGE_FEATURE_NAMES = [
  "scoringEnvironment",
  "offenseEpaPerPlay",
  "offenseSuccessRate",
  "opponentDefenseEpaAllowed",
  "opponentDefenseSuccessAllowed",
  "homeIndicator",
] as const;

export function isRowUsableForReducedRidge(row: NflTotalResearchDatasetRow): boolean {
  return (
    row.scoringEnvironment.value !== null &&
    row.offense.epaPerPlay !== null &&
    row.offense.successRate !== null &&
    row.opponentDefenseAllowed.epaPerPlay !== null &&
    row.opponentDefenseAllowed.successRate !== null
  );
}

export function reducedRowToFeatureVector(row: NflTotalResearchDatasetRow): readonly number[] {
  return [
    row.scoringEnvironment.value!,
    row.offense.epaPerPlay!,
    row.offense.successRate!,
    row.opponentDefenseAllowed.epaPerPlay!,
    row.opponentDefenseAllowed.successRate!,
    row.homeAway === "home" ? 1 : 0,
  ];
}

export function fitReducedTotalRidge(trainRows: readonly NflTotalResearchDatasetRow[], lambda: number): FittedRidgeModel {
  const usable = trainRows.filter(isRowUsableForReducedRidge);
  if (usable.length === 0) {
    throw new Error("fitReducedTotalRidge: zero usable training rows -- refusing to silently produce NaN.");
  }
  const rawRows = usable.map(reducedRowToFeatureVector) as number[][];
  const targets = usable.map((r) => r.actualTeamPoints);
  return fitRidgeModel(rawRows, targets, lambda);
}

export function scoreReducedTotalRidge(model: FittedRidgeModel, row: NflTotalResearchDatasetRow): number | null {
  if (!isRowUsableForReducedRidge(row)) return null;
  return scoreRidgeModel(model, reducedRowToFeatureVector(row));
}
