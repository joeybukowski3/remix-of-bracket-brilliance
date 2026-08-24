import { computePrevSeasonRatings, loadPreseasonRawInputs } from "./loadPreseasonInputs";
import { fitPriorModel, predictPriorRatings, type PriorTrainingRow } from "./priorRegression";
import type { CfbPriorFeatureSet, PriorRatings } from "./types";

/**
 * Builds one prior-ratings map per test season, training the prior
 * regression ONLY on seasons strictly before that test season (Section 8/13
 * leakage discipline). Training rows use season T's own preseason inputs
 * (T-1 rating + T's returning/talent) as features and T's own final
 * full-season rating as the regression target — both entirely determined
 * by information at or before the end of season T, i.e. always strictly
 * before any season >= T+1's kickoff.
 */
export function buildPriorsForSeasons(
  testSeasons: readonly number[],
  featureSet: CfbPriorFeatureSet,
  lambda: number,
): Map<number, Map<string, PriorRatings>> {
  const result = new Map<number, Map<string, PriorRatings>>();
  const targetCache = new Map<number, Map<string, { offense: number; defense: number }>>();

  function targetRatingsFor(season: number): Map<string, { offense: number; defense: number }> {
    if (!targetCache.has(season)) targetCache.set(season, computePrevSeasonRatings(season));
    return targetCache.get(season)!;
  }

  for (const testSeason of testSeasons) {
    const trainingSeasons: number[] = [];
    for (let t = 2019; t < testSeason; t += 1) trainingSeasons.push(t);

    const trainingRows: PriorTrainingRow[] = [];
    for (const t of trainingSeasons) {
      const inputs = loadPreseasonRawInputs(t);
      const targets = targetRatingsFor(t);
      for (const row of inputs) {
        const target = targets.get(row.teamExternalId);
        if (!target) continue;
        trainingRows.push({
          teamExternalId: row.teamExternalId,
          prevOffense: row.prevSeasonOffense,
          prevDefense: row.prevSeasonDefense,
          returningProductionOffense: row.returningProductionOffense,
          talent: row.talent,
          targetOffense: target.offense,
          targetDefense: target.defense,
        });
      }
    }

    if (trainingRows.length === 0) continue; // no trainable prior for this season (e.g. 2019) — caller must skip it

    const model = fitPriorModel(trainingRows, featureSet, lambda);
    const testInputs = loadPreseasonRawInputs(testSeason);
    const seasonPriors = new Map<string, PriorRatings>();
    for (const input of testInputs) seasonPriors.set(input.teamExternalId, predictPriorRatings(model, input));
    result.set(testSeason, seasonPriors);
  }

  return result;
}
