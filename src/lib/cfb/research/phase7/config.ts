// Phase 7 research config namespace. Does NOT import CFB_PIPELINE_CONFIG,
// CFB_MODEL_CONFIG, CFB_V1_CONFIG, marketAnchor, or MIC (mirrors Phase 6's
// architectureGuard discipline).

export const CFB_RESEARCH_PHASE7_VERSION = "cfb-research-phase7-information-gap-v0.1" as const;
export const CFB_RESEARCH_PHASE7_EXPERIMENTS_DIR = "data/cfb/research/experiments/phase7";

// Same test-season window Phase 6 used (earliest season with market-line coverage).
export const PHASE7_TEST_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

// Section 3 — research bins, not tuned thresholds.
export const MISS_ERROR_THRESHOLD_POINTS = 10.5; // "good" prediction: |error| below this (~ historical median absolute error)
export const EXTREME_DISAGREEMENT_MARGIN_BINS = [7, 10, 14] as const;
export const EXTREME_DISAGREEMENT_PROBABILITY_BINS = [0.1, 0.2, 0.3] as const;

export const EXTREME_DISAGREEMENT_TOP_N_PER_SEASON = 15;

// Section 5 — sparsity buckets (games played entering week).
export const GAMES_PLAYED_BUCKETS = [
  { label: "0-1", min: 0, max: 1 },
  { label: "2-3", min: 2, max: 3 },
  { label: "4-6", min: 4, max: 6 },
  { label: "7+", min: 7, max: Infinity },
] as const;

// Section 11 — rating volatility buckets (absolute week-over-week power-rating change, standardized units).
export const RATING_VOLATILITY_BUCKETS = [
  { label: "low (<0.15)", min: 0, max: 0.15 },
  { label: "medium (0.15-0.35)", min: 0.15, max: 0.35 },
  { label: "high (0.35+)", min: 0.35, max: Infinity },
] as const;

// Section 16 — talent/returning-production deciles use quantile binning computed at runtime (no fixed thresholds here).
export const SEGMENTATION_DECILE_COUNT = 10;

export const MIN_BUCKET_SAMPLE_SIZE = 20;

// Section 7 — a QB is only treated as a team's "primary" QB for a season if usage.pass clears this floor;
// otherwise the team has no identifiable starter that season (never fabricated).
export const QB_PRIMARY_USAGE_PASS_FLOOR = 0.3;

// Section 9 — CFBD transfer-portal coverage is empirically empty before 2021 (verified in cfb-research-phase7-fetch.ts run).
export const TRANSFER_PORTAL_COVERAGE_START_SEASON = 2021;

// Section 10 — coaching continuity can only be evaluated for seasons with an observed strictly-prior season in the backfill window.
export const COACHING_BACKFILL_START_SEASON = 2018;
