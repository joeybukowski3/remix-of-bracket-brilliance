/**
 * Versioned reference-range artifact support (Phase 1).
 *
 * Fixed reference ranges are the versioned artifact that makes an Absolute
 * Score stable across slates: identical inputs + identical artifact version
 * produce identical scores regardless of slate composition.
 *
 * The Phase 1 bridge artifact (`hr-bridge-v1`) inherits ranges already
 * verified in current production logic — it is NOT an empirical multi-season
 * derivation. A later derivation script can emit a new artifact version
 * (with sourceSeasons/sampleCount populated) without changing the score
 * engine interface.
 */

import type {
  ReferenceRangeArtifact,
  ReferenceRangeEntry,
  ValidationResult,
} from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateReferenceRangeArtifact(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ["artifact is not an object"] };
  }
  if (!isNonEmptyString(value.artifactVersion)) errors.push("artifactVersion missing");
  if (!isNonEmptyString(value.scoreVersion)) errors.push("scoreVersion missing");
  if (!isNonEmptyString(value.generatedAt)) errors.push("generatedAt missing");
  if (!isNonEmptyString(value.sourceDescription)) errors.push("sourceDescription missing");
  if (!isNonEmptyString(value.populationDefinition)) errors.push("populationDefinition missing");
  if (value.sourceSeasons !== null && !Array.isArray(value.sourceSeasons)) {
    errors.push("sourceSeasons must be an array or null");
  }
  if (value.sampleCount !== null && !isFiniteNumber(value.sampleCount)) {
    errors.push("sampleCount must be a finite number or null");
  }
  if (!Array.isArray(value.ranges) || value.ranges.length === 0) {
    errors.push("ranges must be a non-empty array");
    return { valid: errors.length === 0, errors };
  }
  const seen = new Set<string>();
  for (const entry of value.ranges) {
    if (!isRecord(entry)) {
      errors.push("range entry is not an object");
      continue;
    }
    const key = entry.metricKey;
    if (!isNonEmptyString(key)) {
      errors.push("range entry missing metricKey");
      continue;
    }
    if (seen.has(key)) errors.push(`duplicate range for metric "${key}"`);
    seen.add(key);
    if (!isFiniteNumber(entry.min)) errors.push(`range "${key}": min is not finite`);
    if (!isFiniteNumber(entry.max)) errors.push(`range "${key}": max is not finite`);
    if (isFiniteNumber(entry.min) && isFiniteNumber(entry.max) && entry.max <= entry.min) {
      errors.push(`range "${key}": max must exceed min`);
    }
    if (!isNonEmptyString(entry.provenance)) {
      errors.push(`range "${key}": provenance is required (bridge ranges must stay traceable)`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Parse and validate an already-fetched/read artifact payload.
 * Throws on invalid artifacts — a scoring run must never proceed with
 * silently defaulted ranges.
 */
export function parseReferenceRangeArtifact(value: unknown): ReferenceRangeArtifact {
  const result = validateReferenceRangeArtifact(value);
  if (!result.valid) {
    throw new Error(`Invalid reference-range artifact: ${result.errors.join("; ")}`);
  }
  return value as ReferenceRangeArtifact;
}

export function getRangeEntry(
  artifact: ReferenceRangeArtifact,
  metricKey: string,
): ReferenceRangeEntry | null {
  return artifact.ranges.find((r) => r.metricKey === metricKey) ?? null;
}

/** Browser-relative public path for a range artifact by version id. */
export function referenceRangeArtifactPath(artifactVersion: string): string {
  return `/data/mlb/model-reference-ranges/${artifactVersion}.json`;
}
