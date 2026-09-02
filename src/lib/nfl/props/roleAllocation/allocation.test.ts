import { describe, expect, it } from "vitest";
import {
  buildTeamPriorPoolTendency,
  computePoolLeagueConstants,
  projectRushPools,
  projectTargetablePass,
} from "./poolModels";
import { fitShareModel, predictRawShare, type NflShareObservation } from "./shareModels";
import { allocatePool, classifyRoleCohort, measureNormalizationDistortion } from "./allocate";
import type { NflTeamPositionalPoolRow } from "./types";

function poolRow(o: Partial<NflTeamPositionalPoolRow> & Pick<NflTeamPositionalPoolRow, "season" | "week" | "team" | "gameDateUtc">): NflTeamPositionalPoolRow {
  return {
    schemaVersion: "nfl-role-allocation-dataset-v1",
    gameId: `${o.season}_${String(o.week).padStart(2, "0")}_X_${o.team}`,
    opponent: "opp",
    designedRushes: 25,
    dropbacks: 38,
    teamPassAttempts: 32,
    sacks: 3,
    scrambles: 3,
    teamTargets: 30,
    rawCarries: { qb: 4, rb: 20, wrTe: 1 },
    qbDesignedRushes: 1,
    rushPools: { qb: 1, rb: 20, wrTe: 1 },
    poolCoverageRatio: 22 / 25,
    residualDesignedRushes: 3,
    rushPoolShares: { qb: 1 / 22, rb: 20 / 22, wrTe: 1 / 22 },
    targetable: { ratioActual: 32 / 38, sackRateActual: 3 / 38, scrambleRateActual: 3 / 38 },
    ...o,
  };
}

function obs(o: Partial<NflShareObservation> & Pick<NflShareObservation, "playerId" | "poolKey" | "depthRankProxy">): NflShareObservation {
  return {
    season: 2025,
    week: 5,
    gameId: "2025_05_X_aaa",
    team: "aaa",
    playerName: o.playerId,
    poolId: `2025_05_X_aaa|${o.poolKey}`,
    rankKey: o.poolKey === "receiving" ? `WR:${o.depthRankProxy ?? "NA"}` : `rank:${o.depthRankProxy ?? "NA"}`,
    isProjectedStarter: o.depthRankProxy === 1,
    priorShare: null,
    priorGamesPlayed: 0,
    noHistory: false,
    limitedHistory: false,
    teamChanged: false,
    concentration: null,
    priorEfficiency: 4.3,
    actualShare: null,
    actualVolume: 0,
    actualYards: 0,
    context: { teamDesignedRushes: 25, teamDropbacks: 38, poolActual: 20, gameDateUtc: "2025-10-01T17:00:00.000Z" },
    ...o,
  };
}

const league = computePoolLeagueConstants([
  poolRow({ season: 2024, week: 1, team: "aaa", gameDateUtc: "2024-09-08T17:00:00.000Z" }),
  poolRow({ season: 2024, week: 2, team: "bbb", gameDateUtc: "2024-09-15T17:00:00.000Z", rushPools: { qb: 6, rb: 18, wrTe: 1 } }),
]);

describe("poolModels — rush 3-pool split", () => {
  it("splits a finite designed-rush pool into three sub-pools that sum back exactly", () => {
    const tendency = buildTeamPriorPoolTendency(
      [poolRow({ season: 2025, week: 1, team: "aaa", gameDateUtc: "2025-09-07T17:00:00.000Z", rushPools: { qb: 5, rb: 18, wrTe: 2 } })],
      "aaa",
      2025,
      2,
      "2025-09-14T17:00:00.000Z",
    );
    const pools = projectRushPools(26, tendency, league);
    expect(pools.qb + pools.rb + pools.wrTe).toBeCloseTo(26, 9);
    expect(pools.shares.qb + pools.shares.rb + pools.shares.wrTe).toBeCloseTo(1, 12);
    expect(pools.rb).toBeGreaterThan(pools.qb);
  });

  it("falls back to the league split when the team has no prior window", () => {
    const tendency = buildTeamPriorPoolTendency([], "zzz", 2025, 1, "2025-09-07T17:00:00.000Z");
    const pools = projectRushPools(24, tendency, league);
    expect(pools.usedLeaguePrior).toBe(true);
    expect(pools.qb + pools.rb + pools.wrTe).toBeCloseTo(24, 9);
  });
});

