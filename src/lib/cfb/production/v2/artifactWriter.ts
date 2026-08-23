// CFB Model V2 — team-rating artifact writer (Phase 10 §4/§14, WU2 §19/§20).
// Writes ONLY to data/generated/cfb/v2/ (WU1's artifactContracts.ts paths),
// never to any V1/V1.1 path. Validation (ratingValidation.ts) must pass
// before this is called — writing is not itself a validation gate.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CFB_V2_ARTIFACT_SCHEMA_VERSION, cfbV2PreseasonRatingsPath, cfbV2WeekRatingsPath, type CfbV2ArtifactEnvelope } from "./artifactContracts";
import { CFB_V2_CONFIG_VERSION } from "./config";
import { CFB_V2_MODEL_VERSION, CFB_V2_VERSIONS } from "./versions";
import type { CfbV2TeamRating } from "./types";

export type CfbV2TeamRatingArtifact = CfbV2ArtifactEnvelope<CfbV2TeamRating>;

export function buildCfbV2TeamRatingArtifact(options: {
  season: number;
  asOfWeek: number;
  generatedAt: string;
  dataAsOf: string;
  records: readonly CfbV2TeamRating[];
}): CfbV2TeamRatingArtifact {
  return {
    schemaVersion: CFB_V2_ARTIFACT_SCHEMA_VERSION,
    modelVersion: CFB_V2_MODEL_VERSION,
    versions: CFB_V2_VERSIONS,
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: options.generatedAt,
    dataAsOf: options.dataAsOf,
    season: options.season,
    asOfWeek: options.asOfWeek,
    records: options.records,
  };
}

/** `asOfWeek === 0` is the once-per-season preseason snapshot; otherwise the weekly path is used (WU1 §14). */
export function cfbV2TeamRatingArtifactPath(asOfWeek: number): string {
  return asOfWeek === 0 ? cfbV2PreseasonRatingsPath() : cfbV2WeekRatingsPath(asOfWeek);
}

/** Writes the artifact to `repoRoot/<path>`, creating parent directories as needed. Never overwrites a V1/V1.1 path — the path always comes from artifactContracts.ts's v2 family. */
export function writeCfbV2TeamRatingArtifact(repoRoot: string, artifact: CfbV2TeamRatingArtifact): string {
  const relativePath = cfbV2TeamRatingArtifactPath(artifact.asOfWeek);
  const absolutePath = resolve(repoRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return relativePath;
}
