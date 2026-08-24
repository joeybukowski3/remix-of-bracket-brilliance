import { describe, expect, it } from "vitest";
import { fitIncrementalInformationRegression } from "./incrementalInformation";

function makeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    modelMargin: (i % 20) - 10,
    marketMargin: (i % 15) - 7,
    actualMargin: (i % 20) - 10 + ((i % 15) - 7) * 0.5 + ((i % 3) - 1),
  }));
}

describe("fitIncrementalInformationRegression", () => {
  it("R² values are finite (never NaN)", () => {
    const result = fitIncrementalInformationRegression(makeRows(100));
    expect(Number.isFinite(result.combinedR2)).toBe(true);
    expect(Number.isFinite(result.marketOnlyR2)).toBe(true);
    expect(Number.isFinite(result.modelOnlyR2)).toBe(true);
  });

  it("combined R² is at least as large as either individual-predictor R²", () => {
    const result = fitIncrementalInformationRegression(makeRows(100));
    expect(result.combinedR2).toBeGreaterThanOrEqual(result.marketOnlyR2 - 1e-9);
    expect(result.combinedR2).toBeGreaterThanOrEqual(result.modelOnlyR2 - 1e-9);
  });

  it("recovers known coefficients when actualMargin is an exact linear combination", () => {
    const rows = Array.from({ length: 50 }, (_, i) => {
      const modelMargin = (i % 10) - 5;
      const marketMargin = (i % 7) - 3;
      return { modelMargin, marketMargin, actualMargin: 2 + 0.6 * modelMargin + 0.4 * marketMargin };
    });
    const result = fitIncrementalInformationRegression(rows);
    expect(result.intercept).toBeCloseTo(2, 5);
    expect(result.modelCoefficient).toBeCloseTo(0.6, 5);
    expect(result.marketCoefficient).toBeCloseTo(0.4, 5);
    expect(result.combinedR2).toBeCloseTo(1, 5);
  });
});
