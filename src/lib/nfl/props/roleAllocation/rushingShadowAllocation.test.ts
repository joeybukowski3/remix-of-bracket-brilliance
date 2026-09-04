import { describe, expect, it } from "vitest";
import {
  computeShadowRushingAllocationForTeam, type NflLiveRbRoleEvidence,
  RUSH_SHADOW_DOMINANT_ANCHOR, RUSH_SHADOW_NO_HISTORY_CAL, RUSH_SHADOW_TEAM_CHANGE_CAL,
} from "./rushingShadowAllocation";
import type { NflRushingShadowModel } from "./rushingShadowArtifact";
import type { NflTeamPoolTendencySourceRow } from "./poolModels";
import { classifyConflictLevel, computeNormalizedRoleConflictScore } from "../../research/rushingRoleConflictDiagnosticV2";

const POOL_ROWS: NflTeamPoolTendencySourceRow[] = Array.from({ length: 6 }, (_, i) => ({
  team: "DAL", season: 2024, week: i + 1, gameId: `2024_0${i + 1}_DAL_X`,
  gameDateUtc: `2024-09-${String(8 + i * 7).padStart(2, "0")}T17:00:00.000Z`,
  dropbacks: 34, teamPassAttempts: 30, sacks: 2, scrambles: 2,
  rushPools: { qb: 4, rb: 20, wrTe: 1 },
}));

function model(): NflRushingShadowModel {
  return {
    allocationModelVersion: "nfl-rushing-shrinkage-blend-shadow-v1.0.0",
    fit: {
      rankPrior: new Map([["rank:1", 0.55], ["rank:2", 0.28], ["rank:3", 0.1], ["rank:NA", 0.15]]),
      noHistoryPrior: 0.15, overallMean: 0.3, shrinkageK: 1, teamChangeRetainedGames: 1,
    },
    league: { rushPoolShares: { qb: 0.16, rb: 0.8, wrTe: 0.04 }, targetableRatio: 0.85, sackRate: 0.06, scrambleRate: 0.09 },
    leagueEfficiency: 4.2,
    poolRows: POOL_ROWS,
    datasetSeasons: [2022, 2023, 2024, 2025],
    fittedArtifactHash: "test-hash",
    trainedThroughSeason: 2025,
  };
}

function evidence(overrides: Partial<NflLiveRbRoleEvidence> = {}): NflLiveRbRoleEvidence {
  return {
    playerId: "p1", playerName: "Player One", team: "DAL", gameId: "2026_01_DAL_X", gameDateUtc: "2026-09-08T17:00:00.000Z",
    poolKey: "rb", depthRankProxy: 1, isProjectedStarter: true, priorShare: 0.55, priorGamesPlayed: 10,
    noHistory: false, limitedHistory: false, teamChanged: false, roleSourced: true, concentration: 0.7, rosterCompetitionCount: 3,
    ...overrides,
  };
}

const BASE_ARGS = { team: "DAL", season: 2026, week: 1, gameDateUtc: "2026-09-08T17:00:00.000Z", projectedDesignedRushes: 25 };

describe("computeShadowRushingAllocationForTeam", () => {
  it("allocates the RB sub-pool so shadow carries sum exactly to the projected RB pool size", () => {
    const evidenceRows = [
      evidence({ playerId: "rb1", depthRankProxy: 1, priorShare: 0.55 }),
      evidence({ playerId: "rb2", depthRankProxy: 2, priorShare: 0.3 }),
      evidence({ playerId: "rb3", depthRankProxy: 3, priorShare: 0.1 }),
    ];
    const result = computeShadowRushingAllocationForTeam({ ...BASE_ARGS, liveEvidence: evidenceRows, model: model() });
    const rbPlayers = result.players.filter((p) => p.poolKey === "rb");
    const totalCarries = rbPlayers.reduce((s, p) => s + (p.diagnostics.projectedCarries ?? 0), 0);
    expect(totalCarries).toBeCloseTo(result.poolSizes.rb, 6);
  });

  it("never produces a negative or NaN projected carries/share value", () => {
    const evidenceRows = [evidence({ playerId: "rb1" }), evidence({ playerId: "rb2", priorShare: null, noHistory: true, priorGamesPlayed: 0, depthRankProxy: null })];
    const result = computeShadowRushingAllocationForTeam({ ...BASE_ARGS, liveEvidence: evidenceRows, model: model() });
    for (const p of result.players) {
      expect(p.diagnostics.projectedCarries).not.toBeNull();
      expect(p.diagnostics.projectedCarries!).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p.diagnostics.projectedCarries!)).toBe(true);
      expect(p.diagnostics.finalProjectedShare).not.toBeNull();
      expect(p.diagnostics.finalProjectedShare!).toBeGreaterThanOrEqual(0);
      expect(p.diagnostics.finalProjectedShare!).toBeLessThanOrEqual(1);
    }
  });

  it("preserves teamChanged/roleSourced/noHistory verbatim in roleConfidenceEvidence", () => {
    const evidenceRows = [evidence({ playerId: "rb1", teamChanged: true, roleSourced: true, noHistory: false })];
    const result = computeShadowRushingAllocationForTeam({ ...BASE_ARGS, liveEvidence: evidenceRows, model: model() });
    const rb1 = result.players.find((p) => p.playerId === "rb1")!;
    expect(rb1.diagnostics.roleConfidenceEvidence.teamChanged).toBe(true);
    expect(rb1.diagnostics.roleConfidenceEvidence.roleSourced).toBe(true);
    expect(rb1.diagnostics.roleConfidenceEvidence.noHistory).toBe(false);
  });

  it("computes a nonzero roleConflictScore for a team-changed player whose usage disagrees with the current-role rank prior", () => {
    // priorShare 0.55 (old-team RB1 usage) vs rank:3 prior (0.1) -- large conflict.
    const evidenceRows = [evidence({ playerId: "rb1", teamChanged: true, roleSourced: true, depthRankProxy: 3, priorShare: 0.55 })];
    const result = computeShadowRushingAllocationForTeam({ ...BASE_ARGS, liveEvidence: evidenceRows, model: model() });
    const rb1 = result.players.find((p) => p.playerId === "rb1")!;
    expect(rb1.diagnostics.roleConflictScore).toBeCloseTo(Math.abs(0.55 - 0.1), 6);
    expect(rb1.diagnostics.roleConflictFlag).toBe(true);
  });

  it("is deterministic across repeated calls on identical inputs", () => {
    const evidenceRows = [evidence({ playerId: "rb1" }), evidence({ playerId: "rb2", priorShare: 0.2, depthRankProxy: 2 })];
    const args = { ...BASE_ARGS, liveEvidence: evidenceRows, model: model() };
    expect(computeShadowRushingAllocationForTeam(args)).toEqual(computeShadowRushingAllocationForTeam(args));
  });

  it("keeps qb/rb/wrTe sub-pools independently allocated (an rb-only evidence list does not touch qb/wrTe pool sizing)", () => {
    const evidenceRows = [evidence({ playerId: "rb1" })];
    const result = computeShadowRushingAllocationForTeam({ ...BASE_ARGS, liveEvidence: evidenceRows, model: model() });
    expect(result.players.every((p) => p.poolKey === "rb")).toBe(true);
    // qb/wrTe pool sizes are still reported (from WU4A's designed-rush split) even with no evidence rows for them.
    expect(result.poolSizes.qb).toBeGreaterThan(0);
    expect(result.poolSizes.wrTe).toBeGreaterThanOrEqual(0);
  });
});

