/**
 * JKB HR bridge model (Phase 1, shadow-only).
 *
 * Mirrors the current production HR weight allocation exactly so the
 * shadow comparison isolates score-engine/normalization behavior (stable
 * fixed ranges, no same-slate percentile blending, no same-slate min-max,
 * neutral missing-value substitution instead of drop-and-renormalize)
 * rather than changing weights and architecture at the same time.
 *
 * This model must NOT become the public production default, must not drive
 * sorting, best-bet selection, Sin City, email, or social posts, and its
 * output is not a probability.
 */

import { METRIC_REGISTRY_VERSION } from "./metricRegistry";
import type { ModelConfig } from "./types";

export const HR_BRIDGE_SCORE_VERSION = "hr-bridge-abs@1";
export const HR_BRIDGE_RANGE_ARTIFACT_VERSION = "hr-bridge-v1";

/** Percent of active weight that must be backed by real values. */
export const HR_BRIDGE_COMPLETENESS_FLOOR_PERCENT = 65;

export const HR_BRIDGE_MODEL: ModelConfig = {
  modelId: "jkb-hr-bridge",
  market: "hr",
  name: "JKB HR Bridge (shadow)",
  description:
    "Shadow-only bridge model: current production HR weights over versioned fixed reference ranges. Used to validate the deterministic score engine against the live slate-relative hrScore. Not a public score, not a probability.",
  modelType: "weighted",
  origin: "jkb-default",
  modelVersion: "1.0.0",
  scoreVersion: HR_BRIDGE_SCORE_VERSION,
  registryVersion: METRIC_REGISTRY_VERSION,
  weights: {
    "batter-barrel-pct": 22,
    "batter-hard-hit-pct": 18,
    "batter-xba": 12,
    "batter-whiff-pct": 8,
    "batter-last-7-hr": 10,
    "batter-last-30-hr": 10,
    "pitcher-hr-vulnerability": 15,
    "park-hr-factor": 3,
    "weather-hr-boost": 2,
  },
  hardFilters: [],
  visibleColumns: [],
  createdAt: "2026-07-12T00:00:00Z",
  updatedAt: "2026-07-12T00:00:00Z",
  schemaVersion: 1,
  completenessFloorPercent: HR_BRIDGE_COMPLETENESS_FLOOR_PERCENT,
};
