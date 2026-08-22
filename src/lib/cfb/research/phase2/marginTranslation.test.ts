import { describe, expect, it } from "vitest";
import { fitMarginTranslation, predictMargin } from "./marginTranslation";

describe("fitMarginTranslation / predictMargin", () => {
  it("recovers a known linear relationship exactly (noiseless data)", () => {
    const rows = [
      { ratingDifferential: 1, actualMargin: 5, isHome: true, isNeutral: false },
      { ratingDifferential: 2, actualMargin: 9, isHome: true, isNeutral: false },
      { ratingDifferential: -1, actualMargin: -3, isHome: true, isNeutral: false },
      { ratingDifferential: 0, actualMargin: 1, isHome: true, isNeutral: false },
    ];
    // actualMargin = 1 + 4*ratingDiff (all home, so hfa term is degenerate here — fit with includeHfa via isHome constant)
    const coefficients = fitMarginTranslation(rows);
    const prediction = predictMargin(1.5, true, false, coefficients);
    expect(prediction).toBeCloseTo(1 + 4 * 1.5, 1);
  });

  it("returns zero coefficients for an empty training set rather than throwing", () => {
    const coefficients = fitMarginTranslation([]);
    expect(coefficients).toEqual({ intercept: 0, slope: 0, hfa: 0 });
  });

  it("neutral-site games get zero HFA contribution", () => {
    const rows = [
      { ratingDifferential: 0, actualMargin: 10, isHome: true, isNeutral: false },
      { ratingDifferential: 0, actualMargin: -10, isHome: false, isNeutral: false },
    ];
    const coefficients = fitMarginTranslation(rows);
    const neutralPrediction = predictMargin(0, true, true, coefficients);
    expect(neutralPrediction).toBeCloseTo(coefficients.intercept, 5);
  });
});
