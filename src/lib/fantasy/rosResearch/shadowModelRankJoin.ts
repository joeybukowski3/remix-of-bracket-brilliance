/**
 * ROS projection authority -- Option D presentation join.
 *
 * Exposes the committed F2 shadow authority (`recency-weighted-min-sample`
 * historical baseline + PAR-consensus rookie fallback + status Treatment D +
 * R2 rank eligibility) to the live ROS board as a second, read-only "Model
 * Rank" column. This module never recomputes the model -- it only reads the
 * artifact already produced by `scripts/generate-ros-shadow-projections.ts`
 * and joins it to a JKB workbook row.
 *
 * Join key: `overallRank` <-> the artifact's `currentOverallRank`. This is
 * not a name/fuzzy join -- `currentOverallRank` is written by the generation
 * script directly from `FANTASY_RANKINGS.rows[i].overallRank` for the same
 * player, so it already *is* the canonical identity established at
 * generation time (verified 1:1 and unique across all 250 rows). A missing
 * key is a genuine gap (e.g. the artifact predates a workbook refresh) and
 * fails closed to `undefined`, never a nearest-name guess.
 */
import shadowRosProjectionsArtifact from "../../../../data/fantasy/ros-research/2026/shadow-ros-projections.json";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const SHADOW_MODEL_RANK_JOIN_SCHEMA_VERSION = "ros-shadow-model-rank-join-v1" as const;

type RefinedCandidateId = "F1" | "F2" | "F3";

type ShadowRefinedCandidate = {
  candidate: RefinedCandidateId;
  label: string;
  projectedPpg: number | null;
  shadowParPerGame: number | null;
  confidence: "high" | "medium" | "low";
  effectiveConfidence: "high" | "medium" | "low";
  excludedFromShadowRank: boolean;
};

type ShadowRankEligibilityByPolicy = {
  rankEligible: boolean;
  rankEligibilityReason: string | null;
};

type ShadowArtifactPlayer = {
  canonicalPlayerId: string;
  player: string;
  position: FantasyPosition;
  team: string | null;
  currentOverallRank: number;
  baselineSource: "historical-model" | "fallback";
  fallback: unknown;
  status: {
    category: string;
    rawCode: string | null;
    source: string;
    sourceTeam: string | null;
    asOf: string;
  };
  availabilityStatus: string;
  availabilitySource: string;
  availabilityAsOf: string;
  availabilityConfidence: string;
  currentRosterVerified: boolean;
  statusConflict: boolean;
  statusConflictReason: string | null;
  rankEligible: boolean;
  rankEligibilityReason: string | null;
  eligibilityByPolicy: {
    R1: ShadowRankEligibilityByPolicy;
    R2: ShadowRankEligibilityByPolicy;
    R3: ShadowRankEligibilityByPolicy;
  };
  refinedCandidates: readonly ShadowRefinedCandidate[];
  shadowPositionRank: number | null;
  shadowModelRank: number | null;
};

type ShadowArtifact = {
  schemaVersion: string;
  players: readonly ShadowArtifactPlayer[];
};

const ARTIFACT = shadowRosProjectionsArtifact as ShadowArtifact;

/** Model provenance and rank surfaced to the live board for one player. */
export type ShadowModelRankRow = {
  /** Overall Model Rank under the applied R2 policy, or null when withheld. */
  modelRank: number | null;
  /** Model rank within position under the applied R2 policy, or null when withheld. */
  modelPositionRank: number | null;
  /** F2 projected PPG. Model/Research value -- never the live canonical PPG. */
  modelProjectedPpg: number | null;
  /** F2 shadow PAR/G. Model/Research value -- never the live canonical PAR/G. */
  modelParPerGame: number | null;
  projectionSource: "historical-model" | "fallback";
  confidence: "high" | "medium" | "low";
  rankEligible: boolean;
  rankEligibilityReason: string | null;
  availabilityStatus: string;
  availabilitySource: string;
  availabilityAsOf: string;
  statusConflict: boolean;
  statusConflictReason: string | null;
};

function toModelRankRow(entry: ShadowArtifactPlayer): ShadowModelRankRow {
  const f2 = entry.refinedCandidates.find((candidate) => candidate.candidate === "F2");
  return {
    modelRank: entry.rankEligible ? entry.shadowModelRank : null,
    modelPositionRank: entry.rankEligible ? entry.shadowPositionRank : null,
    modelProjectedPpg: f2?.projectedPpg ?? null,
    modelParPerGame: f2?.shadowParPerGame ?? null,
    projectionSource: entry.baselineSource,
    confidence: f2?.effectiveConfidence ?? "low",
    rankEligible: entry.rankEligible,
    rankEligibilityReason: entry.rankEligibilityReason,
    availabilityStatus: entry.availabilityStatus,
    availabilitySource: entry.availabilitySource,
    availabilityAsOf: entry.availabilityAsOf,
    statusConflict: entry.statusConflict,
    statusConflictReason: entry.statusConflictReason,
  };
}

const MODEL_RANK_BY_OVERALL_RANK: ReadonlyMap<number, ShadowModelRankRow> = new Map(
  ARTIFACT.players.map((entry) => [entry.currentOverallRank, toModelRankRow(entry)]),
);

/**
 * Looks up the Model Rank/provenance row for a JKB overall rank. Returns
 * `undefined` when the artifact has no row for that rank (fail closed --
 * the caller must render N/A, never fabricate a value).
 */
export function getShadowModelRankRow(overallRank: number): ShadowModelRankRow | undefined {
  return MODEL_RANK_BY_OVERALL_RANK.get(overallRank);
}
