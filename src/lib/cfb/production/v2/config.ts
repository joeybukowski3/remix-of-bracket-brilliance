// CFB Model V2 — frozen production configuration (Phase 10 §3-§8, WU1).
//
// Every value below is a plain literal, copied by hand from the validated
// Phase 8/9 research config (src/lib/cfb/research/phase8/config.ts,
// src/lib/cfb/research/phase9/config.ts, src/lib/cfb/research/phase9/pipeline.ts,
// src/lib/cfb/research/phase3/config.ts, src/lib/cfb/research/phase4/config.ts).
// This module has ZERO runtime import from src/lib/cfb/research/** — parity
// is enforced by config.test.ts, which imports research's own
// buildProductionCandidateConfigSnapshot() as a TEST-ONLY comparison, never
// from production code. See architectureGuard.test.ts.
//
// Do not retune any value here. A parameter change requires a new minor
// version (versions.ts) and is a research-owned decision, not a production
// edit.

import { computeCfbV2ConfigHash } from "./versions";

function deepFreeze<T>(value: T): Readonly<T> {
  Object.freeze(value);
  if (value && typeof value === "object") {
    for (const key of Object.getOwnPropertyNames(value)) {
      const child = (value as Record<string, unknown>)[key];
      if (child && typeof child === "object" && !Object.isFrozen(child)) {
        deepFreeze(child);
      }
    }
  }
  return value;
}

// ---------------------------------------------------------------------------
// §4/§5 — Connectivity config (COMPONENT_SIZE policy, Phase 8 finalist).
// ---------------------------------------------------------------------------

export type CfbV2ConnectivityPolicy = "COMPONENT_SIZE";

export type CfbV2ConnectivityConfig = {
  policy: CfbV2ConnectivityPolicy;
  /** Base Ridge lambda before the per-team connectivity multiplier is applied. */
  baseLambda: number;
  /** Component-size constant below which the multiplier ramps up (Phase 8 COMPONENT_SIZE_K). */
  componentSizeK: number;
  /** Safety cap — multiplier never exceeds this (Phase 8 MAX_CONNECTIVITY_MULTIPLIER). */
  maxPenaltyMultiplier: number;
  /** Exact formula, copied verbatim from the Phase 9 production-candidate snapshot. */
  multiplierFormula: string;
};

export const CFB_V2_CONNECTIVITY_CONFIG: CfbV2ConnectivityConfig = deepFreeze({
  policy: "COMPONENT_SIZE",
  baseLambda: 10,
  componentSizeK: 20,
  maxPenaltyMultiplier: 3,
  multiplierFormula: "baseLambda * clamp(componentSizeK / max(componentSize, 1), 1, maxPenaltyMultiplier)",
});

// ---------------------------------------------------------------------------
// §4 — Frozen rating (IPR foundation) config.
// ---------------------------------------------------------------------------

export type CfbV2PriorTier = "PRIOR_D" | "PRIOR_C" | "PRIOR_A" | "LEAGUE_MEAN";

export type CfbV2RatingConfig = {
  coreMetrics: readonly ["ypp", "ppp"];
  aggregation: "gameWeighted";
  garbageTimeFilter: "NONE";
  opponentAdjustment: "RIDGE_PRIOR_CENTERED";
  connectivity: CfbV2ConnectivityConfig;
  preseasonPrior: {
    featureSet: "PRIOR_D";
    offenseFeatures: readonly ["prevSeasonOffense", "returningProductionOffense", "talent"];
    defenseFeatures: readonly ["prevSeasonDefense", "talent"];
    /** Downward-only from the requested tier to LEAGUE_MEAN (Phase 3 §9). Never zero-imputed. */
    fallbackHierarchy: {
      offense: readonly ["PRIOR_D", "PRIOR_C", "PRIOR_A", "LEAGUE_MEAN"];
      defense: readonly ["PRIOR_D", "PRIOR_C", "PRIOR_A", "LEAGUE_MEAN"];
    };
    priorRidgeLambda: number;
  };
};

export const CFB_V2_RATING_CONFIG: CfbV2RatingConfig = deepFreeze({
  coreMetrics: ["ypp", "ppp"],
  aggregation: "gameWeighted",
  garbageTimeFilter: "NONE",
  opponentAdjustment: "RIDGE_PRIOR_CENTERED",
  connectivity: CFB_V2_CONNECTIVITY_CONFIG,
  preseasonPrior: {
    featureSet: "PRIOR_D",
    offenseFeatures: ["prevSeasonOffense", "returningProductionOffense", "talent"],
    defenseFeatures: ["prevSeasonDefense", "talent"],
    fallbackHierarchy: {
      offense: ["PRIOR_D", "PRIOR_C", "PRIOR_A", "LEAGUE_MEAN"],
      defense: ["PRIOR_D", "PRIOR_C", "PRIOR_A", "LEAGUE_MEAN"],
    },
    priorRidgeLambda: 3,
  },
});

// ---------------------------------------------------------------------------
// §6 — Scoring architecture config (structure only — no fitted coefficients).
// ---------------------------------------------------------------------------

