/**
 * Integration-level tests for the totals-performance artifact build. Runs
 * against the real repo data on disk (same as every other NFL generator
 * test in this suite) -- 2026 week 1 has zero completed games, so these
 * assert shape/determinism/no-duplicates rather than specific graded rows.
 * Grading/join correctness itself is covered by
 * scripts/lib/nfl-totals-performance.test.ts's fixture-based unit tests.
 */
import { describe, expect, it } from "vitest";
import { buildTotalsPerformanceArtifact, TOTALS_PERFORMANCE_SCHEMA_VERSION } from "./generate-nfl-totals-performance";

describe("buildTotalsPerformanceArtifact", () => {
  it("produces a well-formed artifact against the live archive", () => {
    const { artifact } = buildTotalsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    expect(artifact.schemaVersion).toBe(TOTALS_PERFORMANCE_SCHEMA_VERSION);
    expect(artifact._meta.generatedAt).toBe("2026-09-05T12:00:00.000Z");
    expect(Array.isArray(artifact.rows)).toBe(true);
    expect(artifact.summary.graded_games).toBe(artifact.rows.length);
    expect(artifact.performanceMeta.gradedGames).toBe(artifact.rows.length);
  });

  it("is deterministic: building twice from the same inputs yields identical output", () => {
    const first = buildTotalsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    const second = buildTotalsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    expect(first.artifact).toEqual(second.artifact);
  });

  it("never emits duplicate game_id rows", () => {
    const { artifact } = buildTotalsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    const ids = artifact.rows.map((r) => r.game_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reflects the current 2026 season with zero graded games (no completed games yet)", () => {
    const { artifact } = buildTotalsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    expect(artifact.performanceMeta.seasons).toContain(2026);
    expect(artifact.exclusions.not_resolved).toBeGreaterThan(0);
    expect(artifact.rows.length).toBe(0);
  });
});
