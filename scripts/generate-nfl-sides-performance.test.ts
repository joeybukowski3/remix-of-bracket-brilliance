/**
 * Integration-level tests for the sides-performance artifact build. Runs
 * against the real repo data on disk -- 2026 has zero completed games, so
 * these assert shape/determinism/no-duplicates/no-leakage rather than
 * specific graded rows. Grading/join correctness itself is covered by
 * scripts/lib/nfl-sides-performance.test.ts's fixture-based unit tests.
 */
import { describe, expect, it } from "vitest";
import { buildSidesPerformanceArtifact, SIDES_PERFORMANCE_SCHEMA_VERSION } from "./generate-nfl-sides-performance";

const AT = "2026-09-05T12:00:00.000Z";

describe("buildSidesPerformanceArtifact", () => {
  it("produces a well-formed artifact against the live archive", () => {
    const { artifact } = buildSidesPerformanceArtifact(AT);
    expect(artifact.schemaVersion).toBe(SIDES_PERFORMANCE_SCHEMA_VERSION);
    expect(artifact._meta.generatedAt).toBe(AT);
    expect(Array.isArray(artifact.rows)).toBe(true);
    expect(artifact.summary.graded_games).toBe(artifact.rows.length);
    expect(artifact.performanceMeta.gradedGames).toBe(artifact.rows.length);
    expect(artifact.performanceMeta.liveModelVersion).toBe("jkb-power-number-v1.0.0");
  });

  it("exposes contextCoverage.coaching as the count of rows with an OK coaching join", () => {
    const { artifact } = buildSidesPerformanceArtifact(AT);
    const okCount = artifact.rows.filter((r) => r.context.coaching.coaching_context_status === "OK").length;
    expect(artifact.performanceMeta.contextCoverage.coaching).toBe(okCount);
    // every row still carries an explicit coaching context object (never undefined)
    expect(artifact.rows.every((r) => typeof r.context.coaching.coaching_context_status === "string")).toBe(true);
  });

  it("is deterministic: building twice from the same inputs yields identical output", () => {
    const first = buildSidesPerformanceArtifact(AT);
    const second = buildSidesPerformanceArtifact(AT);
    expect(first.artifact).toEqual(second.artifact);
  });

  it("never emits duplicate game_id rows", () => {
    const { artifact } = buildSidesPerformanceArtifact(AT);
    const ids = artifact.rows.map((r) => r.game_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reflects the current 2026 season with zero graded games (no completed games yet)", () => {
    const { artifact } = buildSidesPerformanceArtifact(AT);
    expect(artifact.performanceMeta.seasons).toContain(2026);
    expect(artifact.exclusions.not_resolved).toBeGreaterThan(0);
    expect(artifact.rows.length).toBe(0);
  });

  it("emits a zero-grade summary with null metrics rather than fabricated zeros", () => {
    const { artifact } = buildSidesPerformanceArtifact(AT);
    expect(artifact.summary.margin_mae).toBeNull();
    expect(artifact.summary.ats_directional_hit_rate).toBeNull();
    expect(artifact.summary.winner_accuracy.accuracy).toBeNull();
  });
});
