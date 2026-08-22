// Phase 3 research config namespace. Does NOT import CFB_PIPELINE_CONFIG,
// CFB_MODEL_CONFIG, or any production constant (same discipline as
// phase2/config.ts — Section 22).

export const CFB_RESEARCH_PHASE3_VERSION = "cfb-research-phase3-prior-v0.1" as const;
export const CFB_RESEARCH_PHASE3_EXPERIMENTS_DIR = "data/cfb/research/experiments/phase3";

/**
 * The prior regression needs a prior-season -> target-season training
 * pair; the earliest available prior-season is 2018, so the earliest
 * season with a *trainable* (non-degenerate) prior regression is 2020
 * (trained on the single 2019 pair). 2019 itself is run only through the
 * no-prior baselines — see phase3 final report Section 27 (deviations).
 */
export const PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025] as const;
export const PHASE3_ALL_TEST_SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025] as const;

export const PRIOR_RIDGE_LAMBDA = 3;

export const DECAY_FIXED_GAME_COUNT_RAMP_GRID = [2, 4, 6] as const;
export const DECAY_PRECISION_WEIGHTED_K_GRID = [1, 2, 3, 5, 8] as const;

export const RIDGE_WITH_PRIOR_LAMBDA_GRID = [1, 2, 5, 10, 20] as const;