describe("WU4F §17: David Montgomery / Woody Marks (HOU, 2026 week 1) regression", () => {
  it("orders the sourced-starter RB1 above the higher-usage non-starter RB2, using the real archived 2026 values", () => {
    // Real values pulled from data/nfl/predictions/2026/01/nfl-rushing-carries-x-shrunk-ypc.jsonl.
    // The PRODUCTION model (a separate, simpler regression -- see WU4F
    // checkpoint) gives Marks more carries than Montgomery despite
    // Montgomery being the sourced depth-rank-1 starter; this test proves
    // the EXISTING, unmodified shadow allocator already gets the ordering
    // right when it runs, via the same S5A/S5E machinery covered above --
    // no new role-mapping candidate was needed for this case.
    const montgomery = evidence({
      playerId: "montgomery", playerName: "David Montgomery", depthRankProxy: 1, isProjectedStarter: true,
      priorShare: 0.35759924358080797, priorGamesPlayed: 0, teamChanged: true, roleSourced: true, concentration: null, rosterCompetitionCount: null,
    });
    const marks = evidence({
      playerId: "marks", playerName: "Woody Marks", depthRankProxy: 2, isProjectedStarter: false,
      priorShare: 0.4888980468368514, priorGamesPlayed: 0, teamChanged: false, roleSourced: true, concentration: null, rosterCompetitionCount: null,
    });
    const result = computeShadowRushingAllocationForTeam({ ...BASE_ARGS, projectedDesignedRushes: 26.29, liveEvidence: [montgomery, marks], model: model() });
    const m = result.players.find((p) => p.playerId === "montgomery")!;
    const w = result.players.find((p) => p.playerId === "marks")!;

    expect(m.diagnostics.projectedCarries!).toBeGreaterThan(w.diagnostics.projectedCarries!);
    expect(m.diagnostics.teamChangeCalibrationApplied).toBe(true);
    // Old (production-shadow) boolean conflict flag: single threshold 0.1
    // against the OLD, cross-position rankPrior -- still correct and
    // unchanged by WU4F.1A; distinct from the new pool-scoped severity
    // checked below.
    expect(m.diagnostics.roleConflictFlag).toBe(true);
    expect(w.diagnostics.teamChangeCalibrationApplied).toBe(false);
  });

  it("WU4F.1A: canonical pool-scoped severity (Candidate A) classifies Montgomery's real conflict as MEDIUM, not HIGH", () => {
    // Real values: historical share 0.358 vs the real RB1 pool-scoped
    // prior 0.6685 (see rushingRoleConflictDiagnosticV2.test.ts and the
    // WU4F.1A checkpoint). This is the ONE canonical severity computation
    // -- classifyConflictLevel from rushingRoleConflictDiagnosticV2.ts.
    // WU4F.1's checkpoint mislabeled this HIGH by printing a different,
    // experimental (rank-order-escalated) value under a bare "level="
    // label; this test locks the corrected, canonical answer.
    const score = computeNormalizedRoleConflictScore(0.35759924358080797, 0.6685);
    expect(classifyConflictLevel(score)).toBe("medium");
  });
});

describe("frozen S5A/S5E calibration constants", () => {
  it("match the already-validated week1-candidate.ts values (never silently drift)", () => {
    expect(RUSH_SHADOW_DOMINANT_ANCHOR).toEqual({ minPriorGamesPlayed: 4, minConcentration: 0.6, minRawShare: 0.5, shareCap: 0.95, usePriorShare: true });
    expect(RUSH_SHADOW_NO_HISTORY_CAL).toEqual({ shareMultiplier: 0.55, rankBackoff: 0, rosterCompetitionRef: null });
    expect(RUSH_SHADOW_TEAM_CHANGE_CAL).toEqual({ carryover: 0.35, rankPriorBoost: 3, conflictThreshold: 0.08, requireSourced: true });
  });
});
