/**
 * ROS projection authority -- Phase 3 shadow model configuration.
 *
 * Every formula weight and cap used by the shadow candidates lives here, in
 * one place, so the generator and any future review can see the full
 * methodology without hunting through calculation code. Nothing in this file
 * computes a value; it only names the constants `shadowProjection.ts` uses.
 * All candidates are SHADOW-ONLY research output -- see
 * `data/fantasy/ros-research/2026/shadow-ros-projections.json` and its
 * generator for the "never overwrite a live rank" guarantee.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const SHADOW_PROJECTION_SCHEMA_VERSION = "ros-shadow-projection-v1" as const;

/** A season needs at least this many games to count toward the minimum-sample-safeguarded baseline. */
export const MIN_SAMPLE_GAMES = 4;

/**
 * Recency weights applied to each history season when a season is present.
 * Missing seasons have their weight redistributed proportionally across the
 * seasons that are present (i.e. the weights below are renormalized to sum
 * to 1 over whichever seasons actually have data for a given player).
 */
export const RECENCY_WEIGHTS: Readonly<Record<number, number>> = {
  2025: 0.5,
  2024: 0.3,
  2023: 0.2,
};

/** Per-adjustment bounds. Each factor is clamped to [1 - cap, 1 + cap] before being combined with the others. */
export const ADJUSTMENT_CAPS = {
  usage: 0.15,
  team: 0.1,
  fpa: 0.1,
  market: 0.08,
} as const;

/** Ceiling on the combined product of every applied adjustment factor, regardless of how many stack. */
export const COMBINED_ADJUSTMENT_CAP = 0.3;

/** Minimum games-with-data a team needs in team-environment.json / schedule-scoring-environment.json before its market-derived factor is trusted; below this the factor is neutral (1.0) and flagged unavailable rather than computed from a tiny sample. */
export const MIN_MARKET_GAMES_FOR_TEAM_FACTOR = 2;

/**
 * Which usage field drives the usage adjustment, chosen per position because
 * the approved usage source (`usage-role-context.json`) only reliably
 * populates target-share/rush-attempt fields, not routes or snap share (see
 * that artifact's `unavailableFields`). QB has no reliable passing-volume
 * signal in the current source, so QB usage adjustment is always neutral and
 * explicitly flagged unavailable rather than approximated from an
 * unrelated field.
 */
export const USAGE_SIGNAL_FIELD_BY_POSITION: Record<FantasyPosition, "targetShare" | "rushAttempts" | null> = {
  QB: null,
  RB: "rushAttempts",
  WR: "targetShare",
  TE: "targetShare",
};

export const SHADOW_CANDIDATE_IDS = ["A", "B", "C", "D", "E"] as const;
export type ShadowCandidateId = typeof SHADOW_CANDIDATE_IDS[number];

export const SHADOW_CANDIDATE_LABELS: Record<ShadowCandidateId, string> = {
  A: "Historical baseline",
  B: "Historical + usage",
  C: "Historical + usage + team",
  D: "Historical + usage + FPA",
  E: "Full context (historical + usage + team + FPA + market where available)",
};

/** Which adjustment inputs each candidate applies, in application order. */
export const SHADOW_CANDIDATE_INPUTS: Record<ShadowCandidateId, readonly ("usage" | "team" | "fpa" | "market")[]> = {
  A: [],
  B: ["usage"],
  C: ["usage", "team"],
  D: ["usage", "fpa"],
  E: ["usage", "team", "fpa", "market"],
};

export type HistoricalBaselineWeightingId = "latest-season" | "recency-weighted" | "recency-weighted-min-sample";

export const HISTORICAL_BASELINE_WEIGHTING_IDS: readonly HistoricalBaselineWeightingId[] = [
  "latest-season",
  "recency-weighted",
  "recency-weighted-min-sample",
];

// ---------------------------------------------------------------------------
// Phase 3B -- status/availability treatments
// ---------------------------------------------------------------------------

import type { StatusCategory } from "@/lib/fantasy/rosResearch/statusAvailability";

/**
 * Confidence ceiling imposed by status category, applied on TOP of (never
 * raising) the existing input-completeness confidence from
 * `shadowConfidence`. "active" imposes no ceiling. None of these ceilings
 * are backtested against real outcomes -- 2026 has not been played -- so
 * they are a documented judgment call, not a validated result. See
 * Treatment A.
 */
export const STATUS_CONFIDENCE_CEILING: Record<StatusCategory, "high" | "medium" | "low" | "none"> = {
  active: "high",
  reserve: "medium",
  released: "low",
  suspended: "low",
  otherUnavailable: "medium",
  unknown: "medium",
};

/**
 * Bounded projection modifier tested as Treatment B. Deliberately kept in
 * the same order of magnitude as the other adjustment caps in this file
 * (10-30%), not an arbitrary large penalty, and explicitly NOT applied by
 * default (see `STATUS_TREATMENT_RECOMMENDATION` below) because it cannot be
 * backtested against a real 2026 outcome any more than the ceiling above
 * can -- it is reported as a tested alternative, not adopted.
 */
export const STATUS_PROJECTION_MODIFIER: Record<StatusCategory, number> = {
  active: 1,
  reserve: 0.85,
  released: 0.7,
  suspended: 0.75,
  otherUnavailable: 0.85,
  unknown: 1,
};

/**
 * Which categories Treatment C excludes from shadowPositionRank/
 * shadowModelRank while still retaining their projectedPpg/shadowParPerGame
 * in the artifact. Only the two categories with an unambiguous, mapped
 * "not on any 2026 team" meaning (released, suspended) are excluded;
 * "otherUnavailable"/"unknown" are NOT excluded because their meaning is not
 * confidently known (see the unmapped-code comments in
 * `statusAvailability.ts`) and excluding on an unconfirmed basis would be
 * exactly the kind of unverified inference this project avoids.
 */
export const STATUS_MODEL_RANK_EXCLUSION: Record<StatusCategory, boolean> = {
  active: false,
  reserve: false,
  released: true,
  suspended: true,
  otherUnavailable: false,
  unknown: false,
};

export const STATUS_TREATMENT_IDS = ["A", "B", "C", "D"] as const;
export type StatusTreatmentId = typeof STATUS_TREATMENT_IDS[number];

export const STATUS_TREATMENT_LABELS: Record<StatusTreatmentId, string> = {
  A: "Status as confidence ceiling only (no PPG change, no rank exclusion)",
  B: "Bounded projection modifier (PPG scaled by STATUS_PROJECTION_MODIFIER)",
  C: "Exclude from Model Rank only (PPG and confidence unchanged; excluded from shadowPositionRank/shadowModelRank when STATUS_MODEL_RANK_EXCLUSION is true)",
  D: "Combination: confidence ceiling (A) + Model Rank exclusion (C), no PPG modifier",
};

/**
 * The artifact applies Treatment D by default (see the Phase 3B final
 * report, section on why B is not adopted): it downgrades confidence and
 * removes clearly-unavailable players from the ranked lists without
 * inventing an unvalidated point deduction on top of the model's own
 * historical/usage/team/FPA math. Treatments A-D are all still computed and
 * reported per player so the choice is auditable, not asserted.
 */
export const STATUS_TREATMENT_APPLIED_TO_ARTIFACT: StatusTreatmentId = "D";
