import { solveLinearSystem } from "../phase2/linearSolver";
import { fitStandardizer, applyStandardizer, type Standardizer } from "../phase2/standardize";
import type { CfbPriorFeatureSet, PreseasonRawInputs, PriorRatings } from "./types";

export type PriorTrainingRow = {
  teamExternalId: string;
  prevOffense: number | null;
  prevDefense: number | null;
  returningProductionOffense: number | null;
  talent: number | null;
  targetOffense: number;
  targetDefense: number;
};

type FeatureKey = "prevOffense" | "prevDefense" | "returningProductionOffense" | "talent";

/**
 * Prior A/B/C/D feature sets (Section 4). Defense has no returning-
 * production analog in CFBD's data (see loadPreseasonInputs.ts doc), so
 * Prior B/D collapse to Prior A/C for the defense-side regression — this
 * is documented, not silently hidden (see fitPriorModel's `defenseTierNote`).
 */
const OFFENSE_FEATURE_SETS: Record<CfbPriorFeatureSet, FeatureKey[]> = {
  PRIOR_A: ["prevOffense"],
  PRIOR_B: ["prevOffense", "returningProductionOffense"],
  PRIOR_C: ["prevOffense", "talent"],
  PRIOR_D: ["prevOffense", "returningProductionOffense", "talent"],
};
const DEFENSE_FEATURE_SETS: Record<CfbPriorFeatureSet, FeatureKey[]> = {
  PRIOR_A: ["prevDefense"],
  PRIOR_B: ["prevDefense"], // no defensive returning-production signal available
  PRIOR_C: ["prevDefense", "talent"],
  PRIOR_D: ["prevDefense", "talent"],
};

/**
 * Section 9 fallback hierarchy — downward ONLY from whichever tier the
 * caller actually requested (fitPriorModel's `requestedSet`), richest
 * first. This is deliberately bounded: requesting PRIOR_A must never
 * silently upgrade to PRIOR_D just because a team happens to have talent
 * data too — that would make the Prior A/B/C/D comparison (Section 4)
 * meaningless, since every request would resolve to the same richest-
 * available tier regardless of what was asked for. Missing-data fallback
 * (Section 9) still applies *within* the requested tier's own downward
 * chain, all the way to LEAGUE_MEAN.
 */
const FALLBACK_CHAIN: Record<CfbPriorFeatureSet, CfbPriorFeatureSet[]> = {
  PRIOR_D: ["PRIOR_D", "PRIOR_C", "PRIOR_A"],
  PRIOR_C: ["PRIOR_C", "PRIOR_A"],
  PRIOR_B: ["PRIOR_B", "PRIOR_A"],
  PRIOR_A: ["PRIOR_A"],
};

export type FittedTierModel = {
  standardizers: Partial<Record<FeatureKey, Standardizer>>;
  coefficients: number[]; // [intercept, ...features in order]
  features: FeatureKey[];
  leagueMean: number;
};

function fitRidgeTier(
  rows: readonly PriorTrainingRow[],
  features: FeatureKey[],
  target: "targetOffense" | "targetDefense",
  lambda: number,
): FittedTierModel | null {
  const usable = rows.filter((row) => features.every((f) => row[f] !== null));
  const leagueMean = rows.length === 0 ? 0 : rows.reduce((s, r) => s + r[target], 0) / rows.length;
  if (usable.length < features.length + 2) return null; // not enough rows to fit safely

  const standardizers: Partial<Record<FeatureKey, Standardizer>> = {};
  for (const f of features) standardizers[f] = fitStandardizer(usable.map((r) => r[f] as number));

  const nParams = features.length + 1;
  const ata = Array.from({ length: nParams }, () => new Array(nParams).fill(0));
  const atb = new Array(nParams).fill(0);
  for (const row of usable) {
    const x = [1, ...features.map((f) => applyStandardizer(row[f] as number, standardizers[f]!))];
    const y = row[target];
    for (let i = 0; i < nParams; i += 1) {
      atb[i] += x[i] * y;
      for (let j = 0; j < nParams; j += 1) ata[i][j] += x[i] * x[j];
    }
  }
  for (let i = 1; i < nParams; i += 1) ata[i][i] += lambda; // no penalty on intercept
  const coefficients = solveLinearSystem(ata, atb);
  return { standardizers, coefficients, features, leagueMean };
}

