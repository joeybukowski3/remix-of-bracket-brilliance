// Phase 2 research config namespace. Deliberately does NOT import
// src/lib/cfb/pipeline/config.ts (CFB_PIPELINE_CONFIG) or any other
// production constant — Section 18 forbids silently importing production
// values. Baseline values below are hand-copied from the Work Unit
// instructions with an explicit "frozen reproduction" note.

export const CFB_RESEARCH_PHASE2_BASELINE_VERSION = "cfb-research-phase2-baseline-v1" as const;

/**
 * Frozen reproduction of JKB V1 Independent, as specified for Phase 2
 * Section 1 — NOT read from production CFB_PIPELINE_CONFIG (which has
 * since moved to strength=0.55/iterations=12). These exact values (0.20 /
 * 6) are the deliberately frozen historical baseline definition.
 */
export const CFB_RESEARCH_PHASE2_BASELINE_CONFIG = Object.freeze({
  version: CFB_RESEARCH_PHASE2_BASELINE_VERSION,
  metrics: ["ypp", "ppp"] as const,
  offenseBlend: { ypp: 0.5, ppp: 0.5 },
  defenseBlend: { ypp: 0.5, ppp: 0.5 },
  powerBlend: { offense: 0.5, defense: 0.5 },
  opponentAdjustmentStrength: 0.2,
  iterations: 6,
  minimumGames: 1,
  garbagePolicy: "NONE" as const,
  aggregationMode: "gameWeighted" as const,
});

export const CFB_RESEARCH_PHASE2_ITERATIVE_VERSION = "cfb-research-phase2-iterative-v0.1" as const;
export const CFB_RESEARCH_PHASE2_RIDGE_VERSION = "cfb-research-phase2-ridge-v0.1" as const;
export const CFB_RESEARCH_PHASE2_PARTIAL_POOLING_VERSION = "cfb-research-phase2-partial-pooling-v0.1" as const;

/** Section 4 candidate grids — coarse by design (Section 11: "prefer coarse grids"). */
export const ITERATIVE_STRENGTH_GRID = [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0] as const;
export const ITERATIVE_ITERATIONS_GRID = [3, 6, 12, 20] as const;

/** Section 5 ridge λ grid — searched only inside the training window. */
export const RIDGE_LAMBDA_GRID = [0.5, 1, 2, 5, 10, 20, 50] as const;

/** Section 6 partial-pooling shrinkage grid (empirical-Bayes prior variance ratio). */
export const PARTIAL_POOLING_TAU_GRID = [0.5, 1, 2, 5, 10, 20] as const;

export const CFB_RESEARCH_PHASE2_METRIC_SETS = Object.freeze({
  V1: ["ypp", "ppp"],
  PPA: ["ppaPerPlay"],
  PPA_SR: ["ppaPerPlay", "ppaSuccessRate"],
  PPA_DD: ["ppaPerPlay", "downDistanceSuccessRate"],
  PPA_EXP: ["ppaPerPlay", "ppaSuccessRate", "explosivePlayRate"],
} as const);

export const CFB_RESEARCH_PHASE2_GARBAGE_POLICIES = ["NONE", "SCORE_QUARTER", "SOFT_WEIGHT"] as const;
export const CFB_RESEARCH_PHASE2_AGGREGATION_MODES = ["playWeighted", "gameWeighted"] as const;

/** Section 2 walk-forward contract. */
export const WALK_FORWARD_WARM_START_SEASON = 2018;
export const WALK_FORWARD_TEST_SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025] as const;

/** Section 20 staged compute plan: tune on 2019-2022, freeze, evaluate on 2023-2025. */
export const HYPERPARAMETER_TUNING_SEASONS = [2019, 2020, 2021, 2022] as const;
export const HYPERPARAMETER_HOLDOUT_SEASONS = [2023, 2024, 2025] as const;

export const CFB_RESEARCH_PHASE2_EXPERIMENTS_DIR = "data/cfb/research/experiments/phase2";
