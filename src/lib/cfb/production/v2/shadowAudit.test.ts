import { describe, expect, it } from "vitest";
import { auditCfbV2Shadow, type CfbV2ShadowAuditInput } from "./shadowAudit";
import { buildCfbV2ShadowManifest, computeCfbV2ShadowDegradedFlags } from "./shadowManifest";
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
    asOfWeek: 2,
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    offenseRating: 0.1,
    defenseRating: 0.2,
    overallRating: 0.15,
    preseasonPriorOffense: 0.1,
    preseasonPriorDefense: 0.2,
    priorTier: "PRIOR_A",
    gamesPlayed: 1,
    classification: "fbs",
    connectivity: { componentSize: 2, regularizationMultiplier: 3 },
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
    asOfWeek: 2,
    records,
    ...overrides,
  };
}

function projection(overrides: Partial<CfbV2GameProjection> = {}): CfbV2GameProjection {
  return {
    gameId: "g1",
    season: 2026,
    week: 2,
    homeTeamId: "alpha",
    awayTeamId: "beta",
    expectedHomePoints: 28,
    expectedAwayPoints: 21,
    projectedMargin: 7,
    projectedTotal: 49,
    homeWinProbability: 0.65,
    awayWinProbability: 0.35,
    marginInterval50: [2, 12],
    marginInterval80: [-3, 17],
    marginInterval90: [-8, 22],
    marginInterval95: [-12, 26],
    totalInterval50: [42, 56],
    totalInterval80: [36, 62],
    totalInterval90: [30, 68],
    totalInterval95: [26, 72],
    matchupPopulation: "fbs_vs_fbs",
    projectionStatus: "computed",
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
    asOfWeek: 2,
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
    phase9CandidateVersion: "test",
    sourceSeasonStart: 2020,
    sourceSeasonEnd: 2025,
    generatedAt: "2026-08-20T08:00:00.000Z",
    generatorVersion: "test",
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
    phase9CandidateVersion: "test",
    sourceSeasonStart: 2020,
    sourceSeasonEnd: 2025,
    generatedAt: "2026-08-20T08:00:00.000Z",
    generatorVersion: "test",
    recordCount: 0,
    contentHash: "sha-fnv1a-calibration0000",
    marketFree: true,
    records: [],
    ...overrides,
  };
}

function baseAuditInput(overrides: Partial<CfbV2ShadowAuditInput> = {}): CfbV2ShadowAuditInput {
  // Both PRIOR_D (not PRIOR_A) — a genuinely non-degraded baseline. Using
  // PRIOR_A here would itself trip PRESEASON_PRIOR_A_FALLBACK (>=50% of
  // teams on PRIOR_A), making the "HEALTHY" baseline DEGRADED by
  // construction, which is not what these fixtures are meant to test.
  const ratings = [rating({ priorTier: "PRIOR_D" }), rating({ teamId: "beta", priorTier: "PRIOR_D" })];
  const projections = [projection()];
  const ratingArt = ratingArtifact(ratings);
  const projectionArt = projectionArtifact(projections);
  const manifest = buildCfbV2ShadowManifest({
    season: 2026,
    asOfWeek: 2,
    dataAsOf: "2026-08-20T00:00:00.000Z",
    generatedAt: "2026-08-20T12:00:00.000Z",
    ratingArtifact: ratingArt,
    ratingsArtifactPath: "data/generated/cfb/v2/week-02-ratings.json",
    ratingsContentHash: "sha-fnv1a-r0000000",
    projectionArtifact: projectionArt,
    projectionsArtifactPath: "data/generated/cfb/v2/week-02-projections.json",
    projectionsContentHash: "sha-fnv1a-p0000000",
    scoringSupportArtifact: scoringSupport(),
    calibrationSupportArtifact: calibrationSupport(),
    degradedFlags: computeCfbV2ShadowDegradedFlags({
      ratings,
      currentSeasonSuccessObservationCount: 5,
      currentSeasonCompletedGameCount: 3,
      currentSeasonTalentRecordCount: 130,
    }),
  });
  return {
    manifest,
    ratingArtifact: ratingArt,
    projectionArtifact: projectionArt,
    scoringSupportArtifact: scoringSupport(),
    calibrationSupportArtifact: calibrationSupport(),
    expectedConfigVersion: CFB_V2_CONFIG_VERSION,
    ...overrides,
  };
}

