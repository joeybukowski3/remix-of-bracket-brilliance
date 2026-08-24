// CFB Model V2 — game-projection artifact writer (WU3 §21). Writes ONLY to
// data/generated/cfb/v2/ (WU1's artifactContracts.ts paths), never to any
// V1/V1.1 path. Validation (projectionValidation.ts) must pass before this
// is called — writing is not itself a validation gate.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CFB_V2_ARTIFACT_SCHEMA_VERSION, cfbV2PreseasonProjectionsPath, cfbV2WeekProjectionsPath, type CfbV2ArtifactEnvelope } from "./artifactContracts";
import { CFB_V2_CONFIG_VERSION } from "./config";
import { CFB_V2_MODEL_VERSION, CFB_V2_VERSIONS } from "./versions";
import type { CfbV2GameProjection } from "./types";

export type CfbV2GameProjectionArtifact = CfbV2ArtifactEnvelope<CfbV2GameProjection>;

export function buildCfbV2GameProjectionArtifact(options: {
  season: number;
  asOfWeek: number;
  generatedAt: string;
  dataAsOf: string;
  records: readonly CfbV2GameProjection[];
}): CfbV2GameProjectionArtifact {
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

/** `asOfWeek === 0` is the once-per-season preseason snapshot; otherwise the weekly path is used (mirrors artifactWriter.ts's rating-artifact convention). */
export function cfbV2GameProjectionArtifactPath(asOfWeek: number): string {
  return asOfWeek === 0 ? cfbV2PreseasonProjectionsPath() : cfbV2WeekProjectionsPath(asOfWeek);
}

/** Writes the artifact to `repoRoot/<path>`, creating parent directories as needed. Never overwrites a V1/V1.1 path, and never the WU2 rating-artifact path (a distinct path family — see artifactContracts.ts). */
export function writeCfbV2GameProjectionArtifact(repoRoot: string, artifact: CfbV2GameProjectionArtifact): string {
  const relativePath = cfbV2GameProjectionArtifactPath(artifact.asOfWeek);
  const absolutePath = resolve(repoRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return relativePath;
}
