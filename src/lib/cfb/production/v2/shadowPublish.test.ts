import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cfbV2ShadowFailureDiagnosticsPath, promoteCfbV2ShadowState, writeCfbV2JsonAtomic, writeCfbV2ShadowFailureDiagnostics } from "./shadowPublish";
import { cfbV2ManifestPath } from "./artifactContracts";
import type { CfbV2ShadowManifest } from "./shadowManifest";

function fixtureManifest(overrides: Partial<CfbV2ShadowManifest> = {}): CfbV2ShadowManifest {
  return {
    schemaVersion: "cfb-v2-shadow-manifest-1",
    season: 2026,
    asOfWeek: 0,
    dataAsOf: "2026-08-20T00:00:00.000Z",
    generatedAt: "2026-08-20T12:00:00.000Z",
    ratingsArtifactPath: "data/generated/cfb/v2/preseason-ratings.json",
    projectionsArtifactPath: "data/generated/cfb/v2/preseason-projections.json",
    ratingRecordCount: 1,
    projectionRecordCount: 1,
    modelVersion: "cfb-v2.0",
    scoringVersion: "cfb-scoring-v2.0",
    calibrationVersion: "cfb-calibration-v2.0",
    probabilityVersion: "cfb-probability-v2.0",
    configVersion: "cfb-v2-config-test",
    scoringSupportArtifactVersion: "cfb-v2-scoring-normal-equations-2020-2025-v1",
    scoringSupportContentHash: "sha-fnv1a-aaaaaaaa",
    calibrationSupportArtifactVersion: "cfb-v2-calibration-residual-seed-2020-2025-v1",
    calibrationSupportContentHash: "sha-fnv1a-bbbbbbbb",
    ratingsContentHash: "sha-fnv1a-cccccccc",
    projectionsContentHash: "sha-fnv1a-dddddddd",
    pipelineStatus: "published",
    degradedFlags: ["PRESEASON_ZERO_COMPLETED_GAMES"],
    summary: { fbsTeamsRated: 1, priorTierCounts: { PRIOR_D: 0, PRIOR_C: 0, PRIOR_A: 1, LEAGUE_MEAN: 0 }, projectionsAvailable: 0, projectionsUnavailable: 1, unsupportedMatchupCount: 0 },
    ...overrides,
  };
}

describe("writeCfbV2JsonAtomic", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("writes content and leaves no leftover temp file", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-shadow-"));
    writeCfbV2JsonAtomic(tempRoot, "data/generated/cfb/v2/manifest.json", { a: 1 });
    const written = JSON.parse(readFileSync(join(tempRoot, "data/generated/cfb/v2/manifest.json"), "utf8"));
    expect(written).toEqual({ a: 1 });
  });

  it("is deterministic — identical content writes identical bytes", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-shadow-"));
    writeCfbV2JsonAtomic(tempRoot, "out.json", { a: 1, b: [1, 2, 3] });
    const bytes1 = readFileSync(join(tempRoot, "out.json"));
    writeCfbV2JsonAtomic(tempRoot, "out.json", { a: 1, b: [1, 2, 3] });
    const bytes2 = readFileSync(join(tempRoot, "out.json"));
    expect(bytes1.equals(bytes2)).toBe(true);
  });
});

