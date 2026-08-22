import { describe, expect, it } from "vitest";
import { assertAllPositionsFrozen, assertSpecUnchanged, freezeSpec } from "./freeze";
import type { FrozenPositionSpec } from "./types";

function baseSpec(overrides: Partial<Omit<FrozenPositionSpec, "specHash">> = {}) {
  return freezeSpec({
    position: "WR",
    frozenAt: "2024-01-01T00:00:00.000Z",
    baselineAuthority: "shrinkage-blend",
    selectedFamily: "residual-ridge",
    selectedFeatureBlocks: ["baseline", "usage"],
    selectedFeatures: ["seasonPpgPrior", "targetsSeasonPrior"],
    hyperparameter: 10,
    l1Ratio: null,
    shrinkageK: 4,
    candidatePopulationPolicy: "full-universe",
    rookieFallback: { positionMeanPpgFromTraining: 5, appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available" },
    promotionDecision: { promoted: true, reasons: ["All promotion criteria satisfied."] },
    ...overrides,
  });
}

describe("frozen spec immutability", () => {
  it("passes assertSpecUnchanged for an untouched frozen spec", () => {
    const spec = baseSpec();
    expect(() => assertSpecUnchanged(spec)).not.toThrow();
  });

  it("detects a post-freeze mutation via hash mismatch", () => {
    const spec = baseSpec();
    const mutated: FrozenPositionSpec = { ...spec, hyperparameter: 999 };
    expect(() => assertSpecUnchanged(mutated)).toThrow(/mutated after freezing/);
  });

  it("assertAllPositionsFrozen requires every position to have a frozen spec", () => {
    const wr = baseSpec();
    expect(() => assertAllPositionsFrozen([wr], ["QB", "RB", "WR", "TE"])).toThrow(/missing frozen specs/i);
  });

  it("assertAllPositionsFrozen rejects a mutated spec even if all positions are present", () => {
    const wr = baseSpec({ position: "WR" });
    const qb = { ...baseSpec({ position: "QB" }), selectedFamily: "direct-ridge" } as FrozenPositionSpec;
    expect(() => assertAllPositionsFrozen([wr, qb], ["QB", "WR"])).toThrow(/mutated after freezing/);
  });

  it("assertAllPositionsFrozen passes when every required position is present and unmutated", () => {
    const wr = baseSpec({ position: "WR" });
    const qb = baseSpec({ position: "QB" });
    expect(() => assertAllPositionsFrozen([wr, qb], ["QB", "WR"])).not.toThrow();
  });
});
