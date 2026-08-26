import { describe, expect, it } from "vitest";
import {
  aggregateFolds,
  runHistoricalBaselineBacktest,
  runUsageCapExperiment,
  selectedWeightingPairs,
  type BacktestCase,
} from "@/lib/fantasy/rosResearch/shadowBacktest";

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

const usgSeason = (season: number, targetShare: number | null) => ({
  season,
  gamesWithStats: 17,
  offensiveSnaps: { average: null, sampleSize: 0 },
  snapShare: { average: null, sampleSize: 0 },
  targets: { average: null, sampleSize: 0 },
  receptions: { average: null, sampleSize: 0 },
  rushAttempts: { average: null, sampleSize: 0 },
  targetShare: { average: targetShare, sampleSize: 17 },
  airYardsShare: { average: null, sampleSize: 0 },
});

describe("Phase 3B: runUsageCapExperiment", () => {
  const cases: BacktestCase[] = [
    {
      playerId: "p1", position: "WR",
      trainingSeasons: [
        { season: 2023, gamesPlayed: 17, totalFantasyPoints: 170, ppg: 10 },
        { season: 2024, gamesPlayed: 17, totalFantasyPoints: 340, ppg: 20 },
      ],
      trainingUsageSeasons: [usgSeason(2023, 0.1), usgSeason(2024, 0.3)] as never, // usage trend pushes the factor toward its cap
      labelSeason: 2025, labelPpg: 12,
    },
  ];

  it("tests every cap requested and reports a no-usage baseline for comparison", () => {
    const result = runUsageCapExperiment(cases, [0, 0.1]);
    expect(result.capsTested).toEqual([0, 0.1]);
    expect(result.byCap["0"].overall.n).toBe(1);
    expect(result.byCap["0.1"].overall.n).toBe(1);
    expect(result.noUsageBaseline.overall.n).toBe(1);
  });

  it("a cap of 0 produces the same prediction as no usage adjustment at all", () => {
    const result = runUsageCapExperiment(cases, [0]);
    expect(result.byCap["0"].overall.mae).toBeCloseTo(result.noUsageBaseline.overall.mae, 10);
  });

  it("a larger cap moves the prediction further from the unadjusted baseline for a player with a strong usage trend", () => {
    const result = runUsageCapExperiment(cases, [0.05, 0.15]);
    const cap05 = result.byCap["0.05"].overall.mae;
    const cap15 = result.byCap["0.15"].overall.mae;
    expect(cap05).not.toBeCloseTo(cap15, 5); // different caps must move the prediction differently
  });

  it("splits results by position", () => {
    const result = runUsageCapExperiment(cases, [0.1]);
    expect(result.byCap["0.1"].byPosition.WR?.n).toBe(1);
    expect(result.byCap["0.1"].byPosition.RB).toBeUndefined();
  });
});

describe("Phase 3B: selectedWeightingPairs / aggregateFolds", () => {
  it("builds one prediction/actual pair per case with a resolvable baseline", () => {
    const cases: BacktestCase[] = [
      { playerId: "p1", position: "WR", trainingSeasons: [{ season: 2024, gamesPlayed: 17, totalFantasyPoints: 340, ppg: 20 }], trainingUsageSeasons: [], labelSeason: 2025, labelPpg: 22 },
      { playerId: "rookie", position: "WR", trainingSeasons: [], trainingUsageSeasons: [], labelSeason: 2025, labelPpg: 15 },
    ];
    const pairs = selectedWeightingPairs(cases);
    expect(pairs).toHaveLength(1); // the rookie with no training seasons is excluded, not fabricated as a zero prediction
    expect(pairs[0]).toMatchObject({ playerId: "p1", predicted: 20, actual: 22 });
  });

  it("pools raw pairs across folds and recomputes metrics from the pooled set (not an average of per-fold MAEs)", () => {
    // fold 1: residuals 0 and 4 -> MAE 2. fold 2: residual 10 -> MAE 10.
    // A naive average of the two fold MAEs would be (2+10)/2 = 6; the true
    // pooled MAE over all three raw residuals is (0+4+10)/3 = 4.6667.
    const fold1Pairs = [
      { playerId: "a", position: "WR" as const, predicted: 10, actual: 10 },
      { playerId: "b", position: "WR" as const, predicted: 10, actual: 14 },
    ];
    const fold2Pairs = [{ playerId: "c", position: "RB" as const, predicted: 10, actual: 20 }];
    const result = aggregateFolds([
      { labelSeason: 2024, trainingSeasons: [2022, 2023], pairs: fold1Pairs },
      { labelSeason: 2025, trainingSeasons: [2023, 2024], pairs: fold2Pairs },
    ]);
    expect(result.perFold[0].metrics.mae).toBeCloseTo(2, 10);
    expect(result.perFold[1].metrics.mae).toBeCloseTo(10, 10);
    expect(result.aggregate.n).toBe(3);
    expect(result.aggregate.mae).toBeCloseTo(14 / 3, 10);
    expect(result.aggregate.mae).not.toBeCloseTo(6, 5); // proves it is NOT a naive average of the two fold MAEs
  });
});
