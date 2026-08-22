import { describe, expect, it } from "vitest";
import { makeRow } from "./__fixtures__/rows";
import {
  buildWeeklyFantasyProjectionDeploymentBundle,
  DEPLOYMENT_FIT_TRAINING_SEASONS,
  fitPositionDeploymentBundle,
  WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION,
} from "./deploymentFit";
import { getCurrentFrozenModelAuthority } from "./frozenSpec";

function wrRow(season: number, playerId: string, overrides: Partial<Parameters<typeof makeRow>[0]> = {}) {
  return makeRow({ season, week: 1, playerId, position: "WR", ...overrides });
}

describe("fitPositionDeploymentBundle", () => {
  it("fits on exactly the rows it is given, with no grid search over the frozen hyperparameter", () => {
    const rows = Array.from({ length: 20 }, (_, index) => wrRow(2023, `gsis:${index}`, { actualFantasyPoints: 5 + (index % 7) }));
    const bundle = fitPositionDeploymentBundle("WR", rows, { generatedAt: "2026-08-22T00:00:00.000Z", inputFingerprint: "0".repeat(64) });
    const spec = getCurrentFrozenModelAuthority("WR");
    expect(bundle.alpha).toBe(spec.hyperparameter);
    expect(bundle.family).toBe("residual-ridge");
    expect(bundle.deploymentFitVersion).toBe(WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION);
    expect(bundle.featureNamesInOrder).toEqual(spec.features);
    expect(bundle.shrinkageK).toBe(spec.shrinkageK);
    expect(bundle.rookieFallbackPpg).toBe(spec.rookieFallback.positionMeanPpgFromTraining);
  });

  it("produces an explicit, deterministic feature/column order rather than relying on object-key iteration", () => {
    const rows = [wrRow(2023, "gsis:1"), wrRow(2023, "gsis:2", { targetsSeasonPrior: null })];
    const bundle = fitPositionDeploymentBundle("WR", rows, { generatedAt: "2026-08-22T00:00:00.000Z", inputFingerprint: "0".repeat(64) });
    expect(bundle.scaler.featureNamesInOrder).toEqual(bundle.featureNamesInOrder);
    expect(bundle.coefficients.length).toBe(bundle.columnsInOrder.length);
    // targetsSeasonPrior had missingness in training -> must produce a trailing missing-indicator column.
    const indicatorFeatures = bundle.columnsInOrder.filter((c) => c.kind === "missingIndicator").map((c) => c.feature);
    expect(indicatorFeatures).toContain("targetsSeasonPrior");
  });

  it("rejects being called for a position other than the rows it is fitting", () => {
    const rows = [makeRow({ season: 2023, week: 1, playerId: "gsis:1", position: "RB" })];
    expect(() => fitPositionDeploymentBundle("WR", rows, { generatedAt: "2026-08-22T00:00:00.000Z", inputFingerprint: "0".repeat(64) })).toThrow();
  });

  it("has no fitted bundle possible for QB (BASELINE_ONLY, no hyperparameter)", () => {
    // @ts-expect-error QB is intentionally excluded from DeploymentFitPosition.
    expect(() => fitPositionDeploymentBundle("QB", [], { generatedAt: "2026-08-22T00:00:00.000Z", inputFingerprint: "0".repeat(64) })).toThrow();
  });
});

describe("buildWeeklyFantasyProjectionDeploymentBundle", () => {
  it("restricts each position's fit to DEPLOYMENT_FIT_TRAINING_SEASONS and builds RB/WR/TE only", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => makeRow({ season: 2023, week: 1, playerId: `rb:${i}`, position: "RB" })),
      ...Array.from({ length: 5 }, (_, i) => makeRow({ season: 2024, week: 1, playerId: `rb2:${i}`, position: "RB" })),
      ...Array.from({ length: 5 }, (_, i) => makeRow({ season: 2020, week: 1, playerId: `rb-old:${i}`, position: "RB" })), // must be excluded
      ...Array.from({ length: 5 }, (_, i) => wrRow(2025, `wr:${i}`)),
      ...Array.from({ length: 5 }, (_, i) => makeRow({ season: 2023, week: 1, playerId: `te:${i}`, position: "TE" })),
    ];
    const bundle = buildWeeklyFantasyProjectionDeploymentBundle(rows, { generatedAt: "2026-08-22T00:00:00.000Z", inputFingerprint: "0".repeat(64) });
    expect(bundle.trainingSeasons).toEqual(DEPLOYMENT_FIT_TRAINING_SEASONS);
    expect(bundle.positions.RB.trainingRowCount).toBe(10);
    expect(bundle.positions.WR.trainingRowCount).toBe(5);
    expect(bundle.positions.TE.trainingRowCount).toBe(5);
    expect(Object.keys(bundle.positions).sort()).toEqual(["RB", "TE", "WR"]);
  });
});
