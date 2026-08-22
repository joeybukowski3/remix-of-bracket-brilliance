// Phase 5 research config namespace. Does NOT import CFB_PIPELINE_CONFIG,
// CFB_MODEL_CONFIG, CFB_V1_CONFIG, or any production constant (same
// discipline as phase2-4's config.ts — Section 19).

export const CFB_RESEARCH_PHASE5_VERSION = "cfb-research-phase5-distribution-v0.1" as const;
export const CFB_RESEARCH_PHASE5_EXPERIMENTS_DIR = "data/cfb/research/experiments/phase5";

// Reuses Phase 3/4's prior-eligible test seasons.
export const PHASE5_TEST_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

/** Minimum training-window residual pairs required before a calibration/variance estimate is trusted (else falls back to a coarser pool). */
export const MIN_CALIBRATION_ROWS = 40;
export const MIN_VARIANCE_ROWS = 30;

/** Deterministic Monte Carlo simulation (Section 14) — fixed seed, bounded draw count. */
export const SIMULATION_SEED = 20260101;
export const SIMULATION_DRAWS = 20_000;

export const WIN_PROBABILITY_BUCKETS = [
  { label: "50-55", min: 0.5, max: 0.55 },
  { label: "55-60", min: 0.55, max: 0.6 },
  { label: "60-70", min: 0.6, max: 0.7 },
  { label: "70-80", min: 0.7, max: 0.8 },
  { label: "80-90", min: 0.8, max: 0.9 },
  { label: "90+", min: 0.9, max: 1.0 },
] as const;

export const INTERVAL_LEVELS = [0.5, 0.8, 0.9, 0.95] as const;
