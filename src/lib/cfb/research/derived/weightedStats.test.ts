import { describe, expect, it } from "vitest";
import { weightedMean, weightedRate } from "./weightedStats";

describe("weightedMean", () => {
  it("computes a plain average when all weights are 1", () => {
    expect(weightedMean([{ value: 2, weight: 1 }, { value: 4, weight: 1 }]).mean).toBe(3);
  });

  it("skips null values without treating them as zero", () => {
    const result = weightedMean([{ value: 10, weight: 1 }, { value: null, weight: 1 }]);
    expect(result.mean).toBe(10);
    expect(result.totalWeight).toBe(1);
  });

  it("skips zero/negative-weight rows", () => {
    const result = weightedMean([{ value: 10, weight: 0 }, { value: 20, weight: 1 }]);
    expect(result.mean).toBe(20);
  });

  it("returns null mean and 0 totalWeight for an empty or all-null input", () => {
    expect(weightedMean([]).mean).toBeNull();
    expect(weightedMean([{ value: null, weight: 1 }]).mean).toBeNull();
  });
});

describe("weightedRate", () => {
  it("computes the fraction of true values", () => {
    expect(
      weightedRate([{ value: true, weight: 1 }, { value: false, weight: 1 }, { value: true, weight: 1 }]).rate,
    ).toBeCloseTo(2 / 3, 5);
  });

  it("stays within [0, 1]", () => {
    const rate = weightedRate([{ value: true, weight: 1 }, { value: true, weight: 1 }]).rate;
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });
});
