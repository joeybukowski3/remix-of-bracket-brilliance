/**
 * FROZEN specifications for the two SHADOW-ONLY fantasy projection candidates. Nothing in this directory is read by any public consumer.
 *
 * Provenance: docs/modeling/FANTASY_SHADOW_CANDIDATES.md; estimation script
 * `scripts/analysis/nfl-fantasy-projection-audit-2026-09/20_freeze_coefficients.py` (output `out/part4_5_frozen_coefficients.json`),
 * frozen 2026-09-25 from 2024-2025 walk-forward data (2023-2025 for snap share). Every coefficient uses ONE rule: precision-weighted shrinkage of the
 * historical estimate toward the current production value (tau = 0.10; snap share toward 0 with tau = 0.5 pts/SD), rounded to 0.01.
 *
 * Changing ANY number below requires a new candidate version string; frozen values must never be edited after prospective evaluation begins.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const SHADOW_CANDIDATE_A_VERSION = "weekly-fantasy-shadow-candidate-a-v1" as const;
export const SHADOW_CANDIDATE_B_VERSION = "weekly-fantasy-shadow-candidate-b-v1" as const;
export const SHADOW_ARTIFACT_SCHEMA_VERSION = "weekly-fantasy-shadow-artifact-v1" as const;
export const SHADOW_ARCHIVE_SCHEMA_VERSION = "weekly-fantasy-shadow-archive-event-v1" as const;
export const SHADOW_FROZEN_AT = "2026-09-25" as const;

/** Current production policy values (weekly-fantasy-production-context-v1), repeated here ONLY to make the diff explicit and testable. */
export const PRODUCTION_POLICY_REFERENCE = {
  env: { QB: { coefficient: 0.30, cap: 2.0 }, RB: { coefficient: 0.22, cap: 1.5 }, WR: { coefficient: 0.26, cap: 1.75 }, TE: { coefficient: 0.18, cap: 1.0 } },
  fpa: { QB: { weight: 0.20, cap: 2.0 }, RB: { weight: 0.15, cap: 1.5 }, WR: { weight: 0.18, cap: 1.75 }, TE: { weight: 0.15, cap: 1.25 } },
} as const;

export type CandidateASpec = {
  QB: { fpa: { weight: number; cap: number } };
  RB: { fpa: { weight: number; cap: number } };
  WR: { env: { coefficient: number; cap: number }; fpa: "unchanged-from-production" };
  TE: { structure: "unchanged-from-production" };
};

/**
 * Candidate A.
 *  QB: baseline + production residual(0) + production implied-total layer (kept) + RE-ESTIMATED opponent-FPA weight (0.20 -> 0.23; estimate 0.29, SE 0.14).
 *  RB: the CORRECTED production path (RB team-history repair, docs/modeling/FANTASY_RB_TEAM_HISTORY_REPAIR.md, must already be in the production row) with a
 *      RE-ESTIMATED opponent-FPA weight (0.15 -> 0.17; estimate 0.20, SE 0.13). NO separate level shift: the apparent RB level bias was the repaired defect.
 *  WR: implied-total coefficient 0.26 -> 0.08 (estimate 0.054, SE 0.037), cap 0.6; FPA layer exactly as production; NO new FPA logic.
 *  TE: exactly production.
 */
export const CANDIDATE_A_SPEC: CandidateASpec = {
  QB: { fpa: { weight: 0.23, cap: 2.0 } },
  RB: { fpa: { weight: 0.17, cap: 1.5 } },
  WR: { env: { coefficient: 0.08, cap: 0.6 }, fpa: "unchanged-from-production" },
  TE: { structure: "unchanged-from-production" },
};

export type SnapAdjustmentSpec = {
  feature: "snapShareL3";
  /** Training mean / SD of snapShareL3 (2023-2025, pregame pool, played). */
  mean: number;
  sd: number;
  /** Points per +1 SD of snapShareL3 above the training mean. */
  perSd: number;
  /** Symmetric cap in points. */
  cap: number;
};

/** Candidate B = Candidate A + snap share, WR and TE ONLY. Missing snap share => adjustment exactly 0 (no imputation, no indicator). */
export const CANDIDATE_B_SNAP_SPEC: Partial<Record<FantasyPosition, SnapAdjustmentSpec>> = {
  WR: { feature: "snapShareL3", mean: 0.7259, sd: 0.1844, perSd: 0.55, cap: 2.0 },
  TE: { feature: "snapShareL3", mean: 0.7079, sd: 0.1668, perSd: 0.62, cap: 2.0 },
};

/** Explicit, auditable exclusions (audit found no incremental fantasy-point value). */
export const SHADOW_EXCLUDED_SIGNALS = ["trench-advantage", "epa-advantage", "success-advantage", "td-score", "red-zone-usage"] as const;
