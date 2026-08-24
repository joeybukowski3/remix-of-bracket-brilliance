import { describe, expect, it } from "vitest";
import {
  buildCfbV2ShadowManifest,
  computeCfbV2ArtifactContentHash,
  computeCfbV2PriorTierCounts,
  computeCfbV2ShadowDegradedFlags,
  CFB_V2_SHADOW_MANIFEST_SCHEMA_VERSION,
} from "./shadowManifest";
import { cfbV2ManifestPath } from "./artifactContracts";
import { CFB_V2_IPR_MODEL_VERSION } from "./versions";
import { CFB_V2_CONFIG_VERSION } from "./config";
import type { CfbV2ArtifactEnvelope } from "./artifactContracts";
import type { CfbV2GameProjection, CfbV2TeamRating } from "./types";
import type { CfbV2CalibrationResidualSeedArtifact, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";
import { CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION, CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION } from "./scoringSupportTypes";
import { CFB_V2_VERSIONS } from "./versions";

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

function ratingArtifactFixture(records: readonly CfbV2TeamRating[]): CfbV2ArtifactEnvelope<CfbV2TeamRating> {
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

function projectionArtifactFixture(records: readonly CfbV2GameProjection[]): CfbV2ArtifactEnvelope<CfbV2GameProjection> {
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
  };
}

function scoringSupportFixture(): CfbV2ScoringNormalEquationsArtifact {
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
  };
}

function calibrationSupportFixture(): CfbV2CalibrationResidualSeedArtifact {
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
  };
}

describe("cfbV2ManifestPath", () => {
  it("points under data/generated/cfb/v2/", () => {
    expect(cfbV2ManifestPath()).toBe("data/generated/cfb/v2/manifest.json");
  });
});

describe("computeCfbV2ArtifactContentHash", () => {
  it("is deterministic for identical content", () => {
    const records = [{ teamId: "alpha", offenseRating: 0.1, generatedAt: "2026-08-20T12:00:00.000Z" }];
    expect(computeCfbV2ArtifactContentHash(records)).toBe(computeCfbV2ArtifactContentHash(records));
  });

  it("is invariant to a changed generatedAt field (§6 — volatile timestamp excluded)", () => {
    const a = [{ teamId: "alpha", offenseRating: 0.1, generatedAt: "2026-08-20T12:00:00.000Z" }];
    const b = [{ teamId: "alpha", offenseRating: 0.1, generatedAt: "2026-08-21T09:30:00.000Z" }];
    expect(computeCfbV2ArtifactContentHash(a)).toBe(computeCfbV2ArtifactContentHash(b));
  });

  it("changes when non-timestamp content changes", () => {
    const a = [{ teamId: "alpha", offenseRating: 0.1, generatedAt: "2026-08-20T12:00:00.000Z" }];
    const b = [{ teamId: "alpha", offenseRating: 0.2, generatedAt: "2026-08-20T12:00:00.000Z" }];
    expect(computeCfbV2ArtifactContentHash(a)).not.toBe(computeCfbV2ArtifactContentHash(b));
  });

  it("has the sha-fnv1a- prefix, matching the WU3A support-artifact hash convention", () => {
    expect(computeCfbV2ArtifactContentHash([])).toMatch(/^sha-fnv1a-[0-9a-f]{8}$/);
  });
});

describe("computeCfbV2PriorTierCounts", () => {
  it("counts every tier, including zero-count tiers", () => {
    const counts = computeCfbV2PriorTierCounts([rating({ priorTier: "PRIOR_A" }), rating({ priorTier: "PRIOR_A", teamId: "beta" }), rating({ priorTier: "PRIOR_D", teamId: "gamma" })]);
    expect(counts).toEqual({ PRIOR_D: 1, PRIOR_C: 0, PRIOR_A: 2, LEAGUE_MEAN: 0 });
  });
});

