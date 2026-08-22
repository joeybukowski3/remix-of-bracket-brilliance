import { describe, expect, it } from "vitest";
import { computeBrierScore, computeCalibrationBuckets, computeExpectedCalibrationError, computeIntervalCoverage, computeLogLoss } from "./probabilityEvaluation";

describe("computeBrierScore / computeLogLoss", () => {
  it("Brier score is 0 for perfect confident correct predictions", () => {
    expect(computeBrierScore([{ pHomeWin: 1, homeWon: true }, { pHomeWin: 0, homeWon: false }])).toBe(0);
  });

  it("Brier score is 0.25 for a coin-flip prediction", () => {
    expect(computeBrierScore([{ pHomeWin: 0.5, homeWon: true }])).toBeCloseTo(0.25, 10);
  });

  it("log loss penalizes confident wrong predictions heavily", () => {
    const confidentWrong = computeLogLoss([{ pHomeWin: 0.99, homeWon: false }]);
    const coinFlip = computeLogLoss([{ pHomeWin: 0.5, homeWon: false }]);
    expect(confidentWrong!).toBeGreaterThan(coinFlip!);
  });

  it("returns null for empty input rather than NaN", () => {
    expect(computeBrierScore([])).toBeNull();
    expect(computeLogLoss([])).toBeNull();
  });
});

describe("computeCalibrationBuckets / computeExpectedCalibrationError", () => {
  it("buckets by the favored side's probability and measures its win rate", () => {
    const rows = [
      { pHomeWin: 0.92, homeWon: true },
      { pHomeWin: 0.91, homeWon: true },
      { pHomeWin: 0.08, homeWon: true }, // away favored at 0.92, but home won -> favored side lost
    ];
    const buckets = computeCalibrationBuckets(rows);
    const bucket90plus = buckets.find((b) => b.label === "90+")!;
    expect(bucket90plus.n).toBe(3);
    expect(bucket90plus.empiricalWinRate).toBeCloseTo(2 / 3, 5);
  });

  it("ECE is 0 for perfectly calibrated buckets", () => {
    const buckets = [{ label: "x", n: 10, meanPredicted: 0.7, empiricalWinRate: 0.7 }];
    expect(computeExpectedCalibrationError(buckets)).toBeCloseTo(0, 10);
  });
});

describe("computeIntervalCoverage", () => {
  it("computes empirical coverage as fraction of actuals within interval", () => {
    const rows = [
      { actual: 5, interval: [0, 10] as [number, number] },
      { actual: 15, interval: [0, 10] as [number, number] },
    ];
    const result = computeIntervalCoverage(rows);
    expect(result.coverage).toBeCloseTo(0.5, 10);
    expect(result.meanWidth).toBeCloseTo(10, 10);
  });
});
