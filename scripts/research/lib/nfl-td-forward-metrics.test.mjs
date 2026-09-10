import { describe, expect, it } from "vitest";
import {
  brierScore,
  calibrationBins,
  expectedCalibrationError,
  flatStakeProfit,
  flatStakeRoi,
  logLoss,
  rocAuc,
  summarizeProbabilities,
} from "./nfl-td-forward-metrics.mjs";

describe("brierScore / logLoss", () => {
  it("computes Brier as mean squared error of the probability", () => {
    expect(brierScore([0.2, 0.8], [0, 1])).toBeCloseTo((0.04 + 0.04) / 2, 9);
  });
  it("computes log loss", () => {
    const expected = -(Math.log(1 - 0.25) + Math.log(0.75)) / 2;
    expect(logLoss([0.25, 0.75], [0, 1])).toBeCloseTo(expected, 9);
  });
  it("drops unpaired / non-binary entries", () => {
    expect(brierScore([0.2, null, 0.8], [0, 1, 1])).toBeCloseTo((0.04 + 0.04) / 2, 9);
  });
  it("returns null for an empty series", () => {
    expect(brierScore([], [])).toBeNull();
  });
});

describe("expectedCalibrationError", () => {
  it("is ~0 for a perfectly calibrated set", () => {
    // 100 predictions at 0.3, 30% actually positive
    const preds = Array(100).fill(0.3);
    const y = Array(100)
      .fill(0)
      .map((_, i) => (i < 30 ? 1 : 0));
    expect(expectedCalibrationError(preds, y)).toBeCloseTo(0, 6);
  });
  it("is positive when predictions are systematically low", () => {
    const preds = Array(100).fill(0.3);
    const y = Array(100)
      .fill(0)
      .map((_, i) => (i < 60 ? 1 : 0));
    expect(expectedCalibrationError(preds, y)).toBeCloseTo(0.3, 6);
  });
});

describe("rocAuc", () => {
  it("is 1 for perfectly separated scores", () => {
    expect(rocAuc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
  });
  it("is 0.5 for non-informative constant scores", () => {
    expect(rocAuc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5);
  });
  it("is null with only one class present", () => {
    expect(rocAuc([0.2, 0.8], [1, 1])).toBeNull();
  });
});

describe("calibrationBins", () => {
  it("bins predictions and reports per-bin actual rate", () => {
    const bins = calibrationBins([0.05, 0.06, 0.95, 0.96], [0, 0, 1, 1]);
    const first = bins[0];
    const last = bins[bins.length - 1];
    expect(first.n).toBe(2);
    expect(first.actualRate).toBe(0);
    expect(last.n).toBe(2);
    expect(last.actualRate).toBe(1);
  });
});

describe("summarizeProbabilities", () => {
  it("returns { n: 0 } for an empty series", () => {
    expect(summarizeProbabilities([], [])).toEqual({ n: 0 });
  });
  it("reports n, tdRate, meanPred and the calibration metrics", () => {
    const s = summarizeProbabilities([0.2, 0.4, 0.6, 0.8], [0, 0, 1, 1]);
    expect(s.n).toBe(4);
    expect(s.tdRate).toBe(0.5);
    expect(s.meanPred).toBe(0.5);
    expect(s.brier).not.toBeNull();
  });
});

describe("flatStakeProfit / flatStakeRoi", () => {
  it("wins pay the decimal profit, losses cost 1 unit", () => {
    expect(flatStakeProfit(150, 1)).toBeCloseTo(1.5, 9);
    expect(flatStakeProfit(-200, 1)).toBeCloseTo(0.5, 9);
    expect(flatStakeProfit(150, 0)).toBe(-1);
  });
  it("computes realized ROI over settled bets", () => {
    const rows = [
      { americanPrice: 100, actualTd: 1 }, // +1
      { americanPrice: 100, actualTd: 0 }, // -1
      { americanPrice: 100, actualTd: 0 }, // -1
    ];
    const r = flatStakeRoi(rows);
    expect(r.nBets).toBe(3);
    expect(r.totalProfit).toBe(-1);
    expect(r.roi).toBeCloseTo(-1 / 3, 4);
  });
  it("returns roi null with no settled bets", () => {
    expect(flatStakeRoi([]).roi).toBeNull();
  });
});
