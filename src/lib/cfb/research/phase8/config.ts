// Phase 8 research config namespace. Does NOT import CFB_PIPELINE_CONFIG,
// CFB_MODEL_CONFIG, CFB_V1_CONFIG, marketAnchor, or MIC.

export const CFB_RESEARCH_PHASE8_VERSION = "cfb-research-phase8-connectivity-staleness-v0.1" as const;
export const CFB_RESEARCH_PHASE8_EXPERIMENTS_DIR = "data/cfb/research/experiments/phase8";

export const PHASE8_TEST_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025] as const;
// Section 12/23 — hyperparameter SELECTION happens only on these seasons; the frozen choice is then evaluated on the holdout seasons.
export const PHASE8_TUNING_SEASONS = [2020, 2021, 2022] as const;
export const PHASE8_HOLDOUT_SEASONS = [2023, 2024, 2025] as const;

// Section 11 — narrow grid around the established viable range (Phase 3/4 uses ratingLambda=20).
export const BASE_LAMBDA_GRID = [10, 15, 20, 30] as const;

// Section 5 — connectivity-multiplier constants (predeclared, not tuned per-team).
export const GAMES_PLAYED_K = 4; // multiplier ramps up below this many games played
export const COMPONENT_SIZE_K = 20; // multiplier ramps up below this component size
export const CROSS_CONFERENCE_K = 2; // multiplier ramps up below this many cross-conference opponents
export const MAX_CONNECTIVITY_MULTIPLIER = 3.0; // Section 6 safety cap — never over-shrink beyond 3x base

// Section 7 — reliability(current evidence) uses games played as the evidence-strength proxy.
export const STALENESS_RELIABILITY_GAMES_K = 4; // reliability reaches 1.0 at this many games played

// Section 12 — coarse predeclared staleness-decay grid.
export const STALENESS_FLOOR_GRID = [0.25, 0.5, 0.75] as const;
export const STALENESS_THRESHOLD_LOW_GRID = [0.2, 0.35] as const; // adjustedStaleness (standardized rating units) below which NO decay acceleration happens
export const STALENESS_THRESHOLD_HIGH_GRID = [0.8, 1.2] as const; // adjustedStaleness at/above which the floor multiplier is fully applied

export const MIN_BUCKET_SAMPLE_SIZE = 20;
