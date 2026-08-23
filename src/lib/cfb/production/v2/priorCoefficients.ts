// CFB Model V2 — frozen preseason-prior regression coefficients (Phase 3
// §7-9, WU2 §7). Trained ONCE, offline, on research's own historical
// derived/normalized data (2019-2025, 921 training rows) using the exact
// validated Phase 3 method: research/phase3/priorRegression.ts's
// fitPriorModel(trainingRows, "PRIOR_D", PRIOR_RIDGE_LAMBDA=3), with
// training rows built the same way research/phase3/buildPriorsForSeasons.ts
// builds them for a 2026 test season (training on seasons strictly before
// 2026, i.e. 2019-2025 — no leakage).
//
// This is a ONE-TIME, offline coefficient freeze — production never fits
// this regression at runtime (WU2 §7: "Production must NOT fit a
// historical hyperparameter search during weekly refresh"). The values
// below are plain literals, copied by hand from that one-time run's
// output, exactly like WU1 froze the Phase 9 config. Retraining requires a
// new CFB_V2_PRIOR_COEFFICIENTS_VERSION and is a research-owned decision.

export const CFB_V2_PRIOR_COEFFICIENTS_VERSION = "cfb-v2-prior-coefficients-2019-2025-lambda3" as const;

export type CfbV2PriorFeatureKey = "prevOffense" | "prevDefense" | "returningProductionOffense" | "talent";

export type CfbV2FittedTierModel = {
  standardizers: Partial<Record<CfbV2PriorFeatureKey, { mean: number; std: number }>>;
  /** [intercept, ...coefficients in `features` order]. */
  coefficients: readonly number[];
  features: readonly CfbV2PriorFeatureKey[];
};

/**
 * Offense tiers PRIOR_D → PRIOR_C → PRIOR_A (downward-only fallback chain,
 * WU1 §6/config.ts's `fallbackHierarchy.offense`). PRIOR_B is never fit —
 * PRIOR_D's own chain skips it (research/phase3/priorRegression.ts's
 * FALLBACK_CHAIN), so it is never a reachable tier for this feature set.
 */
export const CFB_V2_PRIOR_OFFENSE_TIERS: Record<"PRIOR_D" | "PRIOR_C" | "PRIOR_A", CfbV2FittedTierModel> = Object.freeze({
  PRIOR_D: Object.freeze({
    standardizers: Object.freeze({
      prevOffense: Object.freeze({ mean: 0.005789642901260218, std: 0.9699250533318132 }),
      returningProductionOffense: Object.freeze({ mean: 0.542798901098901, std: 0.2685064760692005 }),
      talent: Object.freeze({ mean: 594.1267252747249, std: 188.50444420225602 }),
    }),
    coefficients: Object.freeze([0.009991923440293555, 0.393973142508393, 0.13050341719572767, 0.32915726442434423]),
    features: Object.freeze(["prevOffense", "returningProductionOffense", "talent"]),
  }),
  PRIOR_C: Object.freeze({
    standardizers: Object.freeze({
      prevOffense: Object.freeze({ mean: 0.005789642901260218, std: 0.9699250533318132 }),
      talent: Object.freeze({ mean: 594.1267252747249, std: 188.50444420225602 }),
    }),
    coefficients: Object.freeze([0.009991923440293595, 0.40217578799182035, 0.3215814302834096]),
    features: Object.freeze(["prevOffense", "talent"]),
  }),
  PRIOR_A: Object.freeze({
    standardizers: Object.freeze({
      prevOffense: Object.freeze({ mean: 0.004813283524590699, std: 0.9705944090656395 }),
    }),
    coefficients: Object.freeze([0.010021761600657883, 0.5877445638205042]),
    features: Object.freeze(["prevOffense"]),
  }),
});

/**
 * Defense tiers. PRIOR_D and PRIOR_C are numerically identical here because
 * CFBD has no defensive returning-production analog — Prior D/B collapse
 * to Prior C/A on the defense side (research/phase3/priorRegression.ts's
 * DEFENSE_FEATURE_SETS comment). This identity is intentional, not a copy
 * error — see priorModel.test.ts.
 */
export const CFB_V2_PRIOR_DEFENSE_TIERS: Record<"PRIOR_D" | "PRIOR_C" | "PRIOR_A", CfbV2FittedTierModel> = Object.freeze({
  PRIOR_D: Object.freeze({
    standardizers: Object.freeze({
      prevDefense: Object.freeze({ mean: 0.004558867452628377, std: 0.9729402398438171 }),
      talent: Object.freeze({ mean: 594.1267252747249, std: 188.50444420225602 }),
    }),
    coefficients: Object.freeze([0.009595791874027343, 0.4738885530566912, 0.27584888576536026]),
    features: Object.freeze(["prevDefense", "talent"]),
  }),
  PRIOR_C: Object.freeze({
    standardizers: Object.freeze({
      prevDefense: Object.freeze({ mean: 0.004558867452628377, std: 0.9729402398438171 }),
      talent: Object.freeze({ mean: 594.1267252747249, std: 188.50444420225602 }),
    }),
    coefficients: Object.freeze([0.009595791874027343, 0.4738885530566912, 0.27584888576536026]),
    features: Object.freeze(["prevDefense", "talent"]),
  }),
  PRIOR_A: Object.freeze({
    standardizers: Object.freeze({
      prevDefense: Object.freeze({ mean: 0.004229675152679737, std: 0.9720118765245053 }),
    }),
    coefficients: Object.freeze([0.007137326244459873, 0.6240913983401076]),
    features: Object.freeze(["prevDefense"]),
  }),
});

/**
 * League-mean fallback (LEAGUE_MEAN tier). Both are ~0 (targets are
 * globally standardized, so the training-set mean is 0 up to float noise —
 * frozen here as the exact mathematical value, not the ~1e-16 float
 * residual from the one-time fit).
 */
export const CFB_V2_PRIOR_LEAGUE_MEAN_OFFENSE = 0;
export const CFB_V2_PRIOR_LEAGUE_MEAN_DEFENSE = 0;
