/**
 * generate-mlb-hr-props.k9-missing-data.test.mjs
 * Run via: node --test scripts/generate-mlb-hr-props.k9-missing-data.test.mjs
 *
 * Regression coverage for calculateProjectedK9/calculateProjectedKs
 * treating missing pitcher metrics as missing rather than fabricating a
 * projection. See the Patrick Sandoval case from the K-props audit: a
 * pitcher with no season IP and a literal 0 for kRate/whiffRate (an
 * upstream data gap, not a real 0.0% strikeout rate) was producing a
 * fabricated projectedK9 of 3.0 and a non-zero projectedKs instead of an
 * explicit "no projection" state.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateProjectedK9, calculateProjectedKs } from "./generate-mlb-hr-props.mjs";

describe("calculateProjectedK9", () => {
  it("uses real season strikeouts/IP when available", () => {
    const result = calculateProjectedK9({ seasonStrikeOuts: 90, seasonIP: 90 });
    assert.equal(result, 9.0);
  });

  it("falls back to kRate/whiffRate estimate when real season data is missing", () => {
    const result = calculateProjectedK9({ kRate: 28, whiffRate: 30 });
    assert.ok(Number.isFinite(result));
    assert.ok(result > 3);
  });

  it("Sandoval regression: literal 0 kRate/whiffRate with no season IP returns null, not a fabricated floor", () => {
    const sandoval = { seasonStrikeOuts: null, seasonIP: null, kRate: 0, whiffRate: 0 };
    assert.equal(calculateProjectedK9(sandoval), null);
  });

  it("treats a literal 0 kRate as missing even when whiffRate has a real value", () => {
    const result = calculateProjectedK9({ kRate: 0, whiffRate: 32 });
    assert.notEqual(result, null);
    // Should use the league-average kRate default (20), not 0, when blending with the real whiffRate.
    const zeroKRate = calculateProjectedK9({ kRate: 0, whiffRate: 32 });
    const missingKRate = calculateProjectedK9({ whiffRate: 32 });
    assert.equal(zeroKRate, missingKRate);
  });

  it("returns null when every input is entirely missing", () => {
    assert.equal(calculateProjectedK9({}), null);
  });
});

describe("calculateProjectedKs", () => {
  it("computes Ks from IP and K9 when both are real numbers", () => {
    assert.equal(calculateProjectedKs(6, 9), 6);
  });

  it("returns null (not a fabricated 0) when projectedK9 is null", () => {
    // `null * x` coerces to 0 in JS -- this guards against that silently
    // producing a fake projectedKs of 0 for the Sandoval-style missing-data case.
    assert.equal(calculateProjectedKs(5.5, null), null);
  });

  it("returns null when projectedIP is null", () => {
    assert.equal(calculateProjectedKs(null, 9), null);
  });

  it("returns null when both are null", () => {
    assert.equal(calculateProjectedKs(null, null), null);
  });
});