function predictTier(model: FittedTierModel, features: Record<FeatureKey, number | null>): number {
  let value = model.coefficients[0];
  model.features.forEach((f, i) => {
    const raw = features[f];
    if (raw === null) return; // caller must only invoke with all-required-features present
    value += model.coefficients[i + 1] * applyStandardizer(raw, model.standardizers[f]!);
  });
  return value;
}

export type FittedPriorModel = {
  requestedSet: CfbPriorFeatureSet;
  offenseTiers: Partial<Record<CfbPriorFeatureSet, FittedTierModel>>;
  defenseTiers: Partial<Record<CfbPriorFeatureSet, FittedTierModel>>;
  leagueMeanOffense: number;
  leagueMeanDefense: number;
};

/** Fits ridge tier models for `requestedSet` plus its downward-only fallback chain (never richer than requested). */
export function fitPriorModel(
  trainingRows: readonly PriorTrainingRow[],
  requestedSet: CfbPriorFeatureSet,
  lambda: number,
): FittedPriorModel {
  const chain = FALLBACK_CHAIN[requestedSet];
  const offenseTiers: Partial<Record<CfbPriorFeatureSet, FittedTierModel>> = {};
  const defenseTiers: Partial<Record<CfbPriorFeatureSet, FittedTierModel>> = {};
  for (const tier of chain) {
    const off = fitRidgeTier(trainingRows, OFFENSE_FEATURE_SETS[tier], "targetOffense", lambda);
    if (off) offenseTiers[tier] = off;
    const def = fitRidgeTier(trainingRows, DEFENSE_FEATURE_SETS[tier], "targetDefense", lambda);
    if (def) defenseTiers[tier] = def;
  }
  const leagueMeanOffense =
    trainingRows.length === 0 ? 0 : trainingRows.reduce((s, r) => s + r.targetOffense, 0) / trainingRows.length;
  const leagueMeanDefense =
    trainingRows.length === 0 ? 0 : trainingRows.reduce((s, r) => s + r.targetDefense, 0) / trainingRows.length;
  return { requestedSet, offenseTiers, defenseTiers, leagueMeanOffense, leagueMeanDefense };
}

/**
 * Applies the fallback hierarchy (Section 9) bounded by what was actually
 * requested (model.requestedSet's own FALLBACK_CHAIN) — e.g. requesting
 * PRIOR_A never opportunistically upgrades to PRIOR_D for a team that
 * happens to also have talent data; it only ever falls DOWN to a simpler
 * tier (missing-data handling) or LEAGUE_MEAN. Never imputes a missing
 * feature as zero — only ever changes which (complete) tier is used.
 */
export function predictPriorRatings(model: FittedPriorModel, input: PreseasonRawInputs): PriorRatings {
  // Normalizes PreseasonRawInputs' field names (prevSeasonOffense/
  // prevSeasonDefense) to the FeatureKey names used by fitted tier models
  // (prevOffense/prevDefense) — these differ intentionally between the two
  // types (PreseasonRawInputs is the public preseason-input shape;
  // PriorTrainingRow/FeatureKey are internal regression plumbing).
  const features: Record<FeatureKey, number | null> = {
    prevOffense: input.prevSeasonOffense,
    prevDefense: input.prevSeasonDefense,
    returningProductionOffense: input.returningProductionOffense,
    talent: input.talent,
  };

  function resolve(
    tiers: Partial<Record<CfbPriorFeatureSet, FittedTierModel>>,
    featureSets: Record<CfbPriorFeatureSet, FeatureKey[]>,
    leagueMean: number,
  ): { value: number; tier: string } {
    for (const tier of FALLBACK_CHAIN[model.requestedSet]) {
      const model2 = tiers[tier];
      if (!model2) continue;
      const required = featureSets[tier];
      const hasAll = required.every((f) => features[f] !== null);
      if (!hasAll) continue;
      return { value: predictTier(model2, features), tier };
    }
    return { value: leagueMean, tier: "LEAGUE_MEAN" };
  }

  const offense = resolve(model.offenseTiers, OFFENSE_FEATURE_SETS, model.leagueMeanOffense);
  const defense = resolve(model.defenseTiers, DEFENSE_FEATURE_SETS, model.leagueMeanDefense);

  return {
    teamExternalId: input.teamExternalId,
    priorOffense: offense.value,
    priorDefense: defense.value,
    offenseTier: offense.tier,
    defenseTier: defense.tier,
  };
}