describe("poolModels — targetable pass reductions", () => {
  const tendency = buildTeamPriorPoolTendency(
    [poolRow({ season: 2025, week: 1, team: "aaa", gameDateUtc: "2025-09-07T17:00:00.000Z" })],
    "aaa",
    2025,
    2,
    "2025-09-14T17:00:00.000Z",
  );
  it("calibratedRatio reduces dropbacks below the dropback count", () => {
    const p = projectTargetablePass("calibratedRatio", 40, tendency, league);
    expect(p.projectedTargetable).toBeLessThan(40);
    expect(p.impliedRatio).toBeGreaterThan(0.5);
    expect(p.impliedRatio).toBeLessThanOrEqual(1);
  });
  it("sacksScrambles subtracts an expected-sack and expected-scramble rate", () => {
    const p = projectTargetablePass("sacksScrambles", 40, tendency, league);
    expect(p.components.sackRate).toBeGreaterThan(0);
    expect(p.components.scrambleRate).toBeGreaterThan(0);
    expect(p.projectedTargetable).toBeLessThan(40);
  });
});

describe("allocatePool — finite-pool coherence", () => {
  const fit = fitShareModel(
    [
      obs({ playerId: "s", poolKey: "rb", depthRankProxy: 1, actualShare: 0.62, priorShare: 0.62, priorGamesPlayed: 8 }),
      obs({ playerId: "b", poolKey: "rb", depthRankProxy: 2, actualShare: 0.28, priorShare: 0.28, priorGamesPlayed: 8 }),
      obs({ playerId: "c", poolKey: "rb", depthRankProxy: 3, actualShare: 0.1, priorShare: 0.1, priorGamesPlayed: 8 }),
    ],
    2,
  );

  it("projected volume sums to exactly the pool, with no negative or >1 shares", () => {
    const players = [
      obs({ playerId: "s", poolKey: "rb", depthRankProxy: 1, priorShare: 0.6, priorGamesPlayed: 6 }),
      obs({ playerId: "b", poolKey: "rb", depthRankProxy: 2, priorShare: 0.3, priorGamesPlayed: 6 }),
      obs({ playerId: "c", poolKey: "rb", depthRankProxy: 3, priorShare: 0.12, priorGamesPlayed: 6 }),
    ];
    const alloc = allocatePool(players, 21, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3);
    expect(alloc.coherence.volumeResidual).toBeCloseTo(0, 9);
    expect(alloc.coherence.anyNegativeShare).toBe(false);
    expect(alloc.coherence.anyShareOverOne).toBe(false);
    expect(alloc.coherence.shareSum).toBeCloseTo(1, 9);
  });

  it("splits equally when every player has no usable history", () => {
    const players = [
      obs({ playerId: "x", poolKey: "rb", depthRankProxy: null, noHistory: true }),
      obs({ playerId: "y", poolKey: "rb", depthRankProxy: null, noHistory: true }),
    ];
    const emptyFit = fitShareModel([], 2);
    const alloc = allocatePool(players, 20, (o) => predictRawShare("depthPrior", emptyFit, o), 4.3);
    expect(alloc.players.every((p) => Math.abs(p.projectedVolume - 10) < 1e-9)).toBe(true);
  });
});

