import { describe, expect, it } from "vitest";
import { buildGameJoinIndex } from "../historicalOutcomes";
import type { NflRushingOutcome } from "../types/rushingOutcome";
import type { NflReceivingOutcome } from "../types/receivingOutcome";
import {
  buildReceivingShareRows,
  buildRushShareRows,
  buildTeamPositionalPools,
  type NflPoolPlayVolume,
  type NflPoolTeamWeek,
  type NflWeeklyRosterEntry,
} from "./dataset";

const GAMES = [
  { gameId: "2024_01_AAA_BBB", season: 2024, week: 1, seasonType: "REG", homeAbbr: "buf", awayAbbr: "ari", dateUtc: "2024-09-08T17:00:00.000Z" },
  { gameId: "2024_02_BBB_AAA", season: 2024, week: 2, seasonType: "REG", homeAbbr: "ari", awayAbbr: "buf", dateUtc: "2024-09-15T17:00:00.000Z" },
];

function rush(o: Partial<NflRushingOutcome> & Pick<NflRushingOutcome, "week" | "gameId" | "playerId" | "position" | "carries">): NflRushingOutcome {
  return {
    schemaVersion: "nfl-rushing-outcome-v1",
    season: 2024,
    team: "ari",
    opponent: "buf",
    playerName: o.playerId,
    rushingYards: o.carries * 4,
    yardsPerCarry: 4,
    teamRushAttemptsContext: null,
    carryShare: null,
    pregameEligible: true,
    ...o,
  } as NflRushingOutcome;
}
function rec(o: Partial<NflReceivingOutcome> & Pick<NflReceivingOutcome, "week" | "gameId" | "playerId" | "position" | "targets">): NflReceivingOutcome {
  return {
    schemaVersion: "nfl-receiving-outcome-v1",
    season: 2024,
    team: "ari",
    opponent: "buf",
    playerName: o.playerId,
    receptions: o.targets,
    receivingYards: o.targets * 8,
    receptionsPerTarget: o.targets > 0 ? 1 : null,
    yardsPerReception: o.targets > 0 ? 8 : null,
    yardsPerTarget: 8,
    teamPassAttemptsContext: 30,
    targetShare: null,
    zeroTargetFlag: o.targets === 0,
    membershipSource: "statsTable",
    ...o,
  } as NflReceivingOutcome;
}

const gameJoinIndex = buildGameJoinIndex(GAMES);

const pv = new Map<string, NflPoolPlayVolume>([
  ["2024_01_AAA_BBB|ari", { designedRushes: 24, dropbacks: 35 }],
  ["2024_02_BBB_AAA|ari", { designedRushes: 20, dropbacks: 40 }],
]);
const tw = new Map<string, NflPoolTeamWeek>([
  ["2024_01_AAA_BBB|ari", { teamPassAttempts: 30, sacks: 3, teamTargets: 29 }],
  ["2024_02_BBB_AAA|ari", { teamPassAttempts: 34, sacks: 2, teamTargets: 33 }],
]);

const week1Rush = [
  rush({ week: 1, gameId: "2024_01_AAA_BBB", playerId: "rb1", position: "RB", carries: 16 }),
  rush({ week: 1, gameId: "2024_01_AAA_BBB", playerId: "rb2", position: "RB", carries: 6 }),
  rush({ week: 1, gameId: "2024_01_AAA_BBB", playerId: "qb1", position: "QB", carries: 5 }),
];
const week2Rush = [
  rush({ week: 2, gameId: "2024_02_BBB_AAA", playerId: "rb1", position: "RB", carries: 14 }),
  rush({ week: 2, gameId: "2024_02_BBB_AAA", playerId: "rb2", position: "RB", carries: 4 }),
  rush({ week: 2, gameId: "2024_02_BBB_AAA", playerId: "qb1", position: "QB", carries: 4 }),
];

