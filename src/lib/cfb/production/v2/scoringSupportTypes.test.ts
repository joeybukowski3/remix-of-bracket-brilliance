import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION,
  CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION,
  cfbV2CalibrationResidualSeedPath,
  cfbV2ScoringNormalEquationsPath,
  isEligibleBeforeCutoff,
  type CfbV2CalibrationResidualSeedArtifact,
  type CfbV2ScoringNormalEquationsArtifact,
} from "./scoringSupportTypes";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..", "..");

describe("support artifact path constants", () => {
  it("point at data/cfb/v2-support/, never data/cfb/research/**", () => {
    expect(cfbV2ScoringNormalEquationsPath()).toBe("data/cfb/v2-support/scoring-normal-equations-2020-2025.json");
    expect(cfbV2CalibrationResidualSeedPath()).toBe("data/cfb/v2-support/calibration-residual-seed-2020-2025.json");
    expect(cfbV2ScoringNormalEquationsPath()).not.toMatch(/research/);
    expect(cfbV2CalibrationResidualSeedPath()).not.toMatch(/research/);
  });
});

describe("isEligibleBeforeCutoff", () => {
  it("is true only strictly before the cutoff", () => {
    expect(isEligibleBeforeCutoff({ season: 2020, week: 3 }, 2020, 4)).toBe(true);
    expect(isEligibleBeforeCutoff({ season: 2020, week: 4 }, 2020, 4)).toBe(false);
    expect(isEligibleBeforeCutoff({ season: 2019, week: 20 }, 2020, 1)).toBe(true);
    expect(isEligibleBeforeCutoff({ season: 2021, week: 1 }, 2020, 20)).toBe(false);
  });
});

describe("committed support artifacts — schema/version sanity (loaded from disk, not imported at runtime)", () => {
  it("scoring-normal-equations-2020-2025.json matches the declared shape and version", () => {
    const artifact = JSON.parse(readFileSync(resolve(REPO_ROOT, cfbV2ScoringNormalEquationsPath()), "utf8")) as CfbV2ScoringNormalEquationsArtifact;
    expect(artifact.artifactVersion).toBe(CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION);
    expect(artifact.marketFree).toBe(true);
    expect(artifact.recordCount).toBe(artifact.records.length);
    expect(artifact.sourceSeasonStart).toBe(2020);
    expect(artifact.sourceSeasonEnd).toBe(2025);
    // One snapshot per predicted week across 6 seasons, plus the trailing 2026 boundary snapshot — far fewer than the superseded one-row-per-game artifact, by design.
    expect(artifact.records.length).toBeGreaterThan(50);
    expect(artifact.records.length).toBeLessThan(500);
    const first = artifact.records[0];
    expect(Array.isArray(first.featureNames)).toBe(true);
    expect(first.featureNames.length).toBe(7);
    expect(first.ata.length).toBe(first.featureNames.length);
    expect(first.atb.length).toBe(first.featureNames.length);
  });

  it("calibration-residual-seed-2020-2025.json matches the declared shape and version", () => {
    const artifact = JSON.parse(readFileSync(resolve(REPO_ROOT, cfbV2CalibrationResidualSeedPath()), "utf8")) as CfbV2CalibrationResidualSeedArtifact;
    expect(artifact.artifactVersion).toBe(CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION);
    expect(artifact.marketFree).toBe(true);
    expect(artifact.recordCount).toBe(artifact.records.length);
    expect(artifact.records.length).toBeGreaterThan(1000);
  });
});
