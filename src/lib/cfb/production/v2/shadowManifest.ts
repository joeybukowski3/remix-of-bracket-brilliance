// CFB Model V2 — shadow-state manifest (WU4 §3/§6/§8/§13). Production-owned
// provenance record proving the ratings/projections artifact pair form one
// coherent, versioned, reproducible state. Zero research runtime dependency.

import type { CfbV2ArtifactEnvelope } from "./artifactContracts";
import type { CfbV2GameProjection, CfbV2PriorTier, CfbV2TeamRating } from "./types";
import type { CfbV2CalibrationResidualSeedArtifact, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";

export const CFB_V2_SHADOW_MANIFEST_SCHEMA_VERSION = "cfb-v2-shadow-manifest-1" as const;

/**
 * Deterministic 32-bit FNV-1a hash, hex-encoded. Duplicated (not imported)
 * from versions.ts/scripts/cfb-v2-support-export.ts's private copies —
 * matches the established repo convention of keeping this tiny pure
 * function locally defined in each module that needs it rather than
 * threading an extra cross-module dependency for four lines of math.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * §6 content-hash semantics: hashes `records` after stripping each record's
 * own volatile `generatedAt` field (every CfbV2TeamRating/CfbV2GameProjection
 * row carries a per-row `generatedAt`, unlike the WU3A support artifacts
 * where the timestamp lives only at the envelope level) — so two builds run
 * at different wall-clock times, but from identical inputs, produce an
 * identical hash. `dataAsOf` is NOT stripped: it is data-derived provenance
 * (the last completed game's kickoff, or a fixed preseason anchor), not a
 * wall-clock artifact, and a real change in it should change the hash.
 */
export function computeCfbV2ArtifactContentHash(records: readonly Record<string, unknown>[]): string {
  const stripped = records.map((r) => {
    const { generatedAt: _generatedAt, ...rest } = r;
    return rest;
  });
  return `sha-fnv1a-${fnv1aHex(JSON.stringify(stripped))}`;
}

// ---------------------------------------------------------------------------
// §8 — degraded-input status. VALID_DEGRADED states are honest, expected
// preseason/early-season conditions — never confused with INVALID/UNAVAILABLE
// (a structural validation failure, which throws instead of publishing).
// ---------------------------------------------------------------------------

export type CfbV2ShadowDegradedFlag =
  | "MISSING_CURRENT_TALENT"
  | "PRESEASON_PRIOR_A_FALLBACK"
  | "NO_CURRENT_SUCCESS_DATA"
  | "PRESEASON_ZERO_COMPLETED_GAMES";

export type CfbV2ShadowPipelineStatus = "published";

export type CfbV2ShadowManifestSummary = {
  fbsTeamsRated: number;
  priorTierCounts: Readonly<Record<CfbV2PriorTier, number>>;
  projectionsAvailable: number;
  projectionsUnavailable: number;
  unsupportedMatchupCount: number;
};

/**
 * Production-owned provenance record for one published V2 shadow state
 * (§3). No market-derived field exists here — mirrors the same IPR-only
 * discipline as CfbV2TeamRating/CfbV2GameProjection.
 */
export type CfbV2ShadowManifest = {
  schemaVersion: string;
  season: number;
  asOfWeek: number;
  dataAsOf: string;
  generatedAt: string;

  ratingsArtifactPath: string;
  projectionsArtifactPath: string;
  ratingRecordCount: number;
  projectionRecordCount: number;

  modelVersion: string;
  scoringVersion: string;
  calibrationVersion: string;
  probabilityVersion: string;
  configVersion: string;

  scoringSupportArtifactVersion: string;
  scoringSupportContentHash: string;
  calibrationSupportArtifactVersion: string;
  calibrationSupportContentHash: string;

  ratingsContentHash: string;
  projectionsContentHash: string;

  pipelineStatus: CfbV2ShadowPipelineStatus;
  degradedFlags: readonly CfbV2ShadowDegradedFlag[];
  summary: CfbV2ShadowManifestSummary;
};

const ALL_PRIOR_TIERS: readonly CfbV2PriorTier[] = ["PRIOR_D", "PRIOR_C", "PRIOR_A", "LEAGUE_MEAN"];

/**
 * §8/§13 — derives the honest degraded-state flags for one build from the
 * actual rating/projection/SUCCESS-input state, never from a guess.
 */
export function computeCfbV2ShadowDegradedFlags(input: {
  ratings: readonly CfbV2TeamRating[];
  currentSeasonSuccessObservationCount: number;
  currentSeasonCompletedGameCount: number;
  currentSeasonTalentRecordCount: number;
}): CfbV2ShadowDegradedFlag[] {
  const flags: CfbV2ShadowDegradedFlag[] = [];
  if (input.currentSeasonTalentRecordCount === 0) flags.push("MISSING_CURRENT_TALENT");
  const priorATeams = input.ratings.filter((r) => r.priorTier === "PRIOR_A").length;
  if (input.ratings.length > 0 && priorATeams / input.ratings.length >= 0.5) flags.push("PRESEASON_PRIOR_A_FALLBACK");
  if (input.currentSeasonSuccessObservationCount === 0) flags.push("NO_CURRENT_SUCCESS_DATA");
  if (input.currentSeasonCompletedGameCount === 0) flags.push("PRESEASON_ZERO_COMPLETED_GAMES");
  return flags;
}

/** §13 — per-tier rating counts, for the manifest's honest-state summary. */
export function computeCfbV2PriorTierCounts(ratings: readonly CfbV2TeamRating[]): Record<CfbV2PriorTier, number> {
  const counts = Object.fromEntries(ALL_PRIOR_TIERS.map((t) => [t, 0])) as Record<CfbV2PriorTier, number>;
  for (const r of ratings) counts[r.priorTier] += 1;
  return counts;
}

export function buildCfbV2ShadowManifest(options: {
  season: number;
  asOfWeek: number;
  dataAsOf: string;
  generatedAt: string;
  ratingArtifact: CfbV2ArtifactEnvelope<CfbV2TeamRating>;
  ratingsArtifactPath: string;
  ratingsContentHash: string;
  projectionArtifact: CfbV2ArtifactEnvelope<CfbV2GameProjection>;
  projectionsArtifactPath: string;
  projectionsContentHash: string;
  scoringSupportArtifact: CfbV2ScoringNormalEquationsArtifact;
  calibrationSupportArtifact: CfbV2CalibrationResidualSeedArtifact;
  degradedFlags: readonly CfbV2ShadowDegradedFlag[];
}): CfbV2ShadowManifest {
  const { ratingArtifact, projectionArtifact } = options;
  const priorTierCounts = computeCfbV2PriorTierCounts(ratingArtifact.records);
  const projectionsAvailable = projectionArtifact.records.filter((p) => p.projectionStatus === "computed").length;
  const projectionsUnavailable = projectionArtifact.records.length - projectionsAvailable;
  const unsupportedMatchupCount = projectionArtifact.records.filter((p) => p.matchupPopulation === "unsupported").length;

  return {
    schemaVersion: CFB_V2_SHADOW_MANIFEST_SCHEMA_VERSION,
    season: options.season,
    asOfWeek: options.asOfWeek,
    dataAsOf: options.dataAsOf,
    generatedAt: options.generatedAt,

    ratingsArtifactPath: options.ratingsArtifactPath,
    projectionsArtifactPath: options.projectionsArtifactPath,
    ratingRecordCount: ratingArtifact.records.length,
    projectionRecordCount: projectionArtifact.records.length,

    modelVersion: ratingArtifact.modelVersion,
    scoringVersion: projectionArtifact.versions.scoring,
    calibrationVersion: projectionArtifact.versions.calibration,
    probabilityVersion: projectionArtifact.versions.probability,
    configVersion: ratingArtifact.configVersion,

    scoringSupportArtifactVersion: options.scoringSupportArtifact.artifactVersion,
    scoringSupportContentHash: options.scoringSupportArtifact.contentHash,
    calibrationSupportArtifactVersion: options.calibrationSupportArtifact.artifactVersion,
    calibrationSupportContentHash: options.calibrationSupportArtifact.contentHash,

    ratingsContentHash: options.ratingsContentHash,
    projectionsContentHash: options.projectionsContentHash,

    pipelineStatus: "published",
    degradedFlags: options.degradedFlags,
    summary: {
      fbsTeamsRated: ratingArtifact.records.length,
      priorTierCounts,
      projectionsAvailable,
      projectionsUnavailable,
      unsupportedMatchupCount,
    },
  };
}