describe("auditCfbV2Shadow — HEALTHY", () => {
  it("reports HEALTHY for a structurally valid, non-degraded, computed-projection state", () => {
    const result = auditCfbV2Shadow(baseAuditInput());
    expect(result.healthState).toBe("HEALTHY");
    expect(result.issues).toEqual([]);
    expect(result.ratings.totalTeams).toBe(2);
    expect(result.projections.projectionStatusCounts.computed).toBe(1);
  });

  it("is deterministic — identical input produces identical output", () => {
    const input = baseAuditInput();
    const a = auditCfbV2Shadow(input);
    const b = auditCfbV2Shadow(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("auditCfbV2Shadow — DEGRADED (honest preseason, not a failure)", () => {
  it("reports DEGRADED, not INVALID, for the honest zero-completed-games preseason state", () => {
    const ratings = [rating({ priorTier: "PRIOR_A" }), rating({ teamId: "beta", priorTier: "PRIOR_A" })];
    const projections = [projection({ projectionStatus: "unavailable", expectedHomePoints: null, expectedAwayPoints: null, projectedMargin: null, projectedTotal: null, homeWinProbability: null, awayWinProbability: null, marginInterval50: null, marginInterval80: null, marginInterval90: null, marginInterval95: null, totalInterval50: null, totalInterval80: null, totalInterval90: null, totalInterval95: null })];
    const ratingArt = ratingArtifact(ratings, { asOfWeek: 0 });
    const projectionArt = projectionArtifact(projections, { asOfWeek: 0 });
    const degradedFlags = computeCfbV2ShadowDegradedFlags({
      ratings,
      currentSeasonSuccessObservationCount: 0,
      currentSeasonCompletedGameCount: 0,
      currentSeasonTalentRecordCount: 0,
    });
    const manifest = buildCfbV2ShadowManifest({
      season: 2026,
      asOfWeek: 0,
      dataAsOf: "2026-01-20T00:00:00.000Z",
      generatedAt: "2026-08-20T12:00:00.000Z",
      ratingArtifact: ratingArt,
      ratingsArtifactPath: "data/generated/cfb/v2/preseason-ratings.json",
      ratingsContentHash: "sha-fnv1a-r0000000",
      projectionArtifact: projectionArt,
      projectionsArtifactPath: "data/generated/cfb/v2/preseason-projections.json",
      projectionsContentHash: "sha-fnv1a-p0000000",
      scoringSupportArtifact: scoringSupport(),
      calibrationSupportArtifact: calibrationSupport(),
      degradedFlags,
    });
    const result = auditCfbV2Shadow({ manifest, ratingArtifact: ratingArt, projectionArtifact: projectionArt, scoringSupportArtifact: scoringSupport(), calibrationSupportArtifact: calibrationSupport(), expectedConfigVersion: CFB_V2_CONFIG_VERSION });
    expect(result.healthState).toBe("DEGRADED");
    expect(result.issues.every((i) => i.severity === "degraded")).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain("DEGRADED_FLAG_PRESEASON_ZERO_COMPLETED_GAMES");
  });
});

describe("auditCfbV2Shadow — INVALID (WU6 §8 failure simulation D-H)", () => {
  it("D. season mismatch between ratings and projections -> INVALID", () => {
    const input = baseAuditInput();
    const badProjectionArtifact = { ...input.projectionArtifact, season: 2025 };
    const result = auditCfbV2Shadow({ ...input, projectionArtifact: badProjectionArtifact });
    expect(result.healthState).toBe("INVALID");
    expect(result.issues.some((i) => i.code === "SEASON_MISMATCH" || i.code === "CROSS_ARTIFACT_VALIDATION_FAILED")).toBe(true);
  });

  it("E. configVersion mismatch against the live running config -> INVALID", () => {
    const input = baseAuditInput();
    const result = auditCfbV2Shadow({ ...input, expectedConfigVersion: "cfb-v2-config-some-other-value" });
    expect(result.healthState).toBe("INVALID");
    expect(result.issues.some((i) => i.code === "CROSS_ARTIFACT_VALIDATION_FAILED")).toBe(true);
  });

  it("F. duplicate projection gameId -> INVALID", () => {
    const input = baseAuditInput();
    const dupProjections = [projection({ gameId: "dup" }), projection({ gameId: "dup" })];
    const badProjectionArtifact = projectionArtifact(dupProjections);
    const result = auditCfbV2Shadow({ ...input, projectionArtifact: badProjectionArtifact, manifest: { ...input.manifest, projectionRecordCount: dupProjections.length } });
    expect(result.healthState).toBe("INVALID");
    expect(result.issues.some((i) => i.code === "PROJECTION_VALIDATION_FAILED" || i.code === "CROSS_ARTIFACT_VALIDATION_FAILED")).toBe(true);
    expect(result.projections.duplicateGameIds).toEqual(["dup"]);
  });

  it("G. projection references a team with no matching rating -> INVALID", () => {
    const input = baseAuditInput();
    const badProjections = [projection({ awayTeamId: "unknown-team" })];
    const badProjectionArtifact = projectionArtifact(badProjections);
    const result = auditCfbV2Shadow({ ...input, projectionArtifact: badProjectionArtifact });
    expect(result.healthState).toBe("INVALID");
    expect(result.issues.some((i) => i.code === "CROSS_ARTIFACT_VALIDATION_FAILED")).toBe(true);
  });

  it("H. malformed/non-finite projection output -> INVALID", () => {
    const input = baseAuditInput();
    const badProjections = [projection({ expectedHomePoints: Number.NaN })];
    const badProjectionArtifact = projectionArtifact(badProjections);
    const result = auditCfbV2Shadow({ ...input, projectionArtifact: badProjectionArtifact, manifest: { ...input.manifest, projectionsContentHash: input.manifest.projectionsContentHash } });
    expect(result.healthState).toBe("INVALID");
    expect(result.issues.some((i) => i.code === "PROJECTION_VALIDATION_FAILED")).toBe(true);
  });

  it("manifest/artifact record-count mismatch -> INVALID (catches a corrupt/stale manifest pointer)", () => {
    const input = baseAuditInput();
    const result = auditCfbV2Shadow({ ...input, manifest: { ...input.manifest, ratingRecordCount: 999 } });
    expect(result.healthState).toBe("INVALID");
    expect(result.issues.some((i) => i.code === "MANIFEST_RATING_COUNT_MISMATCH")).toBe(true);
  });

  it("pipelineStatus not published -> INVALID", () => {
    const input = baseAuditInput();
    const result = auditCfbV2Shadow({ ...input, manifest: { ...input.manifest, pipelineStatus: "published" as never } });
    // sanity: baseline is valid/published first
    expect(auditCfbV2Shadow(input).healthState).toBe("HEALTHY");
    const corrupted = { ...input.manifest, pipelineStatus: "corrupt" as never };
    const corruptedResult = auditCfbV2Shadow({ ...input, manifest: corrupted });
    expect(corruptedResult.healthState).toBe("INVALID");
    expect(corruptedResult.issues.some((i) => i.code === "PIPELINE_STATUS_NOT_PUBLISHED")).toBe(true);
  });

  it("current-season data present (no preseason flags) but zero computed FBS-vs-FBS projections -> INVALID (unexplained availability drop)", () => {
    const ratings = [rating(), rating({ teamId: "beta" })];
    const unavailableProjection = projection({ projectionStatus: "unavailable", expectedHomePoints: null, expectedAwayPoints: null, projectedMargin: null, projectedTotal: null, homeWinProbability: null, awayWinProbability: null, marginInterval50: null, marginInterval80: null, marginInterval90: null, marginInterval95: null, totalInterval50: null, totalInterval80: null, totalInterval90: null, totalInterval95: null });
    const ratingArt = ratingArtifact(ratings);
    const projectionArt = projectionArtifact([unavailableProjection]);
    const manifest = buildCfbV2ShadowManifest({
      season: 2026,
      asOfWeek: 2,
      dataAsOf: "2026-08-20T00:00:00.000Z",
      generatedAt: "2026-08-20T12:00:00.000Z",
      ratingArtifact: ratingArt,
      ratingsArtifactPath: "data/generated/cfb/v2/week-02-ratings.json",
      ratingsContentHash: "sha-fnv1a-r0000000",
      projectionArtifact: projectionArt,
      projectionsArtifactPath: "data/generated/cfb/v2/week-02-projections.json",
      projectionsContentHash: "sha-fnv1a-p0000000",
      scoringSupportArtifact: scoringSupport(),
      calibrationSupportArtifact: calibrationSupport(),
      // No degraded flags at all — simulating "current-season data present" bookkeeping without triggering the honest preseason flags.
      degradedFlags: [],
    });
    const result = auditCfbV2Shadow({ manifest, ratingArtifact: ratingArt, projectionArtifact: projectionArt, scoringSupportArtifact: scoringSupport(), calibrationSupportArtifact: calibrationSupport(), expectedConfigVersion: CFB_V2_CONFIG_VERSION });
    expect(result.healthState).toBe("INVALID");
    expect(result.issues.some((i) => i.code === "UNEXPECTED_ZERO_COMPUTED_PROJECTIONS")).toBe(true);
  });
});
