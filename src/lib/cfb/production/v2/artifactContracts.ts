// CFB Model V2 — artifact envelope + path conventions (Phase 10 §4/§14, WU1).
//
// No file under data/generated/cfb/v2/ is written by this work unit — these
// are path/shape constants only, consumed by a later work unit's generator
// scripts (Phase 10 §28 WU3/WU4).

import type { CfbV2Versions } from "./versions";

/**
 * Typed envelope wrapping every V2 artifact. Provenance fields are
 * required, not optional, unless documented otherwise (WU1 §13).
 */
export type CfbV2ArtifactEnvelope<TRecord> = {
  schemaVersion: string;
  modelVersion: string;
  versions: CfbV2Versions;
  configVersion: string;
  generatedAt: string;
  dataAsOf: string;
  season: number;
  /** Present for weekly artifacts; omitted (0/undefined not used — see preseason variant) for the once-per-season preseason snapshot. */
  asOfWeek: number;
  records: readonly TRecord[];
};

export const CFB_V2_ARTIFACT_SCHEMA_VERSION = "cfb-v2-artifact-schema-1" as const;

/** Production V2 artifact directory — never `data/cfb/research/**` (§15). */
export const CFB_V2_ARTIFACT_DIR = "data/generated/cfb/v2" as const;

export function cfbV2PreseasonRatingsPath(): string {
  return `${CFB_V2_ARTIFACT_DIR}/preseason-ratings.json`;
}

function twoDigitWeek(week: number): string {
  return String(week).padStart(2, "0");
}

export function cfbV2WeekRatingsPath(week: number): string {
  return `${CFB_V2_ARTIFACT_DIR}/week-${twoDigitWeek(week)}-ratings.json`;
}

export function cfbV2WeekProjectionsPath(week: number): string {
  return `${CFB_V2_ARTIFACT_DIR}/week-${twoDigitWeek(week)}-projections.json`;
}

export function cfbV2ManifestPath(): string {
  return `${CFB_V2_ARTIFACT_DIR}/manifest.json`;
}