export type CfbV2ScoringConfig = {
  hfa: "NATIONAL";
  scoringEnvironment: "BLENDED_CURRENT";
  pace: "NONE";
  secondaryBlock: readonly ["SUCCESS"];
  scoringRidgeLambda: number;
  priorGamesWeight: number;
};

export const CFB_V2_SCORING_CONFIG: CfbV2ScoringConfig = deepFreeze({
  hfa: "NATIONAL",
  scoringEnvironment: "BLENDED_CURRENT",
  pace: "NONE",
  secondaryBlock: ["SUCCESS"],
  scoringRidgeLambda: 2,
  priorGamesWeight: 8,
});

// ---------------------------------------------------------------------------
// §7 — Total calibration config.
// ---------------------------------------------------------------------------

export type CfbV2CalibrationConfig = {
  method: "TOTAL_ONLY_LINEAR";
  scoreCalibrationMode: "TOTAL_ONLY";
  totalCalibrationMethod: "LINEAR";
  preservesRawMargin: true;
};

export const CFB_V2_CALIBRATION_CONFIG: CfbV2CalibrationConfig = deepFreeze({
  method: "TOTAL_ONLY_LINEAR",
  scoreCalibrationMode: "TOTAL_ONLY",
  totalCalibrationMethod: "LINEAR",
  preservesRawMargin: true,
});

// ---------------------------------------------------------------------------
// §8 — Probability config.
// ---------------------------------------------------------------------------

export type CfbV2ProbabilityConfig = {
  method: "EMPIRICAL_RESIDUAL_BOOTSTRAP";
  seed: number;
  drawCount: number;
  residualPooling: "EMPIRICAL_POOLED";
  varianceTreatment: "HOMOSKEDASTIC";
};

export const CFB_V2_PROBABILITY_CONFIG: CfbV2ProbabilityConfig = deepFreeze({
  method: "EMPIRICAL_RESIDUAL_BOOTSTRAP",
  seed: 20260101,
  drawCount: 20000,
  residualPooling: "EMPIRICAL_POOLED",
  varianceTreatment: "HOMOSKEDASTIC",
});

// ---------------------------------------------------------------------------
// Full frozen snapshot — the production drift guard (§20/WU1 acceptance §2).
// ---------------------------------------------------------------------------

export const CFB_V2_FROZEN_CONFIG = deepFreeze({
  rating: CFB_V2_RATING_CONFIG,
  scoring: CFB_V2_SCORING_CONFIG,
  calibration: CFB_V2_CALIBRATION_CONFIG,
  probability: CFB_V2_PROBABILITY_CONFIG,
});

/** configVersion/configHash — stable hash of the full frozen snapshot. */
export const CFB_V2_CONFIG_VERSION = computeCfbV2ConfigHash(CFB_V2_FROZEN_CONFIG);

// ---------------------------------------------------------------------------
// §18 — Fail-fast config validation.
// ---------------------------------------------------------------------------

export class CfbV2ConfigValidationError extends Error {}

export type CfbV2ConfigValidationInput = {
  rating: CfbV2RatingConfig;
  scoring: CfbV2ScoringConfig;
  probability: CfbV2ProbabilityConfig;
};

/**
 * Throws on any impossible/invalid config value. Defaults to the frozen
 * production config; accepts an override so tests can exercise each
 * rejection branch without mutating the frozen singleton.
 */
export function validateCfbV2Config(
  target: CfbV2ConfigValidationInput = { rating: CFB_V2_RATING_CONFIG, scoring: CFB_V2_SCORING_CONFIG, probability: CFB_V2_PROBABILITY_CONFIG },
): void {
  const { connectivity, preseasonPrior } = target.rating;
  if (!(connectivity.baseLambda > 0)) {
    throw new CfbV2ConfigValidationError(`baseLambda must be > 0, got ${connectivity.baseLambda}`);
  }
  if (!(connectivity.maxPenaltyMultiplier >= 1)) {
    throw new CfbV2ConfigValidationError(`maxPenaltyMultiplier must be >= 1, got ${connectivity.maxPenaltyMultiplier}`);
  }
  if (!(connectivity.componentSizeK > 0)) {
    throw new CfbV2ConfigValidationError(`componentSizeK must be > 0, got ${connectivity.componentSizeK}`);
  }
  if (connectivity.policy !== "COMPONENT_SIZE") {
    throw new CfbV2ConfigValidationError(`unsupported connectivity policy: ${connectivity.policy}`);
  }
  if (!(target.probability.drawCount > 0)) {
    throw new CfbV2ConfigValidationError(`drawCount must be > 0, got ${target.probability.drawCount}`);
  }
  if (!Number.isFinite(target.probability.seed)) {
    throw new CfbV2ConfigValidationError(`seed must be a finite number, got ${target.probability.seed}`);
  }
  if (!(preseasonPrior.priorRidgeLambda > 0)) {
    throw new CfbV2ConfigValidationError("priorRidgeLambda must be > 0");
  }
  if (!(target.scoring.scoringRidgeLambda > 0)) {
    throw new CfbV2ConfigValidationError("scoringRidgeLambda must be > 0");
  }
  if (!(target.scoring.priorGamesWeight > 0)) {
    throw new CfbV2ConfigValidationError("priorGamesWeight must be > 0");
  }
}

validateCfbV2Config();
