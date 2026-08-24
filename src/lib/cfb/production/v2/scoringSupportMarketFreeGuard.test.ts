import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cfbV2CalibrationResidualSeedPath, cfbV2ScoringNormalEquationsPath } from "./scoringSupportTypes";
import { validateCfbV2CalibrationResidualSeed, validateCfbV2ScoringNormalEquations } from "./scoringSupportValidation";
import { CFB_V2_CONFIG_VERSION } from "./config";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..", "..");

/**
 * WU3A §9 — proves the committed support artifacts contain no market-
 * derived field anywhere (spread/total-line/moneyline/provider/MIC/
 * marketAnchor), and that the offline generator never sourced one.
 */
describe("committed support artifacts — market contamination guard (§9)", () => {
  const rawScoring = readFileSync(resolve(REPO_ROOT, cfbV2ScoringNormalEquationsPath()), "utf8");
  const rawCalibration = readFileSync(resolve(REPO_ROOT, cfbV2CalibrationResidualSeedPath()), "utf8");

  it("scoring-normal-equations artifact contains no market-derived key anywhere in the raw JSON", () => {
    expect(rawScoring).not.toMatch(/spread|moneyline|openingTotal|currentTotal|marketAnchor|"provider"/i);
  });

  it("calibration-residual-seed contains no market-derived key anywhere in the raw JSON", () => {
    expect(rawCalibration).not.toMatch(/spread|moneyline|openingTotal|currentTotal|marketAnchor|"provider"/i);
  });

  it("both artifacts declare marketFree: true and pass full validation against the live config hash", () => {
    const scoring = JSON.parse(rawScoring);
    const calibration = JSON.parse(rawCalibration);
    expect(scoring.marketFree).toBe(true);
    expect(calibration.marketFree).toBe(true);
    expect(() => validateCfbV2ScoringNormalEquations(scoring, CFB_V2_CONFIG_VERSION)).not.toThrow();
    expect(() => validateCfbV2CalibrationResidualSeed(calibration, CFB_V2_CONFIG_VERSION)).not.toThrow();
  });
});
