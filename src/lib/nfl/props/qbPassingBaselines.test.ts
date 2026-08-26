import { describe, expect, it } from "vitest";
import {
  computePassingBaselineConstants, predictPassingBaselineA, predictPassingBaselineB, predictPassingBaselineC,
  projectAttempts, projectYpa, shrinkTowardLeagueMean, YPA_SHRINKAGE_PRIOR_STRENGTH_GAMES,
} from "./qbPassingBaselines";
import type { NflQbPassingFeatureRow } from "./types/qbPassingFeatures";

function row(overrides: Partial<NflQbPassingFeatureRow["features"]["qbEfficiency"]> = {}, gamesStarted = 5, attemptsPerGame: number | null = 32): NflQbPassingFeatureRow {
  return {
    schemaVersion: "nfl-qb-passing-feature-row-v1", season: 2024, week: 6, gameId: "g1", team: "phi", opponent: "dal",
    primaryQbPlayerId: "gsis:qb1", primaryQbPlayerName: "QB One",
    target: { primaryQbPassingYards: 250 },
    features: {
      opportunity: {
        offensivePlaysPerGame: { seasonPrior: 62, last3: 62, priorSeason: 60 },
        passAttemptsPerGame: { seasonPrior: 34, last3: 34, priorSeason: 32 },
        qbAttemptsPerGame: { seasonPrior: attemptsPerGame, last3: attemptsPerGame, priorSeason: 30 },
      },
      qbEfficiency: { yardsPerAttempt: { seasonPrior: 7.5, last3: 7.5, priorSeason: 7.0 }, completionPct: { seasonPrior: 0.65, last3: 0.65, priorSeason: 0.63 }, ...overrides },
      qbRollingPassingYardsPerGame: { seasonPrior: 240, last3: 240, priorSeason: 220 },
      opponentPassDefense: { passAttemptsPerGameAllowed: { seasonPrior: 33, last3: 33, priorSeason: 31 }, overallDropbackRateAllowed: { seasonPrior: 0.55, last3: 0.55, priorSeason: 0.53 }, passEpaPerPlayAllowed: { seasonPrior: 0.05, last3: 0.05, priorSeason: 0.03 } },
      proePassTendency: { overallDropbackRate: { seasonPrior: 0.58, last3: 0.58, priorSeason: 0.55 }, earlyDownNeutralPassRate: { seasonPrior: 0.5, last3: 0.5, priorSeason: 0.48 }, passRateOverExpected: { seasonPrior: 1.5, last3: 1.5, priorSeason: 1.0 } },
      market: { spread: -3, total: 45, impliedTeamTotal: 24, homeAway: "home", isDome: false },
    },
    diagnostics: { instabilityCategory: "singleQbGame", primaryQbAttemptShare: 1, hasPriorSeasonStarts: true, gamesStartedPriorThisSeason: gamesStarted },
  };
}

describe("computePassingBaselineConstants", () => {
  it("computes league-mean passing yards and YPA from train rows only", () => {
    const rows = [row(), row(undefined, 5, 30)];
    const constants = computePassingBaselineConstants(rows);
    expect(constants.leagueMeanPassingYards).toBe(250);
    expect(constants.leagueMeanYardsPerAttempt).toBeCloseTo(7.5, 10);
  });
});

describe("predictPassingBaselineA/B", () => {
  it("Baseline A returns the constant regardless of the row", () => {
    const constants = { leagueMeanPassingYards: 220, leagueMeanYardsPerAttempt: 7 };
    expect(predictPassingBaselineA(row(), constants)).toBe(220);
  });

  it("Baseline B uses the QB's own rolling passing yards, falling back to league mean when unavailable", () => {
    const constants = { leagueMeanPassingYards: 220, leagueMeanYardsPerAttempt: 7 };
    expect(predictPassingBaselineB(row(), constants)).toBe(240);
    const noHistory = row();
    noHistory.features.qbRollingPassingYardsPerGame = { seasonPrior: null, last3: null, priorSeason: null };
    expect(predictPassingBaselineB(noHistory, constants)).toBe(220);
  });
});

