import { describe, expect, it } from "vitest";
import { makeRow } from "../model/__fixtures__/rows";
import { buildWeeklyFantasyProjectionDeploymentBundle } from "../model/deploymentFit";
import { buildWeeklyFantasyProjectionShadowArtifact } from "./artifactBuilder";

/**
 * Spec section 16: a hard test proving EVERY generated QB row is
 * BASELINE_ONLY with all learned adjustments exactly zero. Fails generation
 * (throws, via `computeShadowProjection`'s internal guard) if this invariant
 * would ever break for a mis-routed QB row.
 */
const GENERATED_AT = "2026-08-22T00:00:00.000Z";
const PROVENANCE = [{ source: "test", sourceVersion: "test", sourceHash: "0".repeat(64), inputAsOf: GENERATED_AT }];

function fittingRows(position: "RB" | "WR" | "TE", count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeRow({ season: 2023, week: 1, playerId: `gsis:${position}-fit-${index}`, position, actualFantasyPoints: 5 + (index % 6), priorSeasonPpg: 4 + (index % 5) }));
}

describe("QB BASELINE_ONLY governance invariant", () => {
  it("holds for every QB row in a generated shadow artifact, regardless of ROS baseline availability", () => {
    const bundle = buildWeeklyFantasyProjectionDeploymentBundle(
      [...fittingRows("RB", 6), ...fittingRows("WR", 6), ...fittingRows("TE", 6)],
      { generatedAt: GENERATED_AT, inputFingerprint: "0".repeat(64) },
    );
    const qbRows = [
      { row: makeRow({ season: 2026, week: 1, playerId: "gsis:qb-a", position: "QB", gamesPlayedPrior: 0, seasonPpgPrior: null }), rosProjectedPpg: 24.1 },
      { row: makeRow({ season: 2026, week: 1, playerId: "gsis:qb-b", position: "QB", gamesPlayedPrior: 0, seasonPpgPrior: null, priorSeasonPpg: null, rookieOrNoPriorHistory: true }), rosProjectedPpg: null },
      { row: makeRow({ season: 2026, week: 1, playerId: "gsis:qb-c", position: "QB", gamesPlayedPrior: 0, seasonPpgPrior: null }), rosProjectedPpg: 12.4 },
    ];
    const artifact = buildWeeklyFantasyProjectionShadowArtifact({
      season: 2026, week: 1, generatedAt: GENERATED_AT, inputAsOf: GENERATED_AT,
      rows: qbRows, deploymentBundle: bundle, provenance: PROVENANCE,
    });

    expect(artifact.rows.QB.length).toBe(3);
    for (const row of artifact.rows.QB) {
      expect(row.modelAuthority.state).toBe("BASELINE_ONLY");
      expect(row.projectedFantasyPoints).toBe(row.baselineFantasyPoints);
      expect(row.components.usageAdjustment).toBe(0);
      expect(row.components.teamContextAdjustment).toBe(0);
      expect(row.components.opponentAdjustment).toBe(0);
      expect(row.components.otherAdjustment).toBe(0);
      expect(row.residualActivated).toBe(false);
      expect(row.residualActivationReason).toBe("model-state-baseline-only");
    }
  });
});
