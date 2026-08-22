// Phase 6 research config namespace. Does NOT import CFB_PIPELINE_CONFIG,
// CFB_MODEL_CONFIG, CFB_V1_CONFIG, marketAnchor, or MIC (Section 32).

export const CFB_RESEARCH_PHASE6_VERSION = "cfb-research-phase6-market-comparison-v0.1" as const;
export const CFB_RESEARCH_PHASE6_EXPERIMENTS_DIR = "data/cfb/research/experiments/phase6";

export const PHASE6_TEST_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

// Section 19 — coarse, predeclared candidate thresholds only (no grid search).
export const SPREAD_EDGE_THRESHOLDS_POINTS = [1, 2, 3, 4, 5] as const;
export const PROBABILITY_EDGE_THRESHOLDS = [0.02, 0.05, 0.075, 0.1] as const;
export const MONEYLINE_EV_THRESHOLDS = [0, 0.025, 0.05, 0.075, 0.1] as const;

// Section 19 — walk-forward threshold validation split: pick on TUNING seasons, evaluate on HOLDOUT.
export const THRESHOLD_TUNING_SEASONS = [2020, 2021, 2022, 2023] as const;
export const THRESHOLD_HOLDOUT_SEASONS = [2024, 2025] as const;

// Section 14 — spread edge-bucket bins (points).
export const SPREAD_EDGE_BUCKETS = [
  { label: "<1", min: 0, max: 1 },
  { label: "1-2", min: 1, max: 2 },
  { label: "2-3", min: 2, max: 3 },
  { label: "3-5", min: 3, max: 5 },
  { label: "5-7", min: 5, max: 7 },
  { label: "7+", min: 7, max: Infinity },
] as const;

// Section 15 — probability-edge buckets.
export const PROBABILITY_EDGE_BUCKETS = [
  { label: "0-2%", min: 0, max: 0.02 },
  { label: "2-5%", min: 0.02, max: 0.05 },
  { label: "5-10%", min: 0.05, max: 0.1 },
  { label: "10-15%", min: 0.1, max: 0.15 },
  { label: "15%+", min: 0.15, max: 1 },
] as const;

/** Minimum sample size before a bucket's win/cover rate is reported as anything but exploratory (Section 14/28). */
export const MIN_BUCKET_SAMPLE_SIZE = 30;
