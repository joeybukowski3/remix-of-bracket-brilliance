import { describe, expect, it } from "vitest";
import { assertPublishableCfbV2Shadow, CfbV2ShadowValidationError, validateCfbV2ArtifactCompatibility } from "./shadowValidation";
import { CFB_V2_IPR_MODEL_VERSION, CFB_V2_VERSIONS } from "./versions";
import { CFB_V2_CONFIG_VERSION } from "./config";
import { CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION, CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION } from "./scoringSupportTypes";
import type { CfbV2ArtifactEnvelope } from "./artifactContracts";
import type { CfbV2GameProjection, CfbV2TeamRating } from "./types";
import type { CfbV2CalibrationResidualSeedArtifact, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";

function rating(overrides: Partial<CfbV2TeamRating> = {}): CfbV2TeamRating {
  return {
    teamId: "alpha",
    season: 2026,
    asOfWeek: 0,
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    offenseRating: 0.1,
    defenseRating: 0.2,
    overallRating: 0.15,
    preseasonPriorOffense: 0.1,
    preseasonPriorDefense: 0.2,
    priorTier: "PRIOR_A",
    gamesPlayed: 0,
    classification: "fbs",
    connectivity: { componentSize: 1, regularizationMultiplier: 3 },
    ratingStatus: "computed",
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-08-20T12:00:00.000Z",
    dataAsOf: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function ratingArtifact(records: readonly CfbV2TeamRating[], overrides: Partial<CfbV2ArtifactEnvelope<CfbV2TeamRating>> = {}): CfbV2ArtifactEnvelope<CfbV2TeamRating> {
  return {
    schemaVersion: "cfb-v2-artifact-schema-1",
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    versions: CFB_V2_VERSIONS,
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-08-20T12:00:00.000Z",
    dataAsOf: "2026-08-20T00:00:00.000Z",
    season: 2026,
    asOfWeek: 0,
    records,
    ...overrides,
  };
}

function projection(overrides: Partial<CfbV2GameProjection> = {}): CfbV2GameProjection {
  return {
    gameId: "g1",
    season: 2026,
    week: 1,
    homeTeamId: "alpha",
    awayTeamId: "beta",
    expectedHomePoints: null,
    expectedAwayPoints: null,
    projectedMargin: null,
    projectedTotal: null,
    homeWinProbability: null,
    awayWinProbability: null,
    marginInterval50: null,
    marginInterval80: null,
    marginInterval90: null,
    marginInterval95: null,
    totalInterval50: null,
    totalInterval80: null,
    totalInterval90: null,
    totalInterval95: null,
    matchupPopulation: "fbs_vs_fbs",
    projectionStatus: "unavailable",
    modelVersion: CFB_V2_VERSIONS.ipr,
    scoringVersion: CFB_V2_VERSIONS.scoring,
    calibrationVersion: CFB_V2_VERSIONS.calibration,
    probabilityVersion: CFB_V2_VERSIONS.probability,
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-08-20T12:00:00.000Z",
    dataAsOf: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function projectionArtifact(records: readonly CfbV2GameProjection[], overrides: Partial<CfbV2ArtifactEnvelope<CfbV2GameProjection>> = {}): CfbV2ArtifactEnvelope<CfbV2GameProjection> {
  return {
    schemaVersion: "cfb-v2-artifact-schema-1",
    modelVersion: CFB_V2_VERSIONS.ipr,
    versions: CFB_V2_VERSIONS,
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-08-20T12:00:00.000Z",
    dataAsOf: "2026-08-20T00:00:00.000Z",
    season: 2026,
    asOfWeek: 0,
    records,
    ...overrides,
  };
}

function scoringSupport(overrides: Partial<CfbV2ScoringNormalEquationsArtifact> = {}): CfbV2ScoringNormalEquationsArtifact {
  return {
    schemaVersion: "cfb-v2-support-schema-1",
    artifactVersion: CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION,
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    configVersion: CFB_V2_CONFIG_VERSION,
    phase9CandidateVersion: "cfb-research-phase9-production-candidate-validation-v0.1",
    sourceSeasonStart: 2020,
    sourceSeasonEnd: 2025,
    generatedAt: "2026-08-23T08:00:00.000Z",
    generatorVersion: "cfb-v2-support-export-v1",
    recordCount: 0,
    contentHash: "sha-fnv1a-scoring0000",
    marketFree: true,
    records: [],
    ...overrides,
  };
}

function calibrationSupport(overrides: Partial<CfbV2CalibrationResidualSeedArtifact> = {}): CfbV2CalibrationResidualSeedArtifact {
  return {
    schemaVersion: "cfb-v2-support-schema-1",
    artifactVersion: CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION,
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    configVersion: CFB_V2_CONFIG_VERSION,
    phase9CandidateVersion: "cfb-research-phase9-production-candidate-validation-v0.1",
    sourceSeasonStart: 2020,
    sourceSeasonEnd: 2025,
    generatedAt: "2026-08-23T08:00:00.000Z",
    generatorVersion: "cfb-v2-support-export-v1",
    recordCount: 0,
    contentHash: "sha-fnv1a-calibration0000",
    marketFree: true,
    records: [],
    ...overrides,
  };
}

function validInput() {
  return {
    ratingArtifact: ratingArtifact([rating(), rating({ teamId: "beta" })]),
    projectionArtifact: projectionArtifact([projection()]),
    scoringSupportArtifact: scoringSupport(),
    calibrationSupportArtifact: calibrationSupport(),
    expectedConfigVersion: CFB_V2_CONFIG_VERSION,
  };
}

describe("validateCfbV2ArtifactCompatibility — WU4 §14 fixtures", () => {
  it("A. valid matching ratings+projections passes", () => {
    expect(() => validateCfbV2ArtifactCompatibility(validInput())).not.toThrow();
  });

  it("B. projections built from a stale/future rating state throws", () => {
    const input = validInput();
    // Rating dataAsOf strictly AFTER the projection's own claimed cutoff.
    input.ratingArtifact = ratingArtifact([rating()], { dataAsOf: "2026-09-01T00:00:00.000Z" });
    input.projectionArtifact = projectionArtifact([projection()], { dataAsOf: "2026-08-20T00:00:00.000Z" });
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(CfbV2ShadowValidationError);
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(/future rating state/);
  });

  it("C. mismatched config hash between ratings and projections throws", () => {
    const input = validInput();
    input.projectionArtifact = projectionArtifact([projection({ configVersion: "cfb-v2-config-other" })], { configVersion: "cfb-v2-config-other" });
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(/configVersion mismatch/);
  });

  it("D. mismatched season between ratings and projections throws", () => {
    const input = validInput();
    input.projectionArtifact = projectionArtifact([projection({ season: 2025 })], { season: 2025 });
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(/season mismatch/);
  });

  it("E. a projection referencing a team with no matching rating throws", () => {
    const input = validInput();
    input.projectionArtifact = projectionArtifact([projection({ awayTeamId: "unknown-team" })]);
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(/no matching rating/);
  });

  it("F. duplicate projection gameId throws", () => {
    const input = validInput();
    input.projectionArtifact = projectionArtifact([projection({ gameId: "dup" }), projection({ gameId: "dup" })]);
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(/duplicate projection gameId/);
  });

  it("also fails closed on a duplicate rating teamId", () => {
    const input = validInput();
    input.ratingArtifact = ratingArtifact([rating(), rating()]);
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(/duplicate rating teamId/);
  });

  it("G. an invalid/stale support artifactVersion throws", () => {
    const input = validInput();
    input.scoringSupportArtifact = scoringSupport({ artifactVersion: "cfb-v2-scoring-normal-equations-OLD-v0" as unknown as typeof CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION });
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(/scoring support artifactVersion mismatch/);
  });

  it("G (calibration variant). an invalid/stale calibration support artifactVersion throws", () => {
    const input = validInput();
    input.calibrationSupportArtifact = calibrationSupport({ artifactVersion: "cfb-v2-calibration-residual-seed-OLD-v0" as unknown as typeof CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION });
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(/calibration support artifactVersion mismatch/);
  });

  it("a support artifact configVersion mismatch against the live running config throws", () => {
    const input = validInput();
    input.scoringSupportArtifact = scoringSupport({ configVersion: "cfb-v2-config-stale" });
    expect(() => validateCfbV2ArtifactCompatibility(input)).toThrow(/scoring support configVersion/);
  });

  it("H. represents a partial pipeline failure — cross-validation throws before anything is promoted (see shadowPublish.test.ts for the no-file-written proof)", () => {
    const input = validInput();
    input.projectionArtifact = projectionArtifact([projection({ season: 2025 })], { season: 2025 });
    let threw = false;
    try {
      assertPublishableCfbV2Shadow(input);
    } catch (error) {
      threw = true;
      expect(error).toBeInstanceOf(CfbV2ShadowValidationError);
    }
    expect(threw).toBe(true);
  });

  it("I. a valid DEGRADED preseason state (zero completed games, every projection unavailable, PRIOR_A-heavy ratings) still PASSES — degraded is not invalid", () => {
    const input = {
      ratingArtifact: ratingArtifact([rating({ priorTier: "PRIOR_A" }), rating({ teamId: "beta", priorTier: "PRIOR_A" })]),
      projectionArtifact: projectionArtifact([
        projection({ gameId: "g1", projectionStatus: "unavailable", homeTeamId: "alpha", awayTeamId: "beta" }),
      ]),
      scoringSupportArtifact: scoringSupport(),
      calibrationSupportArtifact: calibrationSupport(),
      expectedConfigVersion: CFB_V2_CONFIG_VERSION,
    };
    expect(() => assertPublishableCfbV2Shadow(input)).not.toThrow();
  });
});
