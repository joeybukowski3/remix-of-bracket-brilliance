/**
 * Integration-level tests for the overview artifact build. Runs against the
 * real repo artifacts on disk (totals.json, props.json, sides.json) --
 * section-shaping correctness itself is covered by
 * scripts/lib/nfl-performance-overview.test.ts's fixture-based unit tests.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPerformanceOverviewArtifact, OVERVIEW_SCHEMA_VERSION } from "./generate-nfl-performance-overview";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

describe("buildPerformanceOverviewArtifact", () => {
  it("produces a well-formed artifact against the live totals/props/sides artifacts", () => {
    const { artifact } = buildPerformanceOverviewArtifact("2026-09-05T12:00:00.000Z");
    expect(artifact.schemaVersion).toBe(OVERVIEW_SCHEMA_VERSION);
    expect(artifact._meta.generatedAt).toBe("2026-09-05T12:00:00.000Z");
    expect(artifact.performanceMeta.season).toBe(2026);
    expect(artifact.totals.status).toBe("AVAILABLE");
    expect(artifact.props.status).toBe("AVAILABLE");
    expect(artifact.sides.status).toBe("AVAILABLE");
  });

  it("is deterministic: building twice from the same inputs yields identical output", () => {
    const first = buildPerformanceOverviewArtifact("2026-09-05T12:00:00.000Z");
    const second = buildPerformanceOverviewArtifact("2026-09-05T12:00:00.000Z");
    expect(first.artifact).toEqual(second.artifact);
  });

  it("reports every family as NOT_AVAILABLE when no derived artifacts exist yet, without fabricating metrics", () => {
    const emptyRoot = tempRoot("jkb-overview-empty-");
    const { artifact } = buildPerformanceOverviewArtifact(
      "2026-09-05T12:00:00.000Z",
      join(emptyRoot, "totals.json"),
      join(emptyRoot, "props.json"),
      join(emptyRoot, "sides.json"),
    );
    expect(artifact.totals.status).toBe("NOT_AVAILABLE");
    expect(artifact.props.status).toBe("NOT_AVAILABLE");
    expect(artifact.sides.status).toBe("NOT_AVAILABLE");
    expect(artifact.totals.mae).toBeNull();
    expect(artifact.props.mae).toBeNull();
    expect(artifact.sides.spread_mae).toBeNull();
  });

  it("truthfully reports zero-graded-games sides status without treating it as unavailable", () => {
    const root = tempRoot("jkb-overview-zero-spread-");
    const totalsFile = join(root, "totals.json");
    const propsFile = join(root, "props.json");
    const sidesFile = join(root, "sides.json");
    writeFileSync(
      totalsFile,
      JSON.stringify({ performanceMeta: { seasons: [2026], latestOutcomeTimestamp: null }, summary: { graded_games: 0, game_total_mae: null, mean_signed_error: null, directional_hit_rate: null } }),
    );
    writeFileSync(
      propsFile,
      JSON.stringify({ performanceMeta: { seasons: [2026] }, summary: { graded_starter_props: 0, directional_hit_rate: null, projection_mae: null, passing_n: 0, rushing_n: 0, receiving_n: 0 } }),
    );
    writeFileSync(
      sidesFile,
      JSON.stringify({
        performanceMeta: { seasons: [2026], latestOutcomeTimestamp: null },
        summary: {
          graded_games: 0,
          margin_mae: null,
          mean_signed_error: null,
          ats_directional_hit_rate: null,
          correlation_projected_actual_margin: null,
          average_abs_jkb_market_difference: null,
          winner_accuracy: { accuracy: null, total: 0 },
          market_comparison: { comparable_n: 0, jkb_mae: null, market_mae: null, jkb_minus_market_mae: null },
        },
      }),
    );

    const { artifact } = buildPerformanceOverviewArtifact("2026-09-05T12:00:00.000Z", totalsFile, propsFile, sidesFile);
    expect(artifact.totals.status).toBe("AVAILABLE");
    expect(artifact.totals.graded_games).toBe(0);
    expect(artifact.sides.status).toBe("AVAILABLE");
    expect(artifact.sides.graded_games).toBe(0);
  });
});
