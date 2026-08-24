// CFB Model V2 — shadow-state audit (WU6 §2/§3/§4). Pure, read-only,
// deterministic: takes an already-loaded manifest + ratings artifact +
// projections artifact (+ the two frozen support artifacts, for the same
// cross-artifact check WU4's orchestrator already runs), never mutates
// anything, and never touches the filesystem itself (the CLI renderer in
// scripts/cfb-v2-audit-shadow.ts owns all I/O). Reuses the EXISTING
// fail-closed validators (validateCfbV2TeamRatings,
// validateCfbV2GameProjections, assertPublishableCfbV2Shadow) rather than
// re-implementing structural checks — this module's own job is the
// statistical/distributional reporting those validators don't produce,
// plus turning their pass/fail into one of three explicit health states.

import { validateCfbV2TeamRatings } from "./ratingValidation";
import { validateCfbV2GameProjections } from "./projectionValidation";
import { assertPublishableCfbV2Shadow } from "./shadowValidation";
import type { CfbV2ArtifactEnvelope } from "./artifactContracts";
import type { CfbV2GameProjection, CfbV2MatchupPopulation, CfbV2PriorTier, CfbV2ProjectionStatus, CfbV2TeamRating } from "./types";
import type { CfbV2CalibrationResidualSeedArtifact, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";
import type { CfbV2ShadowManifest } from "./shadowManifest";

export type CfbV2ShadowHealthState = "HEALTHY" | "DEGRADED" | "INVALID";

export type CfbV2ShadowAuditIssue = {
  severity: "invalid" | "degraded";
  code: string;
  message: string;
};

export type CfbV2AuditDistribution<K extends string> = Readonly<Record<K, number>>;

export type CfbV2ShadowRatingsAudit = {
  totalTeams: number;
  priorTierCounts: CfbV2AuditDistribution<CfbV2PriorTier>;
  gamesPlayedDistribution: { min: number; median: number; max: number };
  componentSizeDistribution: Record<string, number>;
  regularizationMultiplierDistribution: Record<string, number>;
  overallRating: { min: number; median: number; max: number };
  duplicateTeamIds: readonly string[];
};

export type CfbV2ShadowProjectionsAudit = {
  totalRecords: number;
  matchupPopulationCounts: CfbV2AuditDistribution<CfbV2MatchupPopulation>;
  projectionStatusCounts: CfbV2AuditDistribution<CfbV2ProjectionStatus>;
  /** Only meaningful for fbs_vs_fbs rows — a non-fbs_vs_fbs row is unavailable by population, not by an "unavailable reason." */
  unavailableFbsVsFbsCount: number;
  duplicateGameIds: readonly string[];
};

export type CfbV2ShadowAuditResult = {
  healthState: CfbV2ShadowHealthState;
  issues: readonly CfbV2ShadowAuditIssue[];
  manifest: {
    schemaVersion: string;
    pipelineStatus: string;
    generatedAt: string;
    dataAsOf: string;
    season: number;
    asOfWeek: number;
    configVersion: string;
    modelVersion: string;
    scoringVersion: string;
    calibrationVersion: string;
    probabilityVersion: string;
    degradedFlags: readonly string[];
    ratingsContentHash: string;
    projectionsContentHash: string;
  };
  ratings: CfbV2ShadowRatingsAudit;
  projections: CfbV2ShadowProjectionsAudit;
};

function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function minMedianMax(values: readonly number[]): { min: number; median: number; max: number } {
  if (values.length === 0) return { min: NaN, median: NaN, max: NaN };
  return { min: Math.min(...values), median: median(values), max: Math.max(...values) };
}

function componentSizeBucket(componentSize: number): string {
  return componentSize === 1 ? "1 (isolated)" : componentSize <= 10 ? "2-10" : componentSize <= 50 ? "11-50" : "51+";
}

function multiplierBucket(multiplier: number): string {
  return multiplier >= 2.9 ? "~3.0 (max)" : multiplier >= 2 ? "2.0-2.9" : multiplier > 1 ? "1.0-2.0" : "1.0 (min)";
}

function auditRatings(ratings: readonly CfbV2TeamRating[]): CfbV2ShadowRatingsAudit {
  const priorTierCounts: Record<CfbV2PriorTier, number> = { PRIOR_D: 0, PRIOR_C: 0, PRIOR_A: 0, LEAGUE_MEAN: 0 };
  const componentSizeDistribution: Record<string, number> = {};
  const regularizationMultiplierDistribution: Record<string, number> = {};
  const seen = new Set<string>();
  const duplicateTeamIds: string[] = [];
  const gamesPlayed: number[] = [];
  const overall: number[] = [];

  for (const r of ratings) {
    if (seen.has(r.teamId)) duplicateTeamIds.push(r.teamId);
    seen.add(r.teamId);
    priorTierCounts[r.priorTier] += 1;
    const csBucket = componentSizeBucket(r.connectivity.componentSize);
    componentSizeDistribution[csBucket] = (componentSizeDistribution[csBucket] ?? 0) + 1;
    const multBucket = multiplierBucket(r.connectivity.regularizationMultiplier);
    regularizationMultiplierDistribution[multBucket] = (regularizationMultiplierDistribution[multBucket] ?? 0) + 1;
    gamesPlayed.push(r.gamesPlayed);
    overall.push(r.overallRating);
  }

  return {
    totalTeams: ratings.length,
    priorTierCounts,
    gamesPlayedDistribution: minMedianMax(gamesPlayed),
    componentSizeDistribution,
    regularizationMultiplierDistribution,
    overallRating: minMedianMax(overall),
    duplicateTeamIds,
  };
}

function auditProjections(projections: readonly CfbV2GameProjection[]): CfbV2ShadowProjectionsAudit {
  const matchupPopulationCounts: Record<CfbV2MatchupPopulation, number> = { fbs_vs_fbs: 0, fbs_vs_fcs: 0, unsupported: 0 };
  const projectionStatusCounts: Record<CfbV2ProjectionStatus, number> = { computed: 0, unavailable: 0 };
  const seen = new Set<string>();
  const duplicateGameIds: string[] = [];
  let unavailableFbsVsFbsCount = 0;

  for (const p of projections) {
    if (seen.has(p.gameId)) duplicateGameIds.push(p.gameId);
    seen.add(p.gameId);
    matchupPopulationCounts[p.matchupPopulation] += 1;
    projectionStatusCounts[p.projectionStatus] += 1;
    if (p.matchupPopulation === "fbs_vs_fbs" && p.projectionStatus === "unavailable") unavailableFbsVsFbsCount += 1;
  }

  return {
    totalRecords: projections.length,
    matchupPopulationCounts,
    projectionStatusCounts,
    unavailableFbsVsFbsCount,
    duplicateGameIds,
  };
}

export type CfbV2ShadowAuditInput = {
  manifest: CfbV2ShadowManifest;
  ratingArtifact: CfbV2ArtifactEnvelope<CfbV2TeamRating>;
  projectionArtifact: CfbV2ArtifactEnvelope<CfbV2GameProjection>;
  scoringSupportArtifact: CfbV2ScoringNormalEquationsArtifact;
  calibrationSupportArtifact: CfbV2CalibrationResidualSeedArtifact;
  expectedConfigVersion: string;
};

/**
 * Runs the full read-only shadow audit. Never throws — every failure mode
 * (a validator throwing, a manifest/artifact mismatch, an empty artifact)
 * is captured as an `issues` entry and reflected in `healthState` instead.
 */
export function auditCfbV2Shadow(input: CfbV2ShadowAuditInput): CfbV2ShadowAuditResult {
  const { manifest, ratingArtifact, projectionArtifact } = input;
  const issues: CfbV2ShadowAuditIssue[] = [];

  if (manifest.pipelineStatus !== "published") {
    issues.push({ severity: "invalid", code: "PIPELINE_STATUS_NOT_PUBLISHED", message: `manifest.pipelineStatus is "${manifest.pipelineStatus}", expected "published"` });
  }
  if (manifest.ratingRecordCount !== ratingArtifact.records.length) {
    issues.push({ severity: "invalid", code: "MANIFEST_RATING_COUNT_MISMATCH", message: `manifest.ratingRecordCount (${manifest.ratingRecordCount}) does not match the loaded rating artifact's records.length (${ratingArtifact.records.length})` });
  }
  if (manifest.projectionRecordCount !== projectionArtifact.records.length) {
    issues.push({ severity: "invalid", code: "MANIFEST_PROJECTION_COUNT_MISMATCH", message: `manifest.projectionRecordCount (${manifest.projectionRecordCount}) does not match the loaded projection artifact's records.length (${projectionArtifact.records.length})` });
  }
  if (manifest.season !== ratingArtifact.season || manifest.season !== projectionArtifact.season) {
    issues.push({ severity: "invalid", code: "SEASON_MISMATCH", message: `season mismatch: manifest=${manifest.season} ratings=${ratingArtifact.season} projections=${projectionArtifact.season}` });
  }
  if (manifest.asOfWeek !== ratingArtifact.asOfWeek || manifest.asOfWeek !== projectionArtifact.asOfWeek) {
    issues.push({ severity: "invalid", code: "ASOFWEEK_MISMATCH", message: `asOfWeek mismatch: manifest=${manifest.asOfWeek} ratings=${ratingArtifact.asOfWeek} projections=${projectionArtifact.asOfWeek}` });
  }

  try {
    validateCfbV2TeamRatings(ratingArtifact.records, new Set(ratingArtifact.records.map((r) => r.teamId)));
  } catch (error) {
    issues.push({ severity: "invalid", code: "RATING_VALIDATION_FAILED", message: error instanceof Error ? error.message : String(error) });
  }

  try {
    validateCfbV2GameProjections(projectionArtifact.records);
  } catch (error) {
    issues.push({ severity: "invalid", code: "PROJECTION_VALIDATION_FAILED", message: error instanceof Error ? error.message : String(error) });
  }

  try {
    assertPublishableCfbV2Shadow({
      ratingArtifact,
      projectionArtifact,
      scoringSupportArtifact: input.scoringSupportArtifact,
      calibrationSupportArtifact: input.calibrationSupportArtifact,
      expectedConfigVersion: input.expectedConfigVersion,
    });
  } catch (error) {
    issues.push({ severity: "invalid", code: "CROSS_ARTIFACT_VALIDATION_FAILED", message: error instanceof Error ? error.message : String(error) });
  }

  const ratings = auditRatings(ratingArtifact.records);
  const projections = auditProjections(projectionArtifact.records);

  // §4 HEALTHY requires >=1 computed FBS-vs-FBS projection whenever the
  // manifest's own degraded flags say completed-game/SUCCESS data IS
  // present (i.e. this is not honest preseason) — an unexplained mass
  // availability drop with no degraded-flag explanation is exactly the
  // "surprising" state Gate C exists to catch, not a silent HEALTHY.
  const impliesRealCurrentSeasonData = !manifest.degradedFlags.includes("PRESEASON_ZERO_COMPLETED_GAMES") && !manifest.degradedFlags.includes("NO_CURRENT_SUCCESS_DATA");
  if (impliesRealCurrentSeasonData && projections.matchupPopulationCounts.fbs_vs_fbs > 0 && projections.projectionStatusCounts.computed === 0) {
    issues.push({
      severity: "invalid",
      code: "UNEXPECTED_ZERO_COMPUTED_PROJECTIONS",
      message: "current-season SUCCESS/completed-game data is present (no preseason degraded flags), FBS-vs-FBS games exist, but zero projections computed — surprising, not an expected degraded state",
    });
  }

  for (const flag of manifest.degradedFlags) {
    issues.push({ severity: "degraded", code: `DEGRADED_FLAG_${flag}`, message: `manifest reports degraded flag: ${flag}` });
  }

  const hasInvalid = issues.some((i) => i.severity === "invalid");
  const hasDegraded = issues.some((i) => i.severity === "degraded");
  const healthState: CfbV2ShadowHealthState = hasInvalid ? "INVALID" : hasDegraded ? "DEGRADED" : "HEALTHY";

  return {
    healthState,
    issues,
    manifest: {
      schemaVersion: manifest.schemaVersion,
      pipelineStatus: manifest.pipelineStatus,
      generatedAt: manifest.generatedAt,
      dataAsOf: manifest.dataAsOf,
      season: manifest.season,
      asOfWeek: manifest.asOfWeek,
      configVersion: manifest.configVersion,
      modelVersion: manifest.modelVersion,
      scoringVersion: manifest.scoringVersion,
      calibrationVersion: manifest.calibrationVersion,
      probabilityVersion: manifest.probabilityVersion,
      degradedFlags: manifest.degradedFlags,
      ratingsContentHash: manifest.ratingsContentHash,
      projectionsContentHash: manifest.projectionsContentHash,
    },
    ratings,
    projections,
  };
}
