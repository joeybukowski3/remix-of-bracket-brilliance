import { describe, expect, it } from "vitest";
import {
  WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
  getCurrentFrozenModelAuthority,
  getFrozenModelAuthority,
  listFrozenPositions,
} from "./frozenSpec";

describe("frozen model authority: governance gap closure", () => {
  it("pins QB to BASELINE_ONLY / deterministic-shrinkage-baseline only", () => {
    const spec = getCurrentFrozenModelAuthority("QB");
    expect(spec.state).toBe("BASELINE_ONLY");
    expect(spec.family).toBe("deterministic-shrinkage-baseline");
    expect(spec.hyperparameter).toBeNull();
    expect(spec.featureBlocks).toEqual(["baseline"]);
  });

  it("resolves RB to residual-ridge alpha 10 with baseline+usage+teamContext", () => {
    const spec = getCurrentFrozenModelAuthority("RB");
    expect(spec.state).toBe("READY_FOR_2026_SHADOW");
    expect(spec.family).toBe("residual-ridge");
    expect(spec.hyperparameter).toBe(10);
    expect(spec.featureBlocks).toEqual(["baseline", "usage", "teamContext"]);
  });

  it("resolves WR to residual-ridge alpha 30 with baseline+usage", () => {
    const spec = getCurrentFrozenModelAuthority("WR");
    expect(spec.state).toBe("READY_FOR_2026_SHADOW");
    expect(spec.family).toBe("residual-ridge");
    expect(spec.hyperparameter).toBe(30);
    expect(spec.featureBlocks).toEqual(["baseline", "usage"]);
  });

  it("resolves TE to residual-ridge alpha 10 with baseline+usage", () => {
    const spec = getCurrentFrozenModelAuthority("TE");
    expect(spec.state).toBe("READY_FOR_2026_SHADOW");
    expect(spec.family).toBe("residual-ridge");
    expect(spec.hyperparameter).toBe(10);
    expect(spec.featureBlocks).toEqual(["baseline", "usage"]);
  });

  it("is deterministic and immutable: repeated lookups return identical, structurally-frozen decisions", () => {
    const first = getCurrentFrozenModelAuthority("RB");
    const second = getCurrentFrozenModelAuthority("RB");
    expect(second).toEqual(first);
    expect(second.family).toBe(first.family);
    expect(second.hyperparameter).toBe(first.hyperparameter);
    expect(second.featureBlocks).toEqual(first.featureBlocks);

    // The returned spec is runtime-frozen (Object.freeze): an attempted mutation
    // throws in strict mode rather than silently "unfreezing" the shared spec.
    const mutated = getCurrentFrozenModelAuthority("QB");
    expect(() => {
      // @ts-expect-error -- deliberately attempting an illegal mutation to prove it is rejected
      mutated.family = "residual-ridge";
    }).toThrow(TypeError);
    const refetched = getCurrentFrozenModelAuthority("QB");
    expect(refetched.family).toBe("deterministic-shrinkage-baseline");
  });

  it("fails closed on an unknown model version rather than falling back to a default", () => {
    expect(() => getFrozenModelAuthority("weekly-fantasy-projection-v2-does-not-exist", "QB")).toThrow(/unknown weekly fantasy projection model version/i);
  });

  it("fails closed on an unknown position rather than silently defaulting to a learned family", () => {
    expect(() => getFrozenModelAuthority(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, "K" as never)).toThrow(/no frozen model authority spec/i);
  });

  it("lists exactly the four modeled positions for the current version", () => {
    expect(new Set(listFrozenPositions())).toEqual(new Set(["QB", "RB", "WR", "TE"]));
  });

  it("every spec carries split authority, scoring version, dataset schema version, and a fallback policy -- no live research call required to obtain any of it", () => {
    for (const position of listFrozenPositions()) {
      const spec = getCurrentFrozenModelAuthority(position);
      expect(spec.splitAuthorityVersion).toBe("2023-train-2024-validate-2025-holdout-v1");
      expect(spec.scoringVersion).toBe("jkb-full-ppr-v1.0.0");
      expect(spec.datasetSchemaVersion).toBe("weekly-fantasy-projection-training-row-v2");
      expect(spec.preprocessingAuthority).toBe("train-only-standardization-v1");
      expect(spec.rookieFallback.positionMeanPpgFromTraining).toBeGreaterThan(0);
      expect(spec.baselineAuthority).toBe("shrinkage-blend");
      expect(spec.shrinkageK).toBe(2);
    }
  });
});
