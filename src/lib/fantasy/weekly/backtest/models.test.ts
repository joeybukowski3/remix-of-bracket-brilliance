import { describe, expect, it } from "vitest";
import type { PregameFeatureSnapshot } from "./features";
import { chronologicalSplit, fitRidgeModel, scoreDirectBenchmark, scoreRidgeModel, selectRidgeLambda } from "./models";

function snapshot(season: number, week: number, value: number, actual = value * 2): PregameFeatureSnapshot {
  const rolling = {
    last1: value, last3: value, last5: value, seasonToDate: value,
    priorGames: Math.max(1, week - 1), availableGames: Math.max(1, week - 1),
  };
  return {
    schemaVersion: "weekly-backtest-features-v1", season, week, playerId: `gsis:${season}-${week}-${value}`,
    playerName: "Fixture", position: "QB", team: "det", opponent: "gb", actualFantasyPoints: actual,
    baseline: { priorSeasonPpg: value, rollingPpg: rolling },
    usage: {
      snapShare: rolling, passAttempts: rolling, rushAttempts: rolling, targets: rolling,
      receptions: rolling, targetShare: rolling, airYardsShare: rolling,
    },
    matchup: { priorSeasonFpaPerGame: value, priorSeasonFpaRank: 10, currentSeasonFpaPerGame: value, currentSeasonFpaRank: 10 },
    teamEnvironment: { offensiveEpaPerPlay: value, passingEpaPerPlay: value, rushingEpaPerPlay: value, playsPerGame: value, opponentEpaAllowedPerPlay: value },
    market: { gameTotal: value, teamImpliedTotal: value, opponentImpliedTotal: value, homeSpread: 0, source: "fixture", capturedAt: "2024-01-01T00:00:00.000Z", excludedReason: null },
    cutoffs: { playerHistoryLatest: { season, week: week - 1 }, matchupHistoryLatest: { season, week: week - 1 }, teamHistoryLatest: { season, week: week - 1 } },
    missingFeatures: [],
  };
}

describe("interpretable chronological backtest models", () => {
  it("fits deterministic ridge coefficients only from complete training rows", () => {
    const rows = [1, 2, 3, 4].map((value) => snapshot(2023, value + 1, value));
    const first = fitRidgeModel(rows, ["seasonToDatePpg"], 0.1);
    const second = fitRidgeModel(rows, ["seasonToDatePpg"], 0.1);
    expect(first).toEqual(second);
    expect(scoreRidgeModel(first, snapshot(2024, 2, 5))).toBeGreaterThan(scoreRidgeModel(first, snapshot(2024, 2, 1))!);
  });

  it("does not inject an average when a fitted feature is missing", () => {
    const model = fitRidgeModel([1, 2, 3].map((value) => snapshot(2023, value + 1, value)), ["seasonToDatePpg"], 1);
    const missing = snapshot(2024, 2, 1);
    missing.baseline.rollingPpg.seasonToDate = null;
    expect(scoreRidgeModel(model, missing)).toBeNull();
  });

  it("keeps the 2025 holdout completely outside training and validation", () => {
    const split = chronologicalSplit([snapshot(2025, 1, 3), snapshot(2023, 1, 1), snapshot(2024, 1, 2)]);
    expect(split.training.map((row) => row.season)).toEqual([2023]);
    expect(split.validation.map((row) => row.season)).toEqual([2024]);
    expect(split.holdout.map((row) => row.season)).toEqual([2025]);
  });

  it("selects regularization from validation without reading holdout rows", () => {
    const training = [1, 2, 3, 4].map((value) => snapshot(2023, value + 1, value));
    const validation = [1, 2, 3, 4].map((value) => snapshot(2024, value + 1, value));
    expect(selectRidgeLambda(training, validation, ["seasonToDatePpg"]).lambda).toBe(0.01);
  });

  it("reproduces the existing fixed 16-0 FPA challenger without changing it", () => {
    const easy = snapshot(2024, 2, 10);
    easy.matchup.currentSeasonFpaRank = 1;
    const hard = snapshot(2024, 2, 10);
    hard.matchup.currentSeasonFpaRank = 32;
    expect(scoreDirectBenchmark("baseline-b-16-0", easy)).toBeCloseTo(10.7);
    expect(scoreDirectBenchmark("baseline-b-16-0", hard)).toBeCloseTo(9.3);
  });
});
