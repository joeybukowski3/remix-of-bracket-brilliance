import { describe, expect, it } from "vitest";
import type { NflShareObservation } from "../props/roleAllocation/shareModels";
import { buildRushingRoleTransitionSnapshot, computeRoleConflictScore, DEFAULT_ROLE_CONFLICT_THRESHOLD } from "./rushingRoleTransitionSnapshot";

function obs(overrides: Partial<NflShareObservation> = {}): NflShareObservation {
  return {
    season: 2024, week: 3, gameId: "g", team: "DAL", playerId: "p1", playerName: "P1",
    poolId: "g|DAL|rb", poolKey: "rb", rankKey: "rank:1", depthRankProxy: 1, isProjectedStarter: true,
    priorShare: 0.5, priorGamesPlayed: 5, noHistory: false, limitedHistory: false, teamChanged: false,
    roleSourced: false, concentration: 0.6, rosterCompetitionCount: 3, priorEfficiency: 4.2,
    actualShare: 0.5, actualVolume: 10, actualYards: 42,
    context: { teamDesignedRushes: 25, teamDropbacks: 30, poolActual: 20, gameDateUtc: "2024-09-22T17:00:00.000Z" },
    ...overrides,
  };
}

describe("computeRoleConflictScore", () => {
  it("is the absolute difference between historical and role-share priors", () => {
    expect(computeRoleConflictScore(0.6, 0.3)).toBeCloseTo(0.3, 9);
    expect(computeRoleConflictScore(0.2, 0.5)).toBeCloseTo(0.3, 9);
  });

  it("is null when either input is null (never fabricates a score from a missing prior)", () => {
    expect(computeRoleConflictScore(null, 0.3)).toBeNull();
    expect(computeRoleConflictScore(0.3, null)).toBeNull();
    expect(computeRoleConflictScore(null, null)).toBeNull();
  });
});

describe("buildRushingRoleTransitionSnapshot", () => {
  it("preserves every role-confidence evidence field from the observation verbatim", () => {
    const snapshot = buildRushingRoleTransitionSnapshot({
      observation: obs({ teamChanged: true, roleSourced: true, depthRankProxy: 2, priorGamesPlayed: 3, rosterCompetitionCount: 4 }),
      rankPrior: 0.4, finalProjectedShare: 0.45, projectedCarries: 9, teamChangeCalibrationApplied: true, allocationModelVersion: "test-v1",
    });
    expect(snapshot.roleConfidenceEvidence).toEqual({
      depthRank: 2, roleSourced: true, teamChanged: true, noHistory: false, limitedHistory: false, priorGamesPlayed: 3, rosterCompetitionCount: 4,
    });
    expect(snapshot.finalProjectedShare).toBe(0.45);
    expect(snapshot.projectedCarries).toBe(9);
    expect(snapshot.allocationModelVersion).toBe("test-v1");
    expect(snapshot.teamChangeCalibrationApplied).toBe(true);
  });

  it("flags roleConflictFlag when the score exceeds the default threshold, not otherwise", () => {
    const highConflict = buildRushingRoleTransitionSnapshot({
      observation: obs({ priorShare: 0.6 }), rankPrior: 0.1, finalProjectedShare: null, projectedCarries: null, teamChangeCalibrationApplied: false, allocationModelVersion: null,
    });
    expect(highConflict.roleConflictScore).toBeCloseTo(0.5, 9);
    expect(highConflict.roleConflictFlag).toBe(true);

    const lowConflict = buildRushingRoleTransitionSnapshot({
      observation: obs({ priorShare: 0.5 }), rankPrior: 0.45, finalProjectedShare: null, projectedCarries: null, teamChangeCalibrationApplied: false, allocationModelVersion: null,
    });
    expect(lowConflict.roleConflictScore).toBeLessThan(DEFAULT_ROLE_CONFLICT_THRESHOLD);
    expect(lowConflict.roleConflictFlag).toBe(false);
  });

  it("never flags conflict when the score is unavailable (no-history player with no rank prior)", () => {
    const snapshot = buildRushingRoleTransitionSnapshot({
      observation: obs({ priorShare: null, noHistory: true }), rankPrior: null, finalProjectedShare: 0.1, projectedCarries: 2, teamChangeCalibrationApplied: false, allocationModelVersion: null,
    });
    expect(snapshot.roleConflictScore).toBeNull();
    expect(snapshot.roleConflictFlag).toBe(false);
  });

  it("respects a custom conflictThreshold", () => {
    const snapshot = buildRushingRoleTransitionSnapshot({
      observation: obs({ priorShare: 0.5 }), rankPrior: 0.4, finalProjectedShare: null, projectedCarries: null, teamChangeCalibrationApplied: false, allocationModelVersion: null, conflictThreshold: 0.05,
    });
    expect(snapshot.roleConflictScore).toBeCloseTo(0.1, 9);
    expect(snapshot.roleConflictFlag).toBe(true); // 0.1 > 0.05
  });

  it("is deterministic across repeated calls on identical inputs", () => {
    const args = { observation: obs(), rankPrior: 0.3, finalProjectedShare: 0.4, projectedCarries: 8, teamChangeCalibrationApplied: false, allocationModelVersion: "v1" };
    expect(buildRushingRoleTransitionSnapshot(args)).toEqual(buildRushingRoleTransitionSnapshot(args));
  });
});