describe("computeCfbV2ShadowDegradedFlags", () => {
  it("flags the honest 2026 preseason state — all four degraded conditions present", () => {
    const flags = computeCfbV2ShadowDegradedFlags({
      ratings: [rating({ priorTier: "PRIOR_A" }), rating({ priorTier: "PRIOR_A", teamId: "beta" })],
      currentSeasonSuccessObservationCount: 0,
      currentSeasonCompletedGameCount: 0,
      currentSeasonTalentRecordCount: 0,
    });
    expect(flags).toEqual(
      expect.arrayContaining(["MISSING_CURRENT_TALENT", "PRESEASON_PRIOR_A_FALLBACK", "NO_CURRENT_SUCCESS_DATA", "PRESEASON_ZERO_COMPLETED_GAMES"]),
    );
  });

  it("does not flag PRESEASON_PRIOR_A_FALLBACK when most teams are full PRIOR_D", () => {
    const flags = computeCfbV2ShadowDegradedFlags({
      ratings: [rating({ priorTier: "PRIOR_D" }), rating({ priorTier: "PRIOR_D", teamId: "beta" }), rating({ priorTier: "PRIOR_A", teamId: "gamma" })],
      currentSeasonSuccessObservationCount: 5,
      currentSeasonCompletedGameCount: 3,
      currentSeasonTalentRecordCount: 130,
    });
    expect(flags).not.toContain("PRESEASON_PRIOR_A_FALLBACK");
    expect(flags).not.toContain("MISSING_CURRENT_TALENT");
    expect(flags).not.toContain("NO_CURRENT_SUCCESS_DATA");
    expect(flags).not.toContain("PRESEASON_ZERO_COMPLETED_GAMES");
  });
});

describe("buildCfbV2ShadowManifest", () => {
  it("produces a complete manifest with no market-derived field names, matching the honest current 2026 preseason state", () => {
    const ratingArtifact = ratingArtifactFixture([rating()]);
    const projectionArtifact = projectionArtifactFixture([projection()]);
    const manifest = buildCfbV2ShadowManifest({
      season: 2026,
      asOfWeek: 0,
      dataAsOf: "2026-08-20T00:00:00.000Z",
      generatedAt: "2026-08-20T12:00:00.000Z",
      ratingArtifact,
      ratingsArtifactPath: "data/generated/cfb/v2/preseason-ratings.json",
      ratingsContentHash: "sha-fnv1a-11111111",
      projectionArtifact,
      projectionsArtifactPath: "data/generated/cfb/v2/preseason-projections.json",
      projectionsContentHash: "sha-fnv1a-22222222",
      scoringSupportArtifact: scoringSupportFixture(),
      calibrationSupportArtifact: calibrationSupportFixture(),
      degradedFlags: ["PRESEASON_ZERO_COMPLETED_GAMES", "NO_CURRENT_SUCCESS_DATA"],
    });

    expect(manifest.schemaVersion).toBe(CFB_V2_SHADOW_MANIFEST_SCHEMA_VERSION);
    expect(manifest.pipelineStatus).toBe("published");
    expect(manifest.ratingRecordCount).toBe(1);
    expect(manifest.projectionRecordCount).toBe(1);
    expect(manifest.summary.fbsTeamsRated).toBe(1);
    expect(manifest.summary.projectionsAvailable).toBe(0);
    expect(manifest.summary.projectionsUnavailable).toBe(1);
    expect(manifest.scoringSupportArtifactVersion).toBe(CFB_V2_SCORING_NORMAL_EQUATIONS_ARTIFACT_VERSION);
    expect(manifest.calibrationSupportArtifactVersion).toBe(CFB_V2_CALIBRATION_RESIDUAL_ARTIFACT_VERSION);
    expect(manifest.degradedFlags).toContain("PRESEASON_ZERO_COMPLETED_GAMES");

    const json = JSON.stringify(manifest);
    expect(json).not.toMatch(/spread|moneyline|\bline\b|\bmic\b|marketanchor/i);
  });
});
