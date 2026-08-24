import { describe, expect, it } from "vitest";
import { applyStandardizer, fitStandardizer } from "./standardize";
import { applyStandardizer as researchApplyStandardizer, fitStandardizer as researchFitStandardizer } from "../../research/phase2/standardize";

describe("fitStandardizer / applyStandardizer", () => {
  it("produces mean 0, std 1 on the fitted sample", () => {
    const values = [1, 2, 3, 4, 5];
    const std = fitStandardizer(values);
    const applied = values.map((v) => applyStandardizer(v, std));
    const mean = applied.reduce((s, v) => s + v, 0) / applied.length;
    expect(mean).toBeCloseTo(0, 10);
  });

  it("falls back to mean 0 std 1 for an empty sample", () => {
    expect(fitStandardizer([])).toEqual({ mean: 0, std: 1 });
  });

  it("matches the research implementation exactly (parity, test-only import)", () => {
    const values = [3.2, -1.5, 7.8, 0, 4.4, -2.2, 9.9];
    const production = fitStandardizer(values);
    const research = researchFitStandardizer(values);
    expect(production).toEqual(research);
    for (const v of values) {
      expect(applyStandardizer(v, production)).toBeCloseTo(researchApplyStandardizer(v, research), 12);
    }
  });
});
