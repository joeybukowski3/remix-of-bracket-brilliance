import { describe, expect, it } from "vitest";
import { bias, directionHitRate, fitOls, incrementalR2, mae, pearsonCorrelation, rmse } from "./nfl-research-metrics.mjs";

describe("mae/rmse/bias", () => {
  const actuals = [100, 200, 300];
  const predictions = [110, 190, 320];

  it("computes MAE", () => {
    expect(mae(actuals, predictions)).toBeCloseTo((10 + 10 + 20) / 3, 5);
  });

  it("computes RMSE", () => {
    expect(rmse(actuals, predictions)).toBeCloseTo(Math.sqrt((100 + 100 + 400) / 3), 5);
  });

  it("computes bias as mean(prediction - actual)", () => {
    expect(bias(actuals, predictions)).toBeCloseTo((10 - 10 + 20) / 3, 5);
  });

  it("skips null-paired entries", () => {
    expect(mae([100, null, 300], [110, 999, 320])).toBeCloseTo((10 + 20) / 2, 5);
  });

  it("returns null for an empty series", () => {
    expect(mae([], [])).toBeNull();
  });
});

describe("pearsonCorrelation", () => {
  it("returns 1 for a perfect positive linear relationship", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 8);
  });

  it("returns -1 for a perfect negative linear relationship", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 8);
  });

  it("returns null when fewer than 2 paired points exist", () => {
    expect(pearsonCorrelation([1], [1])).toBeNull();
  });
});

describe("directionHitRate", () => {
  it("computes hit rate excluding pushes", () => {
    const predicted = ["over", "under", "over", "under"];
    const actual = ["over", "over", "push", "under"];
    const { n, hitRate } = directionHitRate(predicted, actual);
    expect(n).toBe(3); // push excluded
    expect(hitRate).toBeCloseTo(2 / 3, 5);
  });
});

describe("fitOls / incrementalR2", () => {
  it("recovers exact coefficients for a noiseless linear relationship y = 2 + 3x", () => {
    const X = [[0], [1], [2], [3], [4]];
    const y = [2, 5, 8, 11, 14];
    const fit = fitOls(X, y);
    expect(fit.coefficients[0]).toBeCloseTo(2, 4);
    expect(fit.coefficients[1]).toBeCloseTo(3, 4);
    expect(fit.r2).toBeCloseTo(1, 6);
  });

  it("returns null when there are fewer rows than parameters", () => {
    expect(fitOls([[1, 2]], [5])).toBeNull();
  });

  it("shows a strictly higher R² when an informative second feature is added", () => {
    // y depends on both x1 and x2; base model only sees x1.
    const X1 = [[0], [1], [2], [3], [4], [5]];
    const X12 = [[0, 5], [1, 4], [2, 3], [3, 8], [4, 1], [5, 9]];
    const y = X12.map(([x1, x2]) => 2 + 1 * x1 + 4 * x2);
    const result = incrementalR2(X1, X12, y);
    expect(result.incrementalR2).toBeGreaterThan(0);
    expect(result.extendedR2).toBeCloseTo(1, 4);
  });

  it("returns ~0 incremental R² when the base model already explains the target perfectly", () => {
    // y is a noiseless function of x1 alone, so baseR2 is already ~1 --
    // an unrelated second feature (digits of pi, no relation to x1 or y)
    // cannot push extendedR2 meaningfully above that ceiling.
    const x1 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const x2 = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8];
    const X1 = x1.map((v) => [v]);
    const X12 = x1.map((v, i) => [v, x2[i]]);
    const y = x1.map((v) => 10 + 2 * v);
    const result = incrementalR2(X1, X12, y);
    expect(result.baseR2).toBeCloseTo(1, 6);
    expect(result.incrementalR2).toBeCloseTo(0, 3);
  });
});