describe("Marks / Montgomery structural regression fixture", () => {
  // Deterministic fitted rank priors: rank 1 earns materially more of the RB pool than rank 2.
  const fit = fitShareModel(
    [
      obs({ playerId: "r1a", poolKey: "rb", depthRankProxy: 1, actualShare: 0.6, priorShare: 0.6, priorGamesPlayed: 10 }),
      obs({ playerId: "r1b", poolKey: "rb", depthRankProxy: 1, actualShare: 0.64, priorShare: 0.64, priorGamesPlayed: 10 }),
      obs({ playerId: "r2a", poolKey: "rb", depthRankProxy: 2, actualShare: 0.3, priorShare: 0.3, priorGamesPlayed: 10 }),
      obs({ playerId: "r2b", poolKey: "rb", depthRankProxy: 2, actualShare: 0.26, priorShare: 0.26, priorGamesPlayed: 10 }),
    ],
    2,
  );

  it("with role evidence agreeing, the depth-rank-1 back outprojects the depth-rank-2 back when player histories are comparable", () => {
    // Montgomery: current RB1, modest recent share. Marks: current RB2, comparable recent share earned partly elsewhere.
    const montgomery = obs({ playerId: "montgomery", poolKey: "rb", depthRankProxy: 1, priorShare: 0.42, priorGamesPlayed: 3, teamChanged: false });
    const marks = obs({ playerId: "marks", poolKey: "rb", depthRankProxy: 2, priorShare: 0.44, priorGamesPlayed: 3, teamChanged: true });
    const alloc = allocatePool([montgomery, marks], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3);
    const m = alloc.players.find((p) => p.obs.playerId === "montgomery")!;
    const w = alloc.players.find((p) => p.obs.playerId === "marks")!;
    expect(m.projectedVolume).toBeGreaterThan(w.projectedVolume);
    expect(m.projectedVolume + w.projectedVolume).toBeCloseTo(22, 9); // finite pool — OLD per-player model had no such constraint
  });

  it("does NOT force global RB2 < RB1: a back with a genuinely dominant recent workload can still lead (documented, not a bug)", () => {
    const montgomery = obs({ playerId: "montgomery", poolKey: "rb", depthRankProxy: 1, priorShare: 0.2, priorGamesPlayed: 2 });
    const marks = obs({ playerId: "marks", poolKey: "rb", depthRankProxy: 2, priorShare: 0.8, priorGamesPlayed: 6 });
    const alloc = allocatePool([montgomery, marks], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3);
    const m = alloc.players.find((p) => p.obs.playerId === "montgomery")!;
    const w = alloc.players.find((p) => p.obs.playerId === "marks")!;
    expect(w.projectedVolume).toBeGreaterThan(m.projectedVolume);
  });
});

describe("vacated opportunity emerges from allocation, not player exceptions", () => {
  const fit = fitShareModel(
    [
      obs({ playerId: "a", poolKey: "rb", depthRankProxy: 1, actualShare: 0.62, priorShare: 0.62, priorGamesPlayed: 10 }),
      obs({ playerId: "b", poolKey: "rb", depthRankProxy: 2, actualShare: 0.3, priorShare: 0.3, priorGamesPlayed: 10 }),
    ],
    2,
  );
  const rb1 = obs({ playerId: "rb1", poolKey: "rb", depthRankProxy: 1, priorShare: 0.62, priorGamesPlayed: 8 });
  const incumbent = obs({ playerId: "incumbent", poolKey: "rb", depthRankProxy: 2, priorShare: 0.28, priorGamesPlayed: 8 });

  it("when the departed RB1 is removed from the eligible set the pool is fully reabsorbed and the incumbent inherits material volume", () => {
    const withRb1 = allocatePool([rb1, incumbent], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3);
    const withoutRb1 = allocatePool([incumbent], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3);
    const incBefore = withRb1.players.find((p) => p.obs.playerId === "incumbent")!.projectedVolume;
    const incAfter = withoutRb1.players.find((p) => p.obs.playerId === "incumbent")!.projectedVolume;
    expect(incAfter).toBeGreaterThan(incBefore);
    expect(withoutRb1.coherence.volumeResidual).toBeCloseTo(0, 9); // no opportunity vanishes
    expect(incAfter).toBeCloseTo(22, 9);
  });

  it("a rookie with no history but depth rank 1 can inherit the pool when it is the only evidence", () => {
    const rookie = obs({ playerId: "rookie", poolKey: "rb", depthRankProxy: 1, noHistory: true });
    const backup = obs({ playerId: "backup", poolKey: "rb", depthRankProxy: 2, priorShare: 0.2, priorGamesPlayed: 4 });
    const alloc = allocatePool([rookie, backup], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3);
    const r = alloc.players.find((p) => p.obs.playerId === "rookie")!;
    expect(r.projectedVolume).toBeGreaterThan(0);
    expect(r.projectedVolume).toBeGreaterThan(alloc.players.find((p) => p.obs.playerId === "backup")!.projectedVolume);
  });
});

