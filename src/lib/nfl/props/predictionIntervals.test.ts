import { describe, expect, it } from "vitest";
import { applyInterval, averageIntervalWidth, computeResidualQuantiles, realizedCoverage } from "./predictionIntervals";

describe("computeResidualQuantiles", () => {
  it("is deterministic given the same pairs", () => {
    const pairs = [{ actual: 10, predicted: 8 }, { actual: 5, predicted: 8 }, { actual: 20, predicted: 8 }, { actual: 8, predicted: 8 }];
    expect(computeResidualQuantiles(pairs, 0.9)).toEqual(computeResidualQuantiles(pairs, 0.9));
  });

  it("produces a symmetric-looking interval when residuals are symmetric around zero", () => {
    const pairs = [{ actual: 90, predicted: 100 }, { actual: 110, predicted: 100 }, { actual: 100, predicted: 100 }];
    const q = computeResidualQuantiles(pairs, 0.9);
    expect(q.lowQuantile).toBeLessThan(0);
    expect(q.highQuantile).toBeGreaterThan(0);
  });

  it("throws on an empty sample rather than fabricating a quantile", () => {
    expect(() => computeResidualQuantiles([], 0.9)).toThrow();
  });
});

describe("applyInterval", () => {
  it("clamps the low bound at zero for a yardage total (never negative)", () => {
    const quantiles = { nominalLevel: 0.9, lowQuantile: -50, highQuantile: 10, sampleSize: 10 };
    const interval = applyInterval(5, quantiles);
    expect(interval.low).toBe(0);
    expect(interval.high).toBe(15);
  });

  it("does not clamp when the interval is already non-negative", () => {
    const quantiles = { nominalLevel: 0.9, lowQuantile: -10, highQuantile: 20, sampleSize: 10 };
    const interval = applyInterval(50, quantiles);
    expect(interval.low).toBe(40);
    expect(interval.high).toBe(70);
  });
});

describe("realizedCoverage", () => {
  it("computes the true measured fraction covered, not the nominal level", () => {
    const quantiles = { nominalLevel: 0.9, lowQuantile: -5, highQuantile: 5, sampleSize: 10 };
    const heldOut = [
      { actual: 100, predicted: 100 }, // inside [95,105]
      { actual: 103, predicted: 100 }, // inside
      { actual: 200, predicted: 100 }, // outside
      { actual: 50, predicted: 100 },  // outside
    ];
    expect(realizedCoverage(heldOut, quantiles)).toBe(0.5);
  });

  it("returns 0 for an empty held-out sample rather than dividing by zero", () => {
    const quantiles = { nominalLevel: 0.9, lowQuantile: -5, highQuantile: 5, sampleSize: 10 };
    expect(realizedCoverage([], quantiles)).toBe(0);
  });
});

describe("averageIntervalWidth", () => {
  it("computes the mean of (high - low) across predictions", () => {
    const quantiles = { nominalLevel: 0.9, lowQuantile: -10, highQuantile: 10, sampleSize: 10 };
    const pairs = [{ predicted: 50 }, { predicted: 100 }];
    expect(averageIntervalWidth(pairs, quantiles)).toBe(20);
  });
});