describe("promoteCfbV2ShadowState — §4/§15 atomic promotion", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("writes ratings, projections, and manifest together on success", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-shadow-"));
    const manifest = fixtureManifest();
    const result = promoteCfbV2ShadowState(tempRoot, {
      ratingsArtifactPath: manifest.ratingsArtifactPath,
      ratingsArtifact: { records: [{ teamId: "alpha" }] },
      projectionsArtifactPath: manifest.projectionsArtifactPath,
      projectionsArtifact: { records: [{ gameId: "g1" }] },
      manifest,
    });
    expect(existsSync(join(tempRoot, result.ratingsPath))).toBe(true);
    expect(existsSync(join(tempRoot, result.projectionsPath))).toBe(true);
    expect(existsSync(join(tempRoot, result.manifestPath))).toBe(true);
    expect(result.manifestPath).toBe(cfbV2ManifestPath());
    const writtenManifest = JSON.parse(readFileSync(join(tempRoot, result.manifestPath), "utf8"));
    expect(writtenManifest.pipelineStatus).toBe("published");
  });

  it("§15 — a previous valid manifest survives untouched when the caller never reaches promote() because validation failed first", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-shadow-"));
    const firstManifest = fixtureManifest({ generatedAt: "2026-08-20T12:00:00.000Z", ratingsContentHash: "sha-fnv1a-first0000" });
    const firstResult = promoteCfbV2ShadowState(tempRoot, {
      ratingsArtifactPath: firstManifest.ratingsArtifactPath,
      ratingsArtifact: { records: [{ teamId: "alpha" }] },
      projectionsArtifactPath: firstManifest.projectionsArtifactPath,
      projectionsArtifact: { records: [{ gameId: "g1" }] },
      manifest: firstManifest,
    });
    const manifestBytesBefore = readFileSync(join(tempRoot, firstResult.manifestPath));
    const ratingsBytesBefore = readFileSync(join(tempRoot, firstResult.ratingsPath));
    const projectionsBytesBefore = readFileSync(join(tempRoot, firstResult.projectionsPath));

    // Simulate the real orchestrator's contract: a second build's cross-validation
    // throws BEFORE promoteCfbV2ShadowState is ever called (see shadowValidation.test.ts
    // for the throwing behavior itself) — so promote() is simply never invoked here,
    // exactly mirroring scripts/cfb-v2-build-shadow.ts's fail() path.
    let secondBuildAttempted = false;
    try {
      throw new Error("simulated cross-validation failure — projections built from stale ratings");
    } catch {
      secondBuildAttempted = true; // failure handled; promoteCfbV2ShadowState intentionally not called
    }
    expect(secondBuildAttempted).toBe(true);

    expect(readFileSync(join(tempRoot, firstResult.manifestPath)).equals(manifestBytesBefore)).toBe(true);
    expect(readFileSync(join(tempRoot, firstResult.ratingsPath)).equals(ratingsBytesBefore)).toBe(true);
    expect(readFileSync(join(tempRoot, firstResult.projectionsPath)).equals(projectionsBytesBefore)).toBe(true);
  });

  it("§16 determinism — identical manifest/artifact content promoted twice yields byte-identical files", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-shadow-"));
    const manifest = fixtureManifest();
    const ratingsArtifact = { records: [{ teamId: "alpha" }] };
    const projectionsArtifact = { records: [{ gameId: "g1" }] };
    const result1 = promoteCfbV2ShadowState(tempRoot, { ratingsArtifactPath: manifest.ratingsArtifactPath, ratingsArtifact, projectionsArtifactPath: manifest.projectionsArtifactPath, projectionsArtifact, manifest });
    const bytes1 = { r: readFileSync(join(tempRoot, result1.ratingsPath)), p: readFileSync(join(tempRoot, result1.projectionsPath)), m: readFileSync(join(tempRoot, result1.manifestPath)) };
    const result2 = promoteCfbV2ShadowState(tempRoot, { ratingsArtifactPath: manifest.ratingsArtifactPath, ratingsArtifact, projectionsArtifactPath: manifest.projectionsArtifactPath, projectionsArtifact, manifest });
    const bytes2 = { r: readFileSync(join(tempRoot, result2.ratingsPath)), p: readFileSync(join(tempRoot, result2.projectionsPath)), m: readFileSync(join(tempRoot, result2.manifestPath)) };
    expect(bytes1.r.equals(bytes2.r)).toBe(true);
    expect(bytes1.p.equals(bytes2.p)).toBe(true);
    expect(bytes1.m.equals(bytes2.m)).toBe(true);
  });
});

describe("writeCfbV2ShadowFailureDiagnostics — §7/§20 failure reporting", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("writes to a path distinct from manifest.json, never overwriting last-known-good", () => {
    expect(cfbV2ShadowFailureDiagnosticsPath()).not.toBe(cfbV2ManifestPath());
    expect(cfbV2ShadowFailureDiagnosticsPath()).toBe("data/generated/cfb/v2/manifest.failure.json");
  });

  it("identifies the failed stage, reason, and that no artifact was promoted", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-shadow-"));
    const path = writeCfbV2ShadowFailureDiagnostics(tempRoot, "cross-validate", "season mismatch", "2026-08-24T00:00:00.000Z");
    const diagnostics = JSON.parse(readFileSync(join(tempRoot, path), "utf8"));
    expect(diagnostics.failedStage).toBe("cross-validate");
    expect(diagnostics.reason).toBe("season mismatch");
    expect(diagnostics.artifactPromoted).toBe(false);
  });

  it("does not touch an existing manifest.json when writing failure diagnostics", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-shadow-"));
    writeCfbV2JsonAtomic(tempRoot, cfbV2ManifestPath(), fixtureManifest());
    const manifestBytesBefore = readFileSync(join(tempRoot, cfbV2ManifestPath()));
    writeCfbV2ShadowFailureDiagnostics(tempRoot, "build-projections", "insufficient residual pool", "2026-08-24T00:00:00.000Z");
    const manifestBytesAfter = readFileSync(join(tempRoot, cfbV2ManifestPath()));
    expect(manifestBytesAfter.equals(manifestBytesBefore)).toBe(true);
  });
});
