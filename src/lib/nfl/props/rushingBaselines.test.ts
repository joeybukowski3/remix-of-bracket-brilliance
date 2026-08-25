import { describe, expect, it } from "vitest";
import { computeRushingBaselineConstants, predictRushingBaselineA, predictRushingBaselineB, predictRushingBaselineC, projectCarries, projectYpc } from "./rushingBaselines";
import type { NflRushingFeatureRow } from "./types/rushingFeatures";

function row(carriesPerGame: number | null, ypc: number | null, gamesWithCarries = 4): NflRushingFeatureRow {
  return {
    schemaVersion: "nfl-rushing-feature-row-v1", season: 2024, week: 5, gameId: "g1", team: "phi", opponent: "dal",
    playerId: "gsis:rb1", playerName: "RB One",
    target: { rushingYards: 60 },
    features: {
      playerUsage: { carriesPerGame: { seasonPrior: carriesPerGame, last3: carriesPerGame, priorSeason: null }, carryShare: { seasonPrior: null, last3: null, priorSeason: null } },
      playerEfficiency: { yardsPerCarry: { seasonPrior: ypc, last3: ypc, priorSeason: null } },
      teamEnvironment: { rushAttemptsPerGame: { seasonPrior: 26, last3: 26, priorSeason: 24 }, overallDropbackRate: { seasonPrior: 0.58, last3: 0.58, priorSeason: 0.55 }, passRateOverExpected: { seasonPrior: 1, last3: 1, priorSeason: 0.5 } },
      opponentRushDefense: { rushAttemptsPerGameAllowed: { seasonPrior: 25, last3: 25, priorSeason: 24 }, rushEpaPerPlayAllowed: { seasonPrior: 0.02, last3: 0.02, priorSeason: null } },
      market: { spread: -3, total: 45, impliedTeamTotal: 24, homeAway: "home", isDome: false },
    },
    diagnostics: { position: "RB", isQb: false, gamesWithCarriesPriorThisSeason: gamesWithCarries, hasPriorSeasonCarries: gamesWithCarries > 0, recentTeamTopCarryShareConcentration: 0.6 },
  };
}

describe("computeRushingBaselineConstants", () => {
  it("is deterministic given the same train rows", () => {
    const rows = [row(14, 4.3), row(10, 3.9)];
    expect(computeRushingBaselineConstants(rows)).toEqual(computeRushingBaselineConstants(rows));
  });
});

describe("rushing baselines A/B/C", () => {
  const constants = { leagueMeanRushingYards: 45, leagueMeanYardsPerCarry: 4.2 };

  it("Baseline A returns the constant", () => {
    expect(predictRushingBaselineA(row(14, 4.3), constants)).toBe(45);
  });

  it("Baseline B multiplies raw rolling carries x raw rolling YPC when both exist", () => {
    expect(predictRushingBaselineB(row(14, 4.3), constants)).toBeCloseTo(14 * 4.3, 10);
  });

  it("Baseline B falls back to the league mean when usage data is entirely absent (zero/missing-carry handling)", () => {
    expect(predictRushingBaselineB(row(null, null), constants)).toBe(45);
  });

  it("projectYpc and projectCarries never divide by zero or produce NaN with no history", () => {
    const noHistory = row(null, null, 0);
    expect(Number.isFinite(projectYpc(noHistory, constants))).toBe(true);
    expect(Number.isFinite(projectCarries(noHistory, 12))).toBe(true);
    expect(projectCarries(noHistory, 12)).toBe(12);
  });

  it("Baseline C multiplies projectedCarries x projectedYPC and is finite even with sparse data", () => {
    const result = predictRushingBaselineC(row(14, 4.3), constants, 12);
    expect(result.predicted).toBeCloseTo(result.projectedCarries * result.projectedYpc, 10);
    const sparse = predictRushingBaselineC(row(null, null, 0), constants, 12);
    expect(Number.isFinite(sparse.predicted)).toBe(true);
  });
});
