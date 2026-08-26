import { describe, expect, it } from "vitest";
import { runHistoricalBaselineBacktest, type BacktestCase } from "@/lib/fantasy/rosResearch/shadowBacktest";

function usageSeason(season: number, targetShare: number | null) {
  return {
    season,
    gamesWithStats: 17,
    offensiveSnaps: { average: null, sampleSize: 0 },
    snapShare: { average: null, sampleSize: 0 },
    targets: { average: null, sampleSize: 0 },
    receptions: { average: null, sampleSize: 0 },
    rushAttempts: { average: null, sampleSize: 0 },
    targetShare: { average: targetShare, sampleSize: 17 },
    airYardsShare: { average: null, sampleSize: 0 },
  };
}

describe("runHistoricalBaselineBacktest", () => {
  it("only uses training-season data to predict the label season (leakage-safe by construction)", () => {
    const cases: BacktestCase[] = [
      {
        playerId: "p1",
        position: "WR",
        trainingSeasons: [
          { season: 2023, gamesPlayed: 17, totalFantasyPoints: 170, ppg: 10 },
          { season: 2024, gamesPlayed: 17, totalFantasyPoints: 340, ppg: 20 },
        ],
        trainingUsageSeasons: [usageSeason(2023, 0.2), usageSeason(2024, 0.25)],
        labelSeason: 2025,
        labelPpg: 20,
      },
    ];
    const result = runHistoricalBaselineBacktest(cases, [2023, 2024]);
    expect(result.labelSeason).toBe(2025);
    // latest-season predicts 2024's 20 exactly against a 20 label -> zero error.
    expect(result.baselineWeighting["latest-season"].mae).toBeCloseTo(0, 10);
    expect(result.baselineWeighting["latest-season"].n).toBe(1);
  });

  it("computes MAE/RMSE/bias/correlation across multiple players", () => {
    const cases: BacktestCase[] = [
      {
        playerId: "p1", position: "WR",
        trainingSeasons: [{ season: 2024, gamesPlayed: 17, totalFantasyPoints: 340, ppg: 20 }],
        trainingUsageSeasons: [], labelSeason: 2025, labelPpg: 22,
      },
      {
        playerId: "p2", position: "RB",
        trainingSeasons: [{ season: 2024, gamesPlayed: 17, totalFantasyPoints: 170, ppg: 10 }],
        trainingUsageSeasons: [], labelSeason: 2025, labelPpg: 8,
      },
    ];
    const result = runHistoricalBaselineBacktest(cases, [2024]);
    const latest = result.baselineWeighting["latest-season"];
    expect(latest.n).toBe(2);
    expect(latest.mae).toBeCloseTo((Math.abs(20 - 22) + Math.abs(10 - 8)) / 2, 10);
    expect(latest.bias).toBeCloseTo(((20 - 22) + (10 - 8)) / 2, 10);
    expect(latest.positionalCalibration.WR).toEqual({ n: 1, meanPredicted: 20, meanActual: 22 });
  });

  it("excludes a player from a weighting's metrics when that weighting has no baseline for them, rather than fabricating a zero", () => {
    const cases: BacktestCase[] = [
      { playerId: "rookie", position: "WR", trainingSeasons: [], trainingUsageSeasons: [], labelSeason: 2025, labelPpg: 15 },
    ];
    const result = runHistoricalBaselineBacktest(cases, [2023, 2024]);
    expect(result.baselineWeighting["latest-season"].n).toBe(0);
    expect(Number.isNaN(result.baselineWeighting["latest-season"].mae)).toBe(true);
  });

  it("flags a large residual as an outlier", () => {
    const cases: BacktestCase[] = [
      {
        playerId: "p1", position: "WR",
        trainingSeasons: [{ season: 2024, gamesPlayed: 17, totalFantasyPoints: 510, ppg: 30 }],
        trainingUsageSeasons: [], labelSeason: 2025, labelPpg: 5,
      },
    ];
    const result = runHistoricalBaselineBacktest(cases, [2024]);
    expect(result.baselineWeighting["latest-season"].outliers).toHaveLength(1);
    expect(result.baselineWeighting["latest-season"].outliers[0]).toMatchObject({ playerId: "p1", predicted: 30, actual: 5 });
  });
});
