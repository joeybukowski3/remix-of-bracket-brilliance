/**
 * WU8 generated-lineup contracts.
 *
 * These types describe what the optimizer PRODUCES. They never redefine a
 * projection, a rank, an eligibility decision or a DST matchup score -- each
 * of those is copied verbatim from its existing authority.
 */

import type { LineupStrategy, ObjectiveComponent } from "@/lib/nfl/dfs/policies/lineupObjectivesV1";
import type { DfsRoleContext } from "@/lib/nfl/dfs/roleContext";
import type { DstMatchup } from "@/lib/nfl/dfs/dstMatchup";

/** Roster slots in DraftKings NFL Classic display order. */
export const LINEUP_SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "WR3", "TE", "FLEX", "DST"] as const;
export type LineupSlot = (typeof LINEUP_SLOTS)[number];

export type ObjectiveComponentScore = {
  component: ObjectiveComponent;
  label: string;
  /** Raw underlying value before normalization. Null when unavailable. */
  rawValue: number | null;
  /** Position-relative (or team-relative) percentile, 0-100, higher is better. Null when unavailable. */
  normalized: number | null;
  /** Original policy weight for this strategy. */
  policyWeight: number;
  /** Weight actually applied after missing-component renormalization. */
  effectiveWeight: number;
  /** Human-readable note about the source or why it is unavailable. */
  detail: string;
};

/** Per-player, per-strategy objective outcome. */
export type PlayerStrategyScore = {
  strategy: LineupStrategy;
  /** 0-100 weighted mean of available normalized components. Null when coverage is insufficient. */
  score: number | null;
  /** Share of the strategy's ORIGINAL weight that was available, 0-1. */
  componentCoverage: number;
  components: ObjectiveComponentScore[];
  missingComponents: ObjectiveComponent[];
  effectiveWeights: Partial<Record<ObjectiveComponent, number>>;
  /** True when coverage cleared MINIMUM_OBJECTIVE_COVERAGE. */
  scorable: boolean;
  unavailableReason: string | null;
};

export type GeneratedLineupSlotPlayer = {
  slot: LineupSlot;
  dkId: string;
  /** Canonical JKB playerId for offense, canonical team id for DST. Null when unresolved. */
  canonicalId: string | null;
  playerName: string;
  team: string;
  opponent: string | null;
  canonicalGameId: string | null;
  position: "QB" | "RB" | "WR" | "TE" | "DST";
  salary: number;
  /** JKB Full PPR projected points. Always null for DST -- there is no JKB DST projection. */
  projectedFantasyPoints: number | null;
  /** DraftKings CSV benchmark. Never called consensus, never blended into a JKB total. */
  dkAvgPointsPerGame: number | null;
  posRankDiff: number | null;
  overallRankDiff: number | null;
  optimizerEligibility: "eligible" | "ineligible" | "unknown" | null;
  roleContext: DfsRoleContext | null;
  dstMatchup: DstMatchup | null;
  /** Normalized strategy score used by the objective for this player, 0-100. */
  strategyScore: PlayerStrategyScore;
};

export type LineupConstraintStatus = {
  slotsFilled: number;
  salaryWithinCap: boolean;
  uniqueDkIds: boolean;
  uniqueCanonicalIdentities: boolean;
  flexPositionLegal: boolean;
  distinctGames: number;
  minimumGamesSatisfied: boolean;
  allOffenseOptimizerEligible: boolean;
  dstContextUsable: boolean;
  allFromUploadedSlate: boolean;
};

export type LineupReason = { label: string; detail: string };

export type GeneratedLineup = {
  strategy: LineupStrategy;
  strategyLabel: string;
  slots: GeneratedLineupSlotPlayer[];
  salaryCap: number;
  salaryUsed: number;
  salaryRemaining: number;
  /** Sum over the EIGHT offensive slots only. DST has no JKB projection. */
  jkbOffenseProjectionSubtotal: number;
  jkbOffensePlayerCount: number;
  /** Sum of DK Avg PPG over slots where the CSV supplied one. */
  dkBenchmarkSubtotal: number;
  dkBenchmarkPlayerCount: number;
  objectiveScore: number;
  objectiveVersion: string;
  rulesVersion: string;
  strategyWeights: Partial<Record<ObjectiveComponent, number>>;
  topReasons: LineupReason[];
  warnings: string[];
  constraintStatus: LineupConstraintStatus;
};

export type LineupInfeasibility = {
  strategy: LineupStrategy;
  strategyLabel: string;
  reasons: string[];
  candidateCounts: Record<"QB" | "RB" | "WR" | "TE" | "DST", number>;
};

export type GeneratedLineupSet = {
  status: "ready" | "infeasible" | "unavailable";
  lineups: GeneratedLineup[];
  infeasible: LineupInfeasibility[];
  /** Optimizer-eligible candidate counts before strategy scoring. */
  candidatePool: {
    uploadedRows: number;
    offenseEligible: number;
    offenseIneligible: number;
    offenseUnknown: number;
    dstWithUsableContext: number;
    dstWithoutUsableContext: number;
    byPosition: Record<"QB" | "RB" | "WR" | "TE" | "DST", number>;
  };
  objectiveVersion: string;
  rulesVersion: string;
  salaryCap: number;
  asOf: string;
  warnings: string[];
  /** Wall-clock milliseconds spent solving, for the performance disclosure. */
  elapsedMs: number;
};
