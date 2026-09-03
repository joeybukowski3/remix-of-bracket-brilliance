import type { NflShareObservation } from "../props/roleAllocation/shareModels";
import type { NflRushingAllocationDiagnostics } from "../props/types/currentWeekProjection";

/**
 * WU4D.2 RESEARCH-ONLY: pure builder for `NflRushingAllocationDiagnostics`
 * (types/currentWeekProjection.ts). NOT called by any production pipeline
 * or the live current-week generator -- see that type's docblock. Exists
 * so the schema is ready to receive real values the moment a future pass
 * decides to shadow-compute the role-allocation share model for rushing
 * rows (never to alter `projectedCarries`/`projectedYardsPerCarry`).
 *
 * `roleConflictScore` reuses the exact concept `shareModels.ts`'s S5E
 * `teamChangeQualifies` already gates on (`|priorShare - rankPrior| >
 * conflictThreshold`) -- not a new model, the same interpretable
 * difference, computed here independent of whether S5E activates.
 */

export const DEFAULT_ROLE_CONFLICT_THRESHOLD = 0.1;

export function computeRoleConflictScore(historicalSharePrior: number | null, roleSharePrior: number | null): number | null {
  if (historicalSharePrior == null || roleSharePrior == null) return null;
  return Math.abs(historicalSharePrior - roleSharePrior);
}

export function buildRushingRoleTransitionSnapshot(args: {
  observation: NflShareObservation;
  rankPrior: number | null;
  finalProjectedShare: number | null;
  projectedCarries: number | null;
  teamChangeCalibrationApplied: boolean;
  allocationModelVersion: string | null;
  conflictThreshold?: number;
}): NflRushingAllocationDiagnostics {
  const o = args.observation;
  const roleConflictScore = computeRoleConflictScore(o.priorShare, args.rankPrior);
  const threshold = args.conflictThreshold ?? DEFAULT_ROLE_CONFLICT_THRESHOLD;
  return {
    allocationModelVersion: args.allocationModelVersion,
    historicalSharePrior: o.priorShare,
    roleSharePrior: args.rankPrior,
    finalProjectedShare: args.finalProjectedShare,
    projectedCarries: args.projectedCarries,
    roleConflictScore,
    roleConflictFlag: roleConflictScore != null && roleConflictScore > threshold,
    teamChangeCalibrationApplied: args.teamChangeCalibrationApplied,
    roleConfidenceEvidence: {
      depthRank: o.depthRankProxy,
      roleSourced: o.roleSourced,
      teamChanged: o.teamChanged,
      noHistory: o.noHistory,
      limitedHistory: o.limitedHistory,
      priorGamesPlayed: o.priorGamesPlayed,
      rosterCompetitionCount: o.rosterCompetitionCount,
    },
  };
}
