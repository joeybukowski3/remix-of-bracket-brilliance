// Phase 4 research config namespace. Does NOT import CFB_PIPELINE_CONFIG,
// CFB_MODEL_CONFIG, CFB_V1_CONFIG, or any production constant (same
// discipline as phase2/config.ts and phase3/config.ts — Section 24).

export const CFB_RESEARCH_PHASE4_VERSION = "cfb-research-phase4-scoring-v0.1" as const;
export const CFB_RESEARCH_PHASE4_EXPERIMENTS_DIR = "data/cfb/research/experiments/phase4";

// Reuses Phase 3's prior-eligible test seasons (the earliest season with a
// trainable, non-degenerate preseason prior is 2020).
export const PHASE4_TEST_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

/** Section 20 — small sensitivity grid around Phase 3's established best range, not a giant retune. */
export const RIDGE_LAMBDA_SENSITIVITY_GRID = [10, 15, 20, 30] as const;
export const PRIOR_K_SENSITIVITY_GRID = [5, 6, 8] as const;

/** Frozen defaults used everywhere the sensitivity grid isn't the point (Phase 3's established best). */
export const DEFAULT_RIDGE_LAMBDA = 20;
export const DEFAULT_PRIOR_K = 8;
export const DEFAULT_PRIOR_FEATURE_SET = "PRIOR_D" as const;

export const SCORING_RIDGE_LAMBDA = 2; // regularization on the scoring regression itself (small feature count)
