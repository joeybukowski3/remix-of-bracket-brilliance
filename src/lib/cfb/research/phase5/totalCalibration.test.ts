import { describe, expect, it } from "vitest";
import { applyCalibration, fitTotalCalibration, type CalibrationTrainingRow } from "./totalCalibration";

function rows(n: number, season = 2020): CalibrationTrainingRow[] {
  // actualTotal = 10 + 1.5*rawTotal (a clean linear relationship to recover)
  return Array.from({ length: n }, (_, i) => ({ rawTotal: 40 + i, actualTotal: 10 + 1.5 * (40 + i), season, week: 1 + (i % 12) }));
}

describe("fitTotalCalibration", () => {
  it("NONE returns identity coefficients", () => {
    expect(fitTotalCalibration(rows(50), "NONE", 2020, 5)).toEqual({ intercept: 0, slope: 1 });
  });

  it("LINEAR recovers a known linear relationship from noiseless training data", () => {
    const coeffs = fitTotalCalibration(rows(50), "LINEAR", 2020, 5);
    expect(coeffs.intercept).toBeCloseTo(10, 5);
    expect(coeffs.slope).toBeCloseTo(1.5, 5);
  });

  it("SEASON_AWARE falls back to pooled fit when the current season has too few training rows", () => {
    const sparseSeason = rows(5, 2021);
    const pooled = rows(50, 2020);
    const coeffs = fitTotalCalibration([...pooled, ...sparseSeason], "SEASON_AWARE", 2021, 5);
    // With only 5 rows in 2021 (below MIN_CALIBRATION_ROWS), should fall back to the pooled fit.
    const pooledOnly = fitTotalCalibration([...pooled, ...sparseSeason], "LINEAR", 2021, 5);
    expect(coeffs).toEqual(pooledOnly);
  });

  it("empty training set returns identity-ish fallback rather than throwing", () => {
    const coeffs = fitTotalCalibration([], "LINEAR", 2020, 1);
    expect(coeffs).toEqual({ intercept: 0, slope: 1 });
  });
});

describe("applyCalibration", () => {
  it("applies intercept + slope * value", () => {
    expect(applyCalibration(50, { intercept: 10, slope: 1.5 })).toBeCloseTo(85, 10);
  });
});