describe("S5A — dominant anchor calibration", () => {
  const fit = fitShareModel(
    [
      obs({ playerId: "w", poolKey: "rb", depthRankProxy: 1, actualShare: 0.8, priorShare: 0.8, priorGamesPlayed: 12 }),
      obs({ playerId: "b", poolKey: "rb", depthRankProxy: 2, actualShare: 0.2, priorShare: 0.2, priorGamesPlayed: 12 }),
    ],
    1,
  );
  const anchor = { minPriorGamesPlayed: 4, minRawShare: 0.5, minConcentration: 0.6, shareCap: 0.95, usePriorShare: true };
  const workhorse = obs({ playerId: "w", poolKey: "rb", depthRankProxy: 1, isProjectedStarter: true, priorShare: 0.82, priorGamesPlayed: 10, concentration: 0.78 });
  const back2 = obs({ playerId: "b", poolKey: "rb", depthRankProxy: 2, priorShare: 0.3, priorGamesPlayed: 10, concentration: 0.78 });

  it("protects a strongly-supported dominant back from proportional compression, still exactly coherent", () => {
    const plain = allocatePool([workhorse, back2], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3, null);
    const anchored = allocatePool([workhorse, back2], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3, anchor);
    const wPlain = plain.players.find((p) => p.obs.playerId === "w")!.normalizedShare;
    const wAnch = anchored.players.find((p) => p.obs.playerId === "w")!.normalizedShare;
    expect(wAnch).toBeGreaterThan(wPlain);
    expect(anchored.coherence.volumeResidual).toBeCloseTo(0, 9);
    expect(anchored.coherence.shareSum).toBeCloseTo(1, 9);
    expect(anchored.coherence.anyShareOverOne).toBe(false);
  });

  it("never lets the anchored share exceed the cap", () => {
    const anchored = allocatePool([workhorse, back2], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3, { ...anchor, shareCap: 0.7 });
    expect(anchored.players.find((p) => p.obs.playerId === "w")!.normalizedShare).toBeLessThanOrEqual(0.7 + 1e-9);
  });

  it("does not fire when the evidence gates are not met (low concentration)", () => {
    const committeeBack = obs({ playerId: "w", poolKey: "rb", depthRankProxy: 1, isProjectedStarter: true, priorShare: 0.55, priorGamesPlayed: 10, concentration: 0.45 });
    const plain = allocatePool([committeeBack, back2], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3, null);
    const anchored = allocatePool([committeeBack, back2], 22, (o) => predictRawShare("shrinkageBlend", fit, o), 4.3, anchor);
    expect(anchored.players[0].normalizedShare).toBeCloseTo(plain.players[0].normalizedShare, 9);
  });
});

describe("S5A — no-history prior calibration", () => {
  const fit = fitShareModel(
    [
      obs({ playerId: "s", poolKey: "rb", depthRankProxy: 1, actualShare: 0.6, priorShare: 0.6, priorGamesPlayed: 10 }),
      obs({ playerId: "b", poolKey: "rb", depthRankProxy: 2, actualShare: 0.3, priorShare: 0.3, priorGamesPlayed: 10 }),
    ],
    1,
  );
  it("shrinks an uncertain no-history player's share below the raw depth-rank prior", () => {
    const rookie = obs({ playerId: "r", poolKey: "rb", depthRankProxy: 1, noHistory: true, rosterCompetitionCount: 4 });
    const base = predictRawShare("shrinkageBlend", fit, rookie, null);
    const calibrated = predictRawShare("shrinkageBlend", fit, rookie, { shareMultiplier: 0.55, rankBackoff: 0, rosterCompetitionRef: 3 });
    expect(calibrated).toBeLessThan(base);
    expect(calibrated).toBeCloseTo(base * 0.55 * (3 / 4), 6);
  });
});

describe("normalization distortion is measurable per cohort", () => {
  it("classifies role cohorts deterministically and reports a share shift", () => {
    expect(classifyRoleCohort(obs({ playerId: "z", poolKey: "rb", depthRankProxy: 1, isProjectedStarter: true, concentration: 0.8 }))).toBe("dominantRb1");
    expect(classifyRoleCohort(obs({ playerId: "z", poolKey: "rb", depthRankProxy: 5, priorShare: 0.02, priorGamesPlayed: 3 }))).toBe("lowVolumeBackup");
    const alloc = allocatePool(
      [
        obs({ playerId: "s", poolKey: "rb", depthRankProxy: 1, priorShare: 0.9, priorGamesPlayed: 6, concentration: 0.85, isProjectedStarter: true }),
        obs({ playerId: "b", poolKey: "rb", depthRankProxy: 2, priorShare: 0.9, priorGamesPlayed: 6, concentration: 0.4 }),
      ],
      20,
      (o) => o.priorShare ?? 0,
      4.3,
    );
    const dist = measureNormalizationDistortion([alloc]);
    expect(dist.length).toBeGreaterThan(0);
    expect(dist.every((d) => Number.isFinite(d.meanShift))).toBe(true);
  });
});
