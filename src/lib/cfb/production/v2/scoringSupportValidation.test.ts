import { describe, expect, it } from "vitest";
import { CfbV2SupportValidationError, validateCfbV2CalibrationResidualSeed, validateCfbV2ScoringNormalEquations } from "./scoringSupportValidation";
import { CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION, CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION, type CfbV2CalibrationResidualSeedArtifact, type CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";

const FEATURE_NAMES = ["intercept", "scoringEnvironment", "offenseRating", "defenseRatingAllowed", "hfa", "SUCCESS_own", "SUCCESS_opponentAllowed"];

function identityAta(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0.1)));
}

function scoringFixture(overrides: Partial<CfbV2ScoringNormalEquationsArtifact> = {}): CfbV2ScoringNormalEquationsArtifact {
  return {
    schemaVersion: "cfb-v2-support-schema-1",
    artifactVersion: CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION,
    modelVersion: "cfb-ipr-v2.0",
    configVersion: "cfb-v2-config-abc123",
    phase9CandidateVersion: "cfb-research-phase9-production-candidate-validation-v0.1",
    sourceSeasonStart: 2020,
    sourceSeasonEnd: 2025,
    generatedAt: "2026-08-23T08:00:00.000Z",
    generatorVersion: "cfb-v2-support-export-v1",
    recordCount: 1,
    contentHash: "sha-fnv1a-deadbeef",
    marketFree: true,
    records: [
      {
        season: 2020,
        week: 2,
        featureNames: FEATURE_NAMES,
        ata: identityAta(FEATURE_NAMES.length),
        atb: FEATURE_NAMES.map((_, i) => i + 1),
        usableRowCount: 42,
      },
    ],
    ...overrides,
  };
}

function calibrationFixture(overrides: Partial<CfbV2CalibrationResidualSeedArtifact> = {}): CfbV2CalibrationResidualSeedArtifact {
  return {
    schemaVersion: "cfb-v2-support-schema-1",
    artifactVersion: CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION,
    modelVersion: "cfb-ipr-v2.0",
    configVersion: "cfb-v2-config-abc123",
    phase9CandidateVersion: "cfb-research-phase9-production-candidate-validation-v0.1",
    sourceSeasonStart: 2020,
    sourceSeasonEnd: 2025,
    generatedAt: "2026-08-23T08:00:00.000Z",
    generatorVersion: "cfb-v2-support-export-v1",
    recordCount: 1,
    contentHash: "sha-fnv1a-deadbeef",
    marketFree: true,
    records: [
      {
        gameId: "g1",
        season: 2020,
        week: 2,
        rawExpectedHomePoints: 28,
        rawExpectedAwayPoints: 21,
        rawProjectedMargin: 7,
        rawProjectedTotal: 49,
        calibratedExpectedHomePoints: 27,
        calibratedExpectedAwayPoints: 20,
        calibratedTotal: 47,
        actualHomePoints: 30,
        actualAwayPoints: 17,
        actualTotal: 47,
        homeResidual: 3,
        awayResidual: -3,
      },
    ],
    ...overrides,
  };
}

