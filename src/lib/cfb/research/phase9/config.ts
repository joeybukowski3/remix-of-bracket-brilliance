import { BASELINE_SPEC } from "../phase8/candidateSpecs";
import type { Phase8CandidateSpec } from "../phase8/types";

// Phase 9 research config namespace. Does NOT import CFB_PIPELINE_CONFIG,
// CFB_MODEL_CONFIG, CFB_V1_CONFIG, marketAnchor, or MIC.

export const CFB_RESEARCH_PHASE9_VERSION = "cfb-research-phase9-production-candidate-validation-v0.1" as const;
export const CFB_RESEARCH_PHASE9_EXPERIMENTS_DIR = "data/cfb/research/experiments/phase9";

export const PHASE9_TEST_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

/** Section 1 — the frozen pre-Phase-8 baseline. Reused verbatim from Phase 8's own BASELINE_SPEC (GLOBAL_BASELINE, lambda=20, no staleness). */
export const PHASE9_BASELINE_SPEC: Phase8CandidateSpec = BASELINE_SPEC;

/**
 * Section 1 — the frozen Phase 8 finalist (COMPONENT_SIZE connectivity,
 * base lambda=10, capped multiplier <=3x via Phase 8's own
 * MAX_CONNECTIVITY_MULTIPLIER, no adaptive staleness). Hardcoded to match
 * exactly what Phase 8's grid search selected (data/cfb/research/experiments/phase8/phase8-finalist.json)
 * — never retuned here (Hard Freeze Rule).
 */
export const PHASE9_FINALIST_SPEC: Phase8CandidateSpec = {
  id: "COMPONENT_SIZE_L10",
  label: "Phase 8 finalist: COMPONENT_SIZE connectivity-aware Ridge, lambda=10",
  baseLambda: 10,
  connectivity: "COMPONENT_SIZE",
  staleness: "NONE",
};

/** Section 8 — predeclared "tie" band; no existing repo convention for this exists, so 0.10 MAE (matches the spec's suggestion) is used and documented, not silently invented. */
export const SEASON_TIE_BAND_MAE = 0.1;

/** Section 13 — extreme-probability QA buckets, defined on RAW pHomeWin (asymmetric), distinct from Phase 5's favored-side WIN_PROBABILITY_BUCKETS. */
export const EXTREME_PROBABILITY_BUCKETS = [
  { label: "<10%", min: 0, max: 0.1 },
  { label: "10-20%", min: 0.1, max: 0.2 },
  { label: "20-30%", min: 0.2, max: 0.3 },
  { label: "70-80%", min: 0.7, max: 0.8 },
  { label: "80-90%", min: 0.8, max: 0.9 },
  { label: ">90%", min: 0.9, max: 1.0 },
] as const;

/** Section 19 — same disagreement bins Phase 7 used. */
export const EXTREME_DISAGREEMENT_MARGIN_BINS = [7, 10, 14] as const;

export const MIN_BUCKET_SAMPLE_SIZE = 20;
