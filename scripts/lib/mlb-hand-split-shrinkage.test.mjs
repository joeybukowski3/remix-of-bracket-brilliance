/**
 * mlb-hand-split-shrinkage.test.mjs
 * Run via: node --test scripts/lib/mlb-hand-split-shrinkage.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_WEIGHT_K,
  classifySampleSizeTier,
  computeSampleWeight,
  isFallbackTrustworthy,
  shrinkSplitMetrics,
} from "./mlb-hand-split-shrinkage.mjs";

// Fixture fallback modeled on Aaron Judge's confirmed live vs-Right split
// (2026-07-02 smoke test): PA=185, avg=.248, obp=.355, slg=.535, ops=.890.
function overallFallback(overrides = {}) {
  return {
    plateAppearances: 300,
    battingAverage: 0.27,
    onBasePercentage: 0.36,
    sluggingPercentage: 0.48,
    ops: 0.84,
    hrRate: 0.03,
    ...overrides,
  };
}

describe("classifySampleSizeTier", () => {
  it("classifies insufficient below 20 PA", () => {
    assert.equal(classifySampleSizeTier(0), "insufficient");
    assert.equal(classifySampleSizeTier(19), "insufficient");
    assert.equal(classifySampleSizeTier(null), "insufficient");
    assert.equal(classifySampleSizeTier(undefined), "insufficient");
  });

  it("classifies low from 20-79 PA", () => {
    assert.equal(classifySampleSizeTier(20), "low");
    assert.equal(classifySampleSizeTier(79), "low");
  });

  it("classifies medium from 80-199 PA", () => {
    assert.equal(classifySampleSizeTier(80), "medium");
    assert.equal(classifySampleSizeTier(199), "medium");
  });

  it("classifies high at 200+ PA", () => {
    assert.equal(classifySampleSizeTier(200), "high");
    assert.equal(classifySampleSizeTier(260), "high"); // Ohtani's live vs-Right PA
  });
});

describe("computeSampleWeight", () => {
  it("returns 0 for zero, negative, or non-finite PA", () => {
    assert.equal(computeSampleWeight(0), 0);
    assert.equal(computeSampleWeight(-5), 0);
    assert.equal(computeSampleWeight(null), 0);
    assert.equal(computeSampleWeight(NaN), 0);
  });

  it("returns exactly 0.5 at PA === K (80)", () => {
    assert.equal(computeSampleWeight(SAMPLE_WEIGHT_K), 0.5);
  });

  it("approaches 1 as PA grows large", () => {
    const weight = computeSampleWeight(920); // 920 / (920+80) = 0.92
    assert.ok(weight > 0.9 && weight < 1);
  });

  it("is monotonically increasing with PA", () => {
    const weights = [10, 40, 80, 160, 320].map(computeSampleWeight);
    for (let i = 1; i < weights.length; i += 1) {
      assert.ok(weights[i] > weights[i - 1], `weight at index ${i} should exceed previous`);
    }
  });
});

describe("isFallbackTrustworthy", () => {
  it("is trustworthy when overall PA is a positive finite number", () => {
    assert.equal(isFallbackTrustworthy(overallFallback()), true);
  });

  it("is not trustworthy when fallback is missing entirely", () => {
    assert.equal(isFallbackTrustworthy(null), false);
    assert.equal(isFallbackTrustworthy(undefined), false);
  });

  it("is not trustworthy when overall PA is zero or missing", () => {
    assert.equal(isFallbackTrustworthy(overallFallback({ plateAppearances: 0 })), false);
    assert.equal(isFallbackTrustworthy(overallFallback({ plateAppearances: null })), false);
  });
});

describe("shrinkSplitMetrics", () => {
  it("returns unavailable/no-op when there is no trustworthy fallback, regardless of split PA", () => {
    const result = shrinkSplitMetrics({
      raw: { plateAppearances: 260, battingAverage: 0.3, onBasePercentage: 0.4, sluggingPercentage: 0.55, ops: 0.95, hrRate: 0.04 },
      fallback: null,
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, "no_trustworthy_fallback");
    assert.equal(result.shrinkageWeight, 0);
    assert.equal(result.shrinkageApplied, false);
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.fallbackSource, null);
    assert.equal(result.shrunk, null);
    // Sample tier is still reported for visibility even though unavailable.
    assert.equal(result.sampleSizeTier, "high");
  });

  it("returns unavailable/no-op for PA below 20 with no valid fallback", () => {
    const result = shrinkSplitMetrics({
      raw: { plateAppearances: 5, battingAverage: 0.4, onBasePercentage: 0.4, sluggingPercentage: 0.6, ops: 1.0, hrRate: 0.2 },
      fallback: overallFallback({ plateAppearances: 0 }),
    });
    assert.equal(result.available, false);
    assert.equal(result.sampleSizeTier, "insufficient");
  });

  it("heavily shrinks toward fallback for PA below 20 when a valid fallback exists", () => {
    const result = shrinkSplitMetrics({
      raw: { plateAppearances: 5, battingAverage: 0.5, onBasePercentage: 0.5, sluggingPercentage: 0.9, ops: 1.4, hrRate: 0.3 },
      fallback: overallFallback(),
    });
    assert.equal(result.available, true);
    assert.equal(result.sampleSizeTier, "insufficient");
    assert.ok(result.shrinkageWeight < 0.1, `weight ${result.shrinkageWeight} should be small for PA=5`);
    // Shrunk value should sit much closer to the fallback than the raw extreme.
    assert.ok(result.shrunk.ops < 0.95, `shrunk ops ${result.shrunk.ops} should be pulled well below the raw 1.4`);
  });

  it("blends 50/50 at exactly PA === K", () => {
    const raw = { plateAppearances: 80, battingAverage: 0.3, onBasePercentage: 0.4, sluggingPercentage: 0.5, ops: 0.9, hrRate: 0.05 };
    const fallback = overallFallback({ battingAverage: 0.2, onBasePercentage: 0.3, sluggingPercentage: 0.4, ops: 0.7, hrRate: 0.02 });
    const result = shrinkSplitMetrics({ raw, fallback });
    assert.equal(result.shrinkageWeight, 0.5);
    assert.equal(result.shrunk.battingAverage, 0.25);
    assert.equal(result.shrunk.onBasePercentage, 0.35);
    assert.equal(result.shrunk.ops, 0.8);
  });

  it("clamps OPS to [0.300, 1.300] as a defense-in-depth bound", () => {
    const result = shrinkSplitMetrics({
      raw: { plateAppearances: 1000, battingAverage: 0.5, onBasePercentage: 0.6, sluggingPercentage: 0.9, ops: 1.5, hrRate: 0.3 },
      fallback: overallFallback({ ops: 1.4 }),
    });
    assert.ok(result.shrunk.ops <= 1.3);
  });

  it("handles PA=0 as pure fallback with zero shrinkage weight", () => {
    const result = shrinkSplitMetrics({
      raw: { plateAppearances: 0, battingAverage: null, onBasePercentage: null, sluggingPercentage: null, ops: null, hrRate: null },
      fallback: overallFallback(),
    });
    assert.equal(result.available, true);
    assert.equal(result.shrinkageWeight, 0);
    assert.equal(result.shrunk.ops, overallFallback().ops);
  });

  it("handles a missing raw metric by using the fallback value directly for that metric", () => {
    const result = shrinkSplitMetrics({
      raw: { plateAppearances: 80, battingAverage: null, onBasePercentage: 0.4, sluggingPercentage: 0.5, ops: 0.9, hrRate: 0.05 },
      fallback: overallFallback({ battingAverage: 0.26 }),
    });
    assert.equal(result.shrunk.battingAverage, 0.26);
  });

  it("is deterministic for identical inputs", () => {
    const raw = { plateAppearances: 109, battingAverage: 0.263, onBasePercentage: 0.343, sluggingPercentage: 0.495, ops: 0.838, hrRate: 0.055 };
    const fallback = overallFallback();
    const first = shrinkSplitMetrics({ raw, fallback });
    const second = shrinkSplitMetrics({ raw, fallback });
    assert.deepEqual(first, second);
  });
});