describe("shrinkTowardLeagueMean", () => {
  it("returns exactly the league mean when weight is zero", () => {
    expect(shrinkTowardLeagueMean(15, 0, 7, 4)).toBe(7);
  });

  it("approaches the sample value as weight grows large relative to prior strength", () => {
    const shrunkSmall = shrinkTowardLeagueMean(10, 1, 7, YPA_SHRINKAGE_PRIOR_STRENGTH_GAMES);
    const shrunkLarge = shrinkTowardLeagueMean(10, 100, 7, YPA_SHRINKAGE_PRIOR_STRENGTH_GAMES);
    expect(Math.abs(shrunkLarge - 10)).toBeLessThan(Math.abs(shrunkSmall - 10));
  });

  it("is a weighted average, always between sample and league values", () => {
    const shrunk = shrinkTowardLeagueMean(10, 2, 6, 4);
    expect(shrunk).toBeGreaterThan(6);
    expect(shrunk).toBeLessThan(10);
  });
});

describe("projectYpa / projectAttempts (low-sample handling)", () => {
  it("falls back to the league-mean YPA when this QB has no efficiency history at all", () => {
    const noHistory = row();
    noHistory.features.qbEfficiency.yardsPerAttempt = { seasonPrior: null, last3: null, priorSeason: null };
    const constants = { leagueMeanPassingYards: 220, leagueMeanYardsPerAttempt: 6.9 };
    expect(projectYpa(noHistory, constants)).toBe(6.9);
  });

  it("shrinks a low-sample (few games started) YPA toward the league mean rather than trusting it fully", () => {
    const constants = { leagueMeanPassingYards: 220, leagueMeanYardsPerAttempt: 6.0 };
    const lowSample = row(undefined, 1); // gamesStartedPriorThisSeason = 1, yardsPerAttempt.seasonPrior = 7.5
    const highSample = row(undefined, 20);
    const shrunkLow = projectYpa(lowSample, constants);
    const shrunkHigh = projectYpa(highSample, constants);
    expect(shrunkLow).toBeGreaterThan(constants.leagueMeanYardsPerAttempt);
    expect(shrunkLow).toBeLessThan(7.5);
    expect(Math.abs(shrunkHigh - 7.5)).toBeLessThan(Math.abs(shrunkLow - 7.5));
  });

  it("projectAttempts falls back to the provided constant when the QB has no rolling attempts data", () => {
    const noHistory = row(undefined, 0, null);
    noHistory.features.opportunity.qbAttemptsPerGame.priorSeason = null;
    expect(projectAttempts(noHistory, 32)).toBe(32);
  });
});

describe("predictPassingBaselineC (decomposition)", () => {
  it("multiplies projectedAttempts x projectedYPA and reports both legs", () => {
    const constants = { leagueMeanPassingYards: 220, leagueMeanYardsPerAttempt: 6.9 };
    const result = predictPassingBaselineC(row(), constants, 32);
    expect(result.predicted).toBeCloseTo(result.projectedAttempts * result.projectedYpa, 10);
    expect(result.projectedAttempts).toBe(32); // seasonPrior attemptsPerGame
  });

  it("never divides by zero or produces NaN when attempts data is entirely absent", () => {
    const noHistory = row(undefined, 0, null);
    noHistory.features.qbEfficiency.yardsPerAttempt = { seasonPrior: null, last3: null, priorSeason: null };
    const constants = { leagueMeanPassingYards: 220, leagueMeanYardsPerAttempt: 6.9 };
    const result = predictPassingBaselineC(noHistory, constants, 30);
    expect(Number.isFinite(result.predicted)).toBe(true);
    expect(result.projectedAttempts).toBe(30);
    expect(result.projectedYpa).toBe(6.9);
  });
});
