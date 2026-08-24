// CFB Model V2 — atomic shadow-state promotion (WU4 §4/§7/§20). Writes the
// ratings artifact, projections artifact, and manifest to STAGING temp files
// first, then renames each into place — so a reader never observes a
// partially-written file, and a failure anywhere before this module is
// called leaves the previous last-known-good state completely untouched
// (this module is only ever invoked AFTER assertPublishableCfbV2Shadow has
// already passed — see scripts/cfb-v2-build-shadow.ts).

import { writeFileSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cfbV2ManifestPath } from "./artifactContracts";
import type { CfbV2ShadowManifest } from "./shadowManifest";

/**
 * Writes `content` to `repoRoot/<relativePath>` via a same-directory temp
 * file + `renameSync` (atomic on the same filesystem/volume on both POSIX
 * and Windows/NTFS) so a concurrent reader never observes a partially
 * written file, and a crash mid-write leaves the previous file untouched.
 */
export function writeCfbV2JsonAtomic(repoRoot: string, relativePath: string, content: unknown): string {
  const absolutePath = resolve(repoRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
    renameSync(tempPath, absolutePath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup — the primary error below is what matters.
    }
    throw error;
  }
  return relativePath;
}

export type CfbV2ShadowPublishResult = {
  ratingsPath: string;
  projectionsPath: string;
  manifestPath: string;
};

/**
 * §4 — promotes a fully-validated shadow state as one unit: ratings first,
 * projections second, manifest LAST (the manifest is the discovery pointer
 * a reader is expected to use — see artifactContracts.ts — so promoting it
 * last means a reader that only ever consults the manifest never observes
 * an inconsistent pair; a reader that bypasses the manifest and reads the
 * ratings/projections paths directly could in principle observe a narrow
 * window between the first two renames, an accepted tradeoff for a
 * single-writer batch job, not a concern this work unit needs to solve).
 *
 * Callers MUST have already run assertPublishableCfbV2Shadow (or an
 * equivalent full validation pass) — this function does not re-validate,
 * it only writes.
 */
export function promoteCfbV2ShadowState(
  repoRoot: string,
  state: {
    ratingsArtifactPath: string;
    ratingsArtifact: unknown;
    projectionsArtifactPath: string;
    projectionsArtifact: unknown;
    manifest: CfbV2ShadowManifest;
  },
): CfbV2ShadowPublishResult {
  writeCfbV2JsonAtomic(repoRoot, state.ratingsArtifactPath, state.ratingsArtifact);
  writeCfbV2JsonAtomic(repoRoot, state.projectionsArtifactPath, state.projectionsArtifact);
  const manifestPath = writeCfbV2JsonAtomic(repoRoot, cfbV2ManifestPath(), state.manifest);
  return { ratingsPath: state.ratingsArtifactPath, projectionsPath: state.projectionsArtifactPath, manifestPath };
}

export type CfbV2ShadowFailureDiagnostics = {
  failedStage: string;
  reason: string;
  occurredAt: string;
  artifactPromoted: false;
};

/** §7/§20 — a build failure writes diagnostics to a SEPARATE gitignored file, never overwriting manifest.json (the last-known-good pointer). */
export function cfbV2ShadowFailureDiagnosticsPath(): string {
  return `${dirname(cfbV2ManifestPath())}/manifest.failure.json`;
}

export function writeCfbV2ShadowFailureDiagnostics(repoRoot: string, failedStage: string, reason: string, occurredAt: string): string {
  const diagnostics: CfbV2ShadowFailureDiagnostics = { failedStage, reason, occurredAt, artifactPromoted: false };
  return writeCfbV2JsonAtomic(repoRoot, cfbV2ShadowFailureDiagnosticsPath(), diagnostics);
}
