/**
 * Integration-level tests for the health artifact build. Runs against the
 * real repo data on disk (totals.json/props.json, the raw prediction
 * archives, the resolution-status ledger, games.json) -- status-rule
 * correctness itself is covered by
 * scripts/lib/nfl-performance-health.test.ts's fixture-based unit tests.
 */
import { describe, expect, it } from "vitest";
import { buildPerformanceHealthArtifact, HEALTH_SCHEMA_VERSION } from "./generate-nfl-performance-health";

describe("buildPerformanceHealthArtifact", () => {
  it("produces a well-formed artifact against the live repo artifacts", () => {
    const { artifact } = buildPerformanceHealthArtifact("2026-09-05T12:00:00.000Z");
    expect(artifact.schemaVersion).toBe(HEALTH_SCHEMA_VERSION);
    expect(artifact._meta.generatedAt).toBe("2026-09-05T12:00:00.000Z");
    expect(artifact.performanceMeta.season).toBe(2026);
    expect(["HEALTHY", "DEGRADED", "STALE", "NOT_AVAILABLE"]).toContain(artifact.totals.status);
    expect(["HEALTHY", "DEGRADED", "STALE", "NOT_AVAILABLE"]).toContain(artifact.props.status);
    expect(["HEALTHY", "DEGRADED", "STALE", "NOT_AVAILABLE"]).toContain(artifact.sides.status);
    expect(["HEALTHY", "STALE", "NOT_AVAILABLE"]).toContain(artifact.sides.public_performance_view_status);
  });

  it("is deterministic: building twice from the same inputs yields identical output", () => {
    const first = buildPerformanceHealthArtifact("2026-09-05T12:00:00.000Z");
    const second = buildPerformanceHealthArtifact("2026-09-05T12:00:00.000Z");
    expect(first.artifact).toEqual(second.artifact);
  });

  it("does not report expected pregame incompleteness (no completed games yet) as a totals backlog", () => {
    const { artifact } = buildPerformanceHealthArtifact("2026-09-05T12:00:00.000Z");
    expect(artifact.totals.unresolved_completed_games).toBe(0);
    expect(artifact.totals.expected_games).toBe(0);
  });

  it("reports the real starter-cohort coverage and missing-slot counts (repo has 4 known unfillable slots for 2026 week 1)", () => {
    const { artifact } = buildPerformanceHealthArtifact("2026-09-05T12:00:00.000Z");
    expect(artifact.props.starter_cohort_row_count).toBeGreaterThan(0);
    expect(artifact.props.expected_starter_slot_count).toBe(artifact.props.starter_cohort_row_count + artifact.props.missing_starter_slots);
  });

  it("computes a positive public_artifact_age_ms when generatedAt is after the artifact's own generatedAt", () => {
    const { artifact } = buildPerformanceHealthArtifact("2099-01-01T00:00:00.000Z");
    expect(artifact.totals.public_artifact_age_ms).toBeGreaterThan(0);
    expect(artifact.totals.status).toBe("STALE");
  });
});