describe("validateCfbV2ScoringNormalEquations", () => {
  it("passes for a valid fixture", () => {
    expect(() => validateCfbV2ScoringNormalEquations(scoringFixture())).not.toThrow();
  });

  it("validates configVersion against an expected value when provided", () => {
    expect(() => validateCfbV2ScoringNormalEquations(scoringFixture(), "cfb-v2-config-abc123")).not.toThrow();
    expect(() => validateCfbV2ScoringNormalEquations(scoringFixture(), "cfb-v2-config-DIFFERENT")).toThrow(/config hash mismatch/);
  });

  it("rejects a wrong artifactVersion", () => {
    expect(() => validateCfbV2ScoringNormalEquations(scoringFixture({ artifactVersion: "wrong-version" }))).toThrow(/provenance mismatch/);
  });

  it("rejects marketFree !== true", () => {
    expect(() => validateCfbV2ScoringNormalEquations(scoringFixture({ marketFree: false as true }))).toThrow(/marketFree/);
  });

  it("rejects a recordCount/records.length mismatch", () => {
    expect(() => validateCfbV2ScoringNormalEquations(scoringFixture({ recordCount: 5 }))).toThrow(/recordCount/);
  });

  it("rejects a duplicate (season, week) snapshot", () => {
    const fixture = scoringFixture();
    fixture.records = [...fixture.records, fixture.records[0]] as any;
    fixture.recordCount = 2;
    expect(() => validateCfbV2ScoringNormalEquations(fixture)).toThrow(/duplicate scoring snapshot cutoff/);
  });

  it("rejects an ata matrix whose dimensions do not match featureNames.length", () => {
    const fixture = scoringFixture();
    (fixture.records[0] as any).ata = [[1, 0]];
    expect(() => validateCfbV2ScoringNormalEquations(fixture)).toThrow(/ata matrix/);
  });

  it("rejects an atb vector whose length does not match featureNames.length", () => {
    const fixture = scoringFixture();
    (fixture.records[0] as any).atb = [1, 2];
    expect(() => validateCfbV2ScoringNormalEquations(fixture)).toThrow(/atb vector/);
  });

  it("rejects a non-finite atb entry", () => {
    const fixture = scoringFixture();
    (fixture.records[0] as any).atb[0] = NaN;
    expect(() => validateCfbV2ScoringNormalEquations(fixture)).toThrow(/atb\[0\]/);
  });

  it("rejects a non-symmetric ata matrix", () => {
    const fixture = scoringFixture();
    (fixture.records[0] as any).ata[0][1] = 999;
    expect(() => validateCfbV2ScoringNormalEquations(fixture)).toThrow(/non-symmetric ata matrix/);
  });

  it("rejects a market-derived field name on a snapshot", () => {
    const fixture = scoringFixture();
    (fixture.records[0] as any).openingSpread = -3.5;
    expect(() => validateCfbV2ScoringNormalEquations(fixture)).toThrow(/market-derived field/);
  });

  it("rejects out-of-chronological-order snapshots", () => {
    const fixture = scoringFixture();
    fixture.records = [
      { ...fixture.records[0], season: 2021, week: 1 },
      { ...fixture.records[0], season: 2020, week: 2 },
    ] as any;
    fixture.recordCount = 2;
    expect(() => validateCfbV2ScoringNormalEquations(fixture)).toThrow(/not chronologically sorted/);
  });
});

describe("validateCfbV2CalibrationResidualSeed", () => {
  it("passes for a valid fixture", () => {
    expect(() => validateCfbV2CalibrationResidualSeed(calibrationFixture())).not.toThrow();
  });

  it("rejects a rawTotal identity mismatch", () => {
    const fixture = calibrationFixture();
    (fixture.records[0] as any).rawProjectedTotal = 999;
    expect(() => validateCfbV2CalibrationResidualSeed(fixture)).toThrow(/rawTotal identity/);
  });

  it("rejects a margin-not-preserved violation (TOTAL_ONLY must never re-calibrate margin)", () => {
    const fixture = calibrationFixture();
    // Shift home +1 / away -1: calibratedTotal identity still holds (sum unchanged), but home-away no longer equals rawProjectedMargin.
    (fixture.records[0] as any).calibratedExpectedHomePoints = 28;
    (fixture.records[0] as any).calibratedExpectedAwayPoints = 19;
    expect(() => validateCfbV2CalibrationResidualSeed(fixture)).toThrow(/margin-preserved identity/);
  });

  it("rejects an actualTotal mismatch", () => {
    const fixture = calibrationFixture();
    (fixture.records[0] as any).actualTotal = 12345;
    expect(() => validateCfbV2CalibrationResidualSeed(fixture)).toThrow(/actualTotal mismatch/);
  });

  it("rejects a residual arithmetic mismatch", () => {
    const fixture = calibrationFixture();
    (fixture.records[0] as any).homeResidual = 999;
    expect(() => validateCfbV2CalibrationResidualSeed(fixture)).toThrow(/homeResidual arithmetic mismatch/);
  });

  it("rejects a duplicate gameId", () => {
    const fixture = calibrationFixture();
    fixture.records = [...fixture.records, fixture.records[0]] as any;
    fixture.recordCount = 2;
    expect(() => validateCfbV2CalibrationResidualSeed(fixture)).toThrow(/duplicate calibration row/);
  });

  it("throws CfbV2SupportValidationError as the error class", () => {
    expect(() => validateCfbV2CalibrationResidualSeed(calibrationFixture({ marketFree: false as true }))).toThrow(CfbV2SupportValidationError);
  });
});
