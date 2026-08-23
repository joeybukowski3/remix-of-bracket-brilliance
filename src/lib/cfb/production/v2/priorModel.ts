// CFB Model V2 — preseason prior application (Phase 3 §9, WU2 §6). Applies
// the frozen coefficients (priorCoefficients.ts) plus WU1's fallback
// hierarchy (config.ts's CFB_V2_RATING_CONFIG.preseasonPrior.fallbackHierarchy).
// Pure evaluation only — no fitting at runtime.

import {
  CFB_V2_PRIOR_DEFENSE_TIERS,
  CFB_V2_PRIOR_LEAGUE_MEAN_DEFENSE,
  CFB_V2_PRIOR_LEAGUE_MEAN_OFFENSE,
  CFB_V2_PRIOR_OFFENSE_TIERS,
  type CfbV2FittedTierModel,
  type CfbV2PriorFeatureKey,
} from "./priorCoefficients";
import { applyStandardizer } from "./standardize";
import { CFB_V2_RATING_CONFIG, type CfbV2PriorTier } from "./config";

export type CfbV2PriorRawInputs = {
  teamId: string;
  prevSeasonOffense: number | null;
  prevSeasonDefense: number | null;
  returningProductionOffense: number | null;
  talent: number | null;
};

export type CfbV2PriorRatings = {
  teamId: string;
  priorOffense: number;
  priorDefense: number;
  /** Combined tier — the more-fallback-degraded of the offense/defense tiers actually resolved (see priorModel.test.ts). */
  priorTier: CfbV2PriorTier;
  offenseTier: CfbV2PriorTier;
  defenseTier: CfbV2PriorTier;
};

const TIER_RANK: Record<CfbV2PriorTier, number> = { PRIOR_D: 3, PRIOR_C: 2, PRIOR_A: 1, LEAGUE_MEAN: 0 };

function predictTier(model: CfbV2FittedTierModel, features: Record<CfbV2PriorFeatureKey, number | null>): number {
  let value = model.coefficients[0];
  model.features.forEach((f, i) => {
    const raw = features[f];
    if (raw === null) return;
    value += model.coefficients[i + 1] * applyStandardizer(raw, model.standardizers[f]!);
  });
  return value;
}

function resolveTier(
  tiers: Record<"PRIOR_D" | "PRIOR_C" | "PRIOR_A", CfbV2FittedTierModel>,
  chain: readonly CfbV2PriorTier[],
  features: Record<CfbV2PriorFeatureKey, number | null>,
  leagueMean: number,
): { value: number; tier: CfbV2PriorTier } {
  for (const tier of chain) {
    if (tier === "LEAGUE_MEAN") continue;
    const model = tiers[tier];
    const hasAll = model.features.every((f) => features[f] !== null);
    if (!hasAll) continue;
    return { value: predictTier(model, features), tier };
  }
  return { value: leagueMean, tier: "LEAGUE_MEAN" };
}

/**
 * Applies the frozen PRIOR_D regression + downward-only fallback hierarchy
 * (Phase 3 §9). Never imputes a missing feature as zero — only ever
 * changes which (complete) tier is used, all the way down to LEAGUE_MEAN.
 */
export function applyCfbV2PriorModel(input: CfbV2PriorRawInputs): CfbV2PriorRatings {
  const features: Record<CfbV2PriorFeatureKey, number | null> = {
    prevOffense: input.prevSeasonOffense,
    prevDefense: input.prevSeasonDefense,
    returningProductionOffense: input.returningProductionOffense,
    talent: input.talent,
  };

  const { offense: offenseChain, defense: defenseChain } = CFB_V2_RATING_CONFIG.preseasonPrior.fallbackHierarchy;
  const offense = resolveTier(CFB_V2_PRIOR_OFFENSE_TIERS, offenseChain, features, CFB_V2_PRIOR_LEAGUE_MEAN_OFFENSE);
  const defense = resolveTier(CFB_V2_PRIOR_DEFENSE_TIERS, defenseChain, features, CFB_V2_PRIOR_LEAGUE_MEAN_DEFENSE);

  const priorTier = TIER_RANK[offense.tier] <= TIER_RANK[defense.tier] ? offense.tier : defense.tier;

  return {
    teamId: input.teamId,
    priorOffense: offense.value,
    priorDefense: defense.value,
    priorTier,
    offenseTier: offense.tier,
    defenseTier: defense.tier,
  };
}
