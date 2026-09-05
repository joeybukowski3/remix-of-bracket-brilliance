/**
 * Integration-level tests for the overview artifact build. Runs against the
 * real repo artifacts on disk (totals.json, props.json, the WU3 spread
 * evaluation summary) -- section-shaping correctness itself is covered by
 * scripts/lib/nfl-performance-overview.test.ts's fixture-based unit tests.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  it("produces a well-formed artifact against the live totals/props/spread artifacts", () => {
    const { artifact } = buildPerformanceOverviewArtifact("2026-09-05T12:00:00.000Z");
    expect(artifact.schemaVersion).toBe(OVERVIEW_SCHEMA_VERSION);
    expect(artifact._meta.generatedAt).toBe("2026-09-05T12:00:00.000Z");
    expect(artifact.performanceMeta.season).toBe(2026);
    expect(artifact.totals.status).toBe("AVAILABLE");
    expect(artifact.props.status).toBe("AVAILABLE");
    expect(["AVAILABLE", "AVAILABLE_BUT_NOT_MATERIALIZED"]).toContain(artifact.sides.status);
  });

  it("is deterministic: building twice from the same inputs yields identical output", () => {
    const first = buildPerformanceOverviewArtifact("2026-09-05T12:00:00.000Z");
    const second = buildPerformanceOverviewArtifact("2026-09-05T12:00:00.000Z");
    expect(first.artifact).toEqual(second.artifact);
  });

  it("reports every family as NOT_AVAILABLE / AVAILABLE_BUT_NOT_MATERIALIZED when no derived artifacts exist yet, without fabricating metrics", () => {
    const emptyRoot = tempRoot("jkb-overview-empty-");
    const missingTotals = join(emptyRoot, "totals.json");
    const missingProps = join(emptyRoot, "props.json");
    const missingEvaluationRoot = join(emptyRoot, "evaluations");

    const { artifact } = buildPerformanceOverviewArtifact("2026-09-05T12:00:00.000Z", missingTotals, missingProps, missingEvaluationRoot);
    expect(artifact.totals.status).toBe("NOT_AVAILABLE");
    expect(artifact.props.status).toBe("NOT_AVAILABLE");
    expect(artifact.sides.status).toBe("AVAILABLE_BUT_NOT_MATERIALIZED");
    expect(artifact.totals.mae).toBeNull();
    expect(artifact.props.mae).toBeNull();
    expect(artifact.sides.spread_mae).toBeNull();
  });

  it("truthfully reports zero-graded-games sides status without treating it as unavailable", () => {
    const root = tempRoot("jkb-overview-zero-spread-");
    const totalsFile = join(root, "totals.json");
    const propsFile = join(root, "props.json");
    const evaluationRoot = join(root, "evaluations");
    writeFileSync(
      totalsFile,
      JSON.stringify({ performanceMeta: { seasons: [2026], latestOutcomeTimestamp: null }, summary: { graded_games: 0, game_total_mae: null, mean_signed_error: null, directional_hit_rate: null } }),
    );
    writeFileSync(
      propsFile,
      JSON.stringify({ performanceMeta: { seasons: [2026] }, summary: { graded_starter_props: 0, directional_hit_rate: null, projection_mae: null, passing_n: 0, rushing_n: 0, receiving_n: 0 } }),
    );
    mkdirSync(evaluationRoot, { recursive: true });
    writeFileSync(
      join(evaluationRoot, "2026.json"),
      JSON.stringify({
        metrics: {
          by_prediction_type: {
            spread: { n: 0, mae: null, market_comparison: { comparable_n: 0, jkb_mae: null, market_mae: null, jkb_minus_market_mae: null }, winner_accuracy: { accuracy: null, total: 0 } },
          },
        },
      }),
    );

    const { artifact } = buildPerformanceOverviewArtifact("2026-09-05T12:00:00.000Z", totalsFile, propsFile, evaluationRoot);
    expect(artifact.totals.status).toBe("AVAILABLE");
    expect(artifact.totals.graded_games).toBe(0);
    expect(artifact.sides.status).toBe("AVAILABLE");
    expect(artifact.sides.graded_games).toBe(0);
  });
});
