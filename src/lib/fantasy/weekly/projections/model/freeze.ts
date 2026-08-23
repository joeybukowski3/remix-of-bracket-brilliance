import { createHash } from "node:crypto";
import type { FrozenPositionSpec } from "./types";

/**
 * Frozen-spec immutability (spec section 14 + section 18 test requirement).
 * A `FrozenPositionSpec` is hashed at creation time; `assertSpecUnchanged`
 * lets any later code (e.g. the 2025 holdout runner) verify the spec it is
 * about to evaluate is byte-for-byte the one that was frozen, never a
 * post-hoc edit made after peeking at holdout results.
 */

function canonicalSpecPayload(spec: Omit<FrozenPositionSpec, "specHash">): string {
  const { position, frozenAt, baselineAuthority, selectedFamily, selectedFeatureBlocks, selectedFeatures, hyperparameter, l1Ratio, shrinkageK, candidatePopulationPolicy, rookieFallback, promotionDecision } = spec;
  return JSON.stringify({
    position, frozenAt, baselineAuthority, selectedFamily,
    selectedFeatureBlocks: [...selectedFeatureBlocks],
    selectedFeatures: [...selectedFeatures],
    hyperparameter, l1Ratio, shrinkageK, candidatePopulationPolicy, rookieFallback, promotionDecision,
  });
}

export function freezeSpec(spec: Omit<FrozenPositionSpec, "specHash">): FrozenPositionSpec {
  const specHash = createHash("sha256").update(canonicalSpecPayload(spec)).digest("hex");
  return { ...spec, specHash };
}

export function assertSpecUnchanged(spec: FrozenPositionSpec): void {
  const { specHash, ...rest } = spec;
  const recomputed = createHash("sha256").update(canonicalSpecPayload(rest)).digest("hex");
  if (recomputed !== specHash) {
    throw new Error(`Frozen spec for ${spec.position} was mutated after freezing (hash mismatch). Refusing to use it for holdout evaluation.`);
  }
}

export function assertAllPositionsFrozen(specs: readonly FrozenPositionSpec[], requiredPositions: readonly string[]): void {
  const frozenPositions = new Set(specs.map((spec) => spec.position));
  const missing = requiredPositions.filter((position) => !frozenPositions.has(position as FrozenPositionSpec["position"]));
  if (missing.length) {
    throw new Error(`Cannot unlock the 2025 holdout: missing frozen specs for ${missing.join(", ")}.`);
  }
  for (const spec of specs) assertSpecUnchanged(spec);
}
