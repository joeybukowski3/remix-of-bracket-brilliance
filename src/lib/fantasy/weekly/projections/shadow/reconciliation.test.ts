import { describe, expect, it } from "vitest";
import { makeRow } from "../model/__fixtures__/rows";
import { buildWeeklyFantasyProjectionDeploymentBundle } from "../model/deploymentFit";
import { getFrozenModelAuthority, WEEKLY_FANTASY_PROJECTION_MODEL_VERSION } from "../model/frozenSpec";
import { buildWeeklyFantasyProjectionShadowArtifact } from "./artifactBuilder";

/**
 * Spec section 17: for RB/WR/TE, verify the exact frozen spec is loaded, the
 * deployment bundle version matches the model version, feature order matches
 * coefficients/scaler, component sums reconcile to the final projection
 * exactly, and no row is NaN/Infinity.
 */
const GENERATED_AT = "2026-08-22T00:00:00.000Z";
const PROVENANCE = [{ source: "test", sourceVersion: "test", sourceHash: "0".repeat(64), inputAsOf: GENERATED_AT }];

function fittingRows(position: "RB" | "WR" | "TE", count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeRow({
      season: 2023, week: 1, playerId: `gsis:${position}-fit-${index}`, position,
      actualFantasyPoints: 4 + (index % 8), priorSeasonPpg: 3 + (index % 6),
      targetsSeasonPrior: 2 + (index % 5), targetsLast3: 2 + (index % 4), carriesSeasonPrior: 1 + (index % 3),
    }));
}

describe("RB/WR/TE deployment bundle reconciliation", () => {
  const bundle = buildWeeklyFantasyProjectionDeploymentBundle(
    [...fittingRows("RB", 10), ...fittingRows("WR", 10), ...fittingRows("TE", 10)],
    { generatedAt: GENERATED_AT, inputFingerprint: "0".repeat(64) },
  );

  it("loads the exact frozen spec per position and the bundle version matches the model version", () => {
    for (const position of ["RB", "WR", "TE"] as const) {
      const spec = getFrozenModelAuthority(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, position);
      expect(bundle.positions[position].featureNamesInOrder).toEqual(spec.features);
      expect(bundle.positions[position].alpha).toBe(spec.hyperparameter);
      expect(bundle.positions[position].modelVersion).toBe(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION);
      expect(bundle.positions[position].scaler.featureNamesInOrder).toEqual(bundle.positions[position].featureNamesInOrder);
      expect(bundle.positions[position].coefficients.length).toBe(bundle.positions[position].columnsInOrder.length);
    }
  });

  it("reconciles component sums to the final projection with no NaN/Infinity, across many Week 1 rows", () => {
    const week1Rows = (["RB", "WR", "TE"] as const).flatMap((position) =>
      Array.from({ length: 12 }, (_, index) => ({
        row: makeRow({
          season: 2026, week: 1, playerId: `gsis:${position}-wk1-${index}`, position,
          gamesPlayedPrior: 0, seasonPpgPrior: null, last3PpgPrior: null, last5PpgPrior: null,
          priorSeasonPpg: index % 4 === 0 ? null : 2 + (index % 10),
          rookieOrNoPriorHistory: index % 4 === 0,
          targetsSeasonPrior: null, targetsLast3: null, carriesSeasonPrior: null, // rookie-shaped rows too
        }),
        rosProjectedPpg: index % 3 === 0 ? null : 3 + (index % 15),
      })));

    const artifact = buildWeeklyFantasyProjectionShadowArtifact({
      season: 2026, week: 1, generatedAt: GENERATED_AT, inputAsOf: GENERATED_AT,
      rows: week1Rows, deploymentBundle: bundle, provenance: PROVENANCE,
    });

    for (const position of ["RB", "WR", "TE"] as const) {
      expect(artifact.rows[position].length).toBe(12);
      for (const row of artifact.rows[position]) {
        const sum = row.components.baseline + row.components.usageAdjustment + row.components.teamContextAdjustment + row.components.opponentAdjustment + row.components.otherAdjustment;
        expect(sum).toBeCloseTo(row.projectedFantasyPoints, 9);
        expect(Number.isFinite(row.projectedFantasyPoints)).toBe(true);
        expect(Number.isNaN(row.projectedFantasyPoints)).toBe(false);
      }
    }
  });
});
