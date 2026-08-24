import { describe, expect, it } from "vitest";
import { applyCfbV2Calibration, applyCfbV2TotalOnlyCalibration, fitCfbV2TotalCalibration } from "./totalCalibration";

describe("fitCfbV2TotalCalibration", () => {
  it("returns identity coefficients for an empty pool", () => {
    expect(fitCfbV2TotalCalibration([])).toEqual({ intercept: 0, slope: 1 });
  });

  it("fits a perfect linear relationship exactly", () => {
    const rows = [
      { rawTotal: 40, actualTotal: 44 },
      { rawTotal: 50, actualTotal: 54 },
      { rawTotal: 60, actualTotal: 64 },
    ];
    const coeffs = fitCfbV2TotalCalibration(rows);
    expect(coeffs.slope).toBeCloseTo(1, 9);
    expect(coeffs.intercept).toBeCloseTo(4, 9);
  });

  it("falls back to mean-intercept/zero-slope when rawTotal has zero variance", () => {
    const rows = [
      { rawTotal: 50, actualTotal: 40 },
      { rawTotal: 50, actualTotal: 60 },
    ];
    const coeffs = fitCfbV2TotalCalibration(rows);
    expect(coeffs.slope).toBe(0);
    expect(coeffs.intercept).toBeCloseTo(50, 9);
  });
});

describe("applyCfbV2TotalOnlyCalibration (§10 required identities)", () => {
  it("preserves raw margin and satisfies home+away=calibratedTotal, home-away=rawMargin", () => {
    const coeffs = { intercept: 3, slope: 0.95 };
    const rawMargin = 7;
    const rawTotal = 51;
    const result = applyCfbV2TotalOnlyCalibration(rawMargin, rawTotal, coeffs);
    expect(result.calibratedTotal).toBeCloseTo(applyCfbV2Calibration(rawTotal, coeffs), 9);
    expect(result.calibratedHomePoints + result.calibratedAwayPoints).toBeCloseTo(result.calibratedTotal, 9);
    expect(result.calibratedHomePoints - result.calibratedAwayPoints).toBeCloseTo(rawMargin, 9);
  });

  it("never separately calibrates home/away — a zero-slope pathological fit still preserves the identity", () => {
    const coeffs = { intercept: 44, slope: 0 };
    const result = applyCfbV2TotalOnlyCalibration(-3, 51, coeffs);
    expect(result.calibratedTotal).toBe(44);
    expect(result.calibratedHomePoints - result.calibratedAwayPoints).toBeCloseTo(-3, 9);
  });
});
