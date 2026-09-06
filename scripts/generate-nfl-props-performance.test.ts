/**
 * Integration-level tests for the props-performance artifact build. Runs
 * against the real repo data on disk (same pattern as
 * generate-nfl-totals-performance.test.ts) -- 2026 week 1 has zero completed
 * games, so these assert shape/determinism/no-duplicates rather than
 * specific graded rows. Summary-metric and reshape correctness itself is
 * covered by scripts/lib/nfl-props-performance.test.ts's fixture-based unit
 * tests.
 */
import { describe, expect, it } from "vitest";
import { buildPropsPerformanceArtifact, PROPS_PERFORMANCE_SCHEMA_VERSION } from "./generate-nfl-props-performance";

describe("buildPropsPerformanceArtifact", () => {
  it("produces a well-formed artifact against the live archive", () => {
    const { artifact } = buildPropsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    expect(artifact.schemaVersion).toBe(PROPS_PERFORMANCE_SCHEMA_VERSION);
    expect(artifact._meta.generatedAt).toBe("2026-09-05T12:00:00.000Z");
    expect(Array.isArray(artifact.rows)).toBe(true);
    expect(artifact.summary.graded_starter_props).toBe(artifact.rows.length);
    expect(artifact.performanceMeta.gradedStarterProps).toBe(artifact.rows.length);
  });

  it("is deterministic: building twice from the same inputs yields identical output", () => {
    const first = buildPropsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    const second = buildPropsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    expect(first.artifact).toEqual(second.artifact);
  });

  it("never emits duplicate evaluation_row_id rows", () => {
    const { artifact } = buildPropsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    const ids = artifact.rows.map((r) => r.evaluation_row_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reflects the current 2026 season with zero graded starter props (no completed games yet) but real coverage diagnostics", () => {
    const { artifact } = buildPropsPerformanceArtifact("2026-09-05T12:00:00.000Z");
    expect(artifact.performanceMeta.seasons).toContain(2026);
    expect(artifact.rows.length).toBe(0);
    expect(artifact.coverage.total_cohort_rows).toBeGreaterThan(0);
    expect(artifact.coverage.excluded_rows).toBeGreaterThan(0);
    expect(
      artifact.coverage.exclusions_by_reason.NO_VALID_COMPARISON_LINE + artifact.coverage.exclusions_by_reason.ACTUAL_UNRESOLVED,
    ).toBeGreaterThan(0);
  });
});