describe("buildTeamPositionalPools", () => {
  const pools = buildTeamPositionalPools({
    rushingOutcomes: [...week1Rush, ...week2Rush],
    playVolumeByTeamGame: pv,
    teamWeekByTeamGame: tw,
    gameJoinIndex,
  });

  it("derives the QB designed-rush pool as the residual of designed rushes minus RB/WR-TE carries", () => {
    const w1 = pools.find((p) => p.week === 1)!;
    expect(w1.scrambles).toBe(35 - 30 - 3); // 2 — still recorded (used by targetable approach B)
    expect(w1.qbDesignedRushes).toBe(Math.min(5, 24 - 22 - 0)); // min(qbCarries, designed - rb - wrTe) = 2
    expect(w1.rushPools).toEqual({ qb: 2, rb: 22, wrTe: 0 });
  });

  it("emits renormalised pool shares that sum to exactly 1", () => {
    for (const p of pools) {
      const s = p.rushPoolShares.qb + p.rushPoolShares.rb + p.rushPoolShares.wrTe;
      expect(s).toBeCloseTo(1, 12);
    }
  });

  it("reports pool coverage and residual explicitly (residual definition covers exactly when RB+WR-TE <= designed)", () => {
    const w1 = pools.find((p) => p.week === 1)!;
    expect(w1.poolCoverageRatio).toBeCloseTo(1, 6); // (2+22)/24
    expect(w1.residualDesignedRushes).toBeCloseTo(0, 6);
  });

  it("computes the actual targetable ratio", () => {
    const w1 = pools.find((p) => p.week === 1)!;
    expect(w1.targetable.ratioActual).toBeCloseTo(30 / 35, 6);
  });
});

describe("buildRushShareRows role evidence", () => {
  const pools = buildTeamPositionalPools({
    rushingOutcomes: [...week1Rush, ...week2Rush],
    playVolumeByTeamGame: pv,
    teamWeekByTeamGame: tw,
    gameJoinIndex,
  });
  const rosterTeamBySeasonWeekPlayer = new Map<string, string>([
    ["2024|2|rb1", "ari"],
    ["2024|2|rb2", "ari"],
  ]);
  const rosterByTeamWeek = new Map<string, NflWeeklyRosterEntry[]>([
    ["2024|2|ari", [
      { season: 2024, week: 2, team: "ari", playerId: "rb1", position: "RB", status: "ACT" },
      { season: 2024, week: 2, team: "ari", playerId: "rb2", position: "RB", status: "ACT" },
    ]],
  ]);
  const rows = buildRushShareRows({
    rushingOutcomes: [...week1Rush, ...week2Rush],
    pools,
    gameJoinIndex,
    rosterTeamBySeasonWeekPlayer,
    rosterByTeamWeek,
    teamTopRbCarryShareByGameTeam: new Map(),
  });

  it("gives no prior-game rows no depth rank and marks them noHistory", () => {
    const w1rb1 = rows.find((r) => r.week === 1 && r.playerId === "rb1")!;
    expect(w1rb1.role.noHistory).toBe(true);
    expect(w1rb1.role.depthRankProxy).toBeNull();
  });

  it("ranks the higher-prior-share back as depth rank 1 in a later week", () => {
    const w2rb1 = rows.find((r) => r.week === 2 && r.playerId === "rb1")!;
    const w2rb2 = rows.find((r) => r.week === 2 && r.playerId === "rb2")!;
    expect(w2rb1.role.depthRankProxy).toBe(1);
    expect(w2rb1.role.isProjectedStarter).toBe(true);
    expect(w2rb2.role.depthRankProxy).toBe(2);
    expect(w2rb1.role.rosterCompetitionCount).toBe(2);
  });

  it("computes within-pool share against the RB pool, not the whole designed-rush pool", () => {
    const w1rb1 = rows.find((r) => r.week === 1 && r.playerId === "rb1")!;
    expect(w1rb1.shareOfPositionalPool).toBeCloseTo(16 / 22, 6);
    expect(w1rb1.shareOfDesignedRushes).toBeCloseTo(16 / 24, 6);
  });
});

describe("buildReceivingShareRows", () => {
  const week1Rec = [
    rec({ week: 1, gameId: "2024_01_AAA_BBB", playerId: "wr1", position: "WR", targets: 12 }),
    rec({ week: 1, gameId: "2024_01_AAA_BBB", playerId: "wr2", position: "WR", targets: 8 }),
  ];
  const pools = buildTeamPositionalPools({
    rushingOutcomes: [...week1Rush],
    playVolumeByTeamGame: pv,
    teamWeekByTeamGame: tw,
    gameJoinIndex,
  });
  const rows = buildReceivingShareRows({
    receivingOutcomes: week1Rec,
    pools,
    gameJoinIndex,
    rosterTeamBySeasonWeekPlayer: new Map(),
    rosterByTeamWeek: new Map(),
    teamTopTargetShareByGameTeam: new Map(),
  });

  it("shares are against team pass attempts (targetable), with a dropback share too", () => {
    const wr1 = rows.find((r) => r.playerId === "wr1")!;
    expect(wr1.shareOfTargetable).toBeCloseTo(12 / 30, 6);
    expect(wr1.shareOfDropbacks).toBeCloseTo(12 / 35, 6);
  });
});
