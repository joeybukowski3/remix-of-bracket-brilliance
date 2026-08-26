import { describe, expect, it } from "vitest";
import { computeStandardization, fitRidgeModel, scoreRidgeModel, standardizeRow } from "./ridge";

describe("ridge regression", () => {
  it("computes standardization from the given rows only (zero mean, unit variance)", () => {
    const rows = [[1, 10], [2, 20], [3, 30]];
    const { means, stds } = computeStandardization(rows);
    expect(means[0]).toBeCloseTo(2, 10);
    expect(means[1]).toBeCloseTo(20, 10);
    const standardized = rows.map((r) => standardizeRow(r, means, stds));
    const standardizedMean0 = standardized.reduce((s, r) => s + r[0], 0) / standardized.length;
    expect(standardizedMean0).toBeCloseTo(0, 10);
  });

  it("a constant column standardizes to zero rather than dividing by zero", () => {
    const rows = [[5, 1], [5, 2], [5, 3]];
    const { means, stds } = computeStandardization(rows);
    expect(stds[0]).toBe(1); // guarded, not 0
    const standardized = standardizeRow([5, 2], means, stds);
    expect(standardized[0]).toBe(0);
  });

  it("recovers a near-linear relationship with a small ridge penalty", () => {
    const rows = [[1], [2], [3], [4], [5], [6], [7], [8]];
    const targets = rows.map((r) => 3 * r[0] + 10);
    const model = fitRidgeModel(rows, targets, 0.01);
    const predicted = rows.map((r) => scoreRidgeModel(model, r));
    for (let i = 0; i < rows.length; i += 1) {
      expect(predicted[i]).toBeCloseTo(targets[i], 0);
    }
  });

  it("is deterministic: identical inputs produce identical fitted coefficients", () => {
    const rows = [[1, 2], [3, 1], [2, 4], [5, 2]];
    const targets = [10, 12, 15, 20];
    const a = fitRidgeModel(rows, targets, 3);
    const b = fitRidgeModel(rows, targets, 3);
    expect(a).toEqual(b);
  });

  it("a larger ridge penalty shrinks coefficients toward zero", () => {
    const rows = [[1], [2], [3], [4], [5]];
    const targets = [2, 4, 6, 8, 10];
    const light = fitRidgeModel(rows, targets, 0.01);
    const heavy = fitRidgeModel(rows, targets, 1000);
    expect(Math.abs(heavy.coefficients[0])).toBeLessThan(Math.abs(light.coefficients[0]));
  });
});
