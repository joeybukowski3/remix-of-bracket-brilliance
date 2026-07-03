/**
 * mlb-hr-hand-split-shadow.test.mjs
 * Run via: node --test scripts/lib/mlb-hr-hand-split-shadow.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_HAND_SPLIT_CONTRIBUTION,
  classifyHandSplitAvailability,
  computeHrHandSplitShadow,
} from "./mlb-hr-hand-split-shadow.mjs";

function splitEntry(overrides = {}) {
  return {
    plateAppearances: 150,
    sampleSizeTier: "medium",
    dataQuality: "medium",
    shrinkageApplied: true,
    shrinkageWeight: 0.65,
    fallbackUsed: true,
    fallbackSource: "batter_overall_season",
    raw: { plateAppearances: 150, ops: 0.9, hrRate: 0.05 },
    shrunk: { ops: 0.9, hrRate: 0.05 },
    ...overrides,
  };
}

function handSplits({ vsLeft = splitEntry(), vsRight = splitEntry(), freshnessStatus = "fresh" } = {}) {
  return { playerId: 592450, freshnessStatus, splits: { vsLeft, vsRight } };
}

describe("classifyHandSplitAvailability", () => {
  it("is unavailable when the hand-split entry is missing entirely", () => {
    assert.deepEqual(classifyHandSplitAvailability(null, "R"), { available: false, reason: "missing", selectedSide: null });
  });

  it("is unavailable when freshnessStatus is missing", () => {
    const result = classifyHandSplitAvailability(handSplits({ freshnessStatus: "missing" }), "R");
    assert.equal(result.available, false);
    assert.equal(result.reason, "missing");
  });

  it("is unavailable when freshnessStatus is stale-fallback", () => {
    const result = classifyHandSplitAvailability(handSplits({ freshnessStatus: "stale-fallback" }), "R");
    assert.equal(result.available, false);
    assert.equal(result.reason, "stale");
  });

  it("is unavailable for an unknown/unconfirmed pitcher hand", () => {
    assert.equal(classifyHandSplitAvailability(handSplits(), null).reason, "unknown_pitcher_hand");
    assert.equal(classifyHandSplitAvailability(handSplits(), "").reason, "unknown_pitcher_hand");
    assert.equal(classifyHandSplitAvailability(handSplits(), "S").reason, "unknown_pitcher_hand");
  });

  it("selects vsLeft for pitcher hand L and vsRight for R", () => {
    assert.equal(classifyHandSplitAvailability(handSplits(), "L").selectedSide, "vsLeft");
    assert.equal(classifyHandSplitAvailability(handSplits(), "R").selectedSide, "vsRight");
    assert.equal(classifyHandSplitAvailability(handSplits(), "l").selectedSide, "vsLeft"); // case-insensitive
  });

  it("is unavailable when the selected side's cache dataQuality is unavailable", () => {
    const result = classifyHandSplitAvailability(
      handSplits({ vsRight: splitEntry({ dataQuality: "unavailable", shrunk: null }) }),
      "R"
    );
    assert.equal(result.available, false);
    assert.equal(result.reason, "split_unavailable");
  });
});

describe("computeHrHandSplitShadow: unavailable/no-op scenarios", () => {
  it("returns contribution 0 when hand-split data is missing entirely", () => {
    const result = computeHrHandSplitShadow({ batterHandSplits: null, opposingPitcherHand: "R" });
    assert.equal(result.available, false);
    assert.equal(result.reason, "missing");
    assert.equal(result.handSplitShadowContribution, 0);
    assert.equal(result.opsScore, null);
  });

  it("returns contribution 0 for an unknown pitcher hand", () => {
    const result = computeHrHandSplitShadow({ batterHandSplits: handSplits(), opposingPitcherHand: null });
    assert.equal(result.available, false);
    assert.equal(result.reason, "unknown_pitcher_hand");
    assert.equal(result.handSplitShadowContribution, 0);
  });

  it("returns contribution 0 when the cache marked the split unavailable (no trustworthy fallback existed)", () => {
    const result = computeHrHandSplitShadow({
      batterHandSplits: handSplits({ vsRight: splitEntry({ dataQuality: "unavailable", shrunk: null, fallbackUsed: false, fallbackSource: null }) }),
      opposingPitcherHand: "R",
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, "split_unavailable");
    assert.equal(result.handSplitShadowContribution, 0);
    // Preserved even though unavailable.
    assert.equal(result.fallbackUsed, false);
  });

  it("returns contribution 0 for malformed/unusable shrunk metrics (both null)", () => {
    const result = computeHrHandSplitShadow({
      batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: null, hrRate: null } }) }),
      opposingPitcherHand: "R",
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, "malformed_metrics");
    assert.equal(result.handSplitShadowContribution, 0);
  });

  it("returns contribution 0 for a stale cache entry", () => {
    const result = computeHrHandSplitShadow({ batterHandSplits: handSplits({ freshnessStatus: "stale-fallback" }), opposingPitcherHand: "R" });
    assert.equal(result.available, false);
    assert.equal(result.reason, "stale");
    assert.equal(result.handSplitShadowContribution, 0);
  });
});

describe("computeHrHandSplitShadow: scored scenarios", () => {
  it("produces a positive contribution for a strong platoon split (high OPS + HR rate)", () => {
    const result = computeHrHandSplitShadow({
      batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: 1.05, hrRate: 0.08 } }) }),
      opposingPitcherHand: "R",
    });
    assert.equal(result.available, true);
    assert.ok(result.handSplitShadowContribution > 0, `expected positive contribution, got ${result.handSplitShadowContribution}`);
  });

  it("produces a negative contribution for a weak platoon split (low OPS + HR rate)", () => {
    const result = computeHrHandSplitShadow({
      batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: 0.55, hrRate: 0.005 } }) }),
      opposingPitcherHand: "R",
    });
    assert.equal(result.available, true);
    assert.ok(result.handSplitShadowContribution < 0, `expected negative contribution, got ${result.handSplitShadowContribution}`);
  });

  it("produces a near-zero contribution for a neutral split (at the scoring pivots)", () => {
    const result = computeHrHandSplitShadow({
      batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: 0.75, hrRate: 0.03 } }) }),
      opposingPitcherHand: "R",
    });
    assert.equal(result.available, true);
    assert.ok(Math.abs(result.handSplitShadowContribution) < 0.5, `expected near-zero, got ${result.handSplitShadowContribution}`);
  });

  it("hard-caps the contribution at +/-8 for an extreme split", () => {
    // The underlying [15,88] score curve is not symmetric around its 50
    // midpoint (88-50=38 above, 50-15=35 below), so the positive extreme
    // reaches exactly +8, while the negative extreme's true mathematical
    // floor is ~-7.37 -- the hard clamp to -8 is never actually needed to
    // engage for this curve shape, but must never be exceeded either way.
    const positive = computeHrHandSplitShadow({
      batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: 2.0, hrRate: 0.5 } }) }),
      opposingPitcherHand: "R",
    });
    const negative = computeHrHandSplitShadow({
      batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: 0.1, hrRate: 0 } }) }),
      opposingPitcherHand: "R",
    });
    assert.equal(positive.handSplitShadowContribution, MAX_HAND_SPLIT_CONTRIBUTION);
    assert.ok(negative.handSplitShadowContribution >= -MAX_HAND_SPLIT_CONTRIBUTION);
    assert.ok(negative.handSplitShadowContribution <= -7, `expected close to the negative floor, got ${negative.handSplitShadowContribution}`);
  });

  it("never exceeds the +/-8 hard cap even for a maximally extreme input", () => {
    const results = [
      computeHrHandSplitShadow({ batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: 100, hrRate: 100 } }) }), opposingPitcherHand: "R" }),
      computeHrHandSplitShadow({ batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: -100, hrRate: -100 } }) }), opposingPitcherHand: "R" }),
    ];
    for (const result of results) {
      assert.ok(Math.abs(result.handSplitShadowContribution) <= MAX_HAND_SPLIT_CONTRIBUTION);
    }
  });

  it("preserves sample-size tier, shrinkage weight, and fallback provenance for a mature sample", () => {
    const result = computeHrHandSplitShadow({
      batterHandSplits: handSplits({
        vsRight: splitEntry({ sampleSizeTier: "high", shrinkageWeight: 0.9, fallbackUsed: true, fallbackSource: "batter_overall_season" }),
      }),
      opposingPitcherHand: "R",
    });
    assert.equal(result.sampleSizeTier, "high");
    assert.equal(result.shrinkageWeight, 0.9);
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.fallbackSource, "batter_overall_season");
  });

  it("still scores a small, heavily shrunk sample using whatever the cache already shrunk it to", () => {
    const result = computeHrHandSplitShadow({
      batterHandSplits: handSplits({
        vsRight: splitEntry({ sampleSizeTier: "insufficient", shrinkageWeight: 0.06, shrunk: { ops: 0.76, hrRate: 0.031 } }),
      }),
      opposingPitcherHand: "R",
    });
    assert.equal(result.available, true);
    assert.equal(result.sampleSizeTier, "insufficient");
    assert.equal(result.shrinkageWeight, 0.06);
    // Shrunk values near the pivot -> contribution near zero, regardless of low weight (shadow doesn't re-derive shrinkage).
    assert.ok(Math.abs(result.handSplitShadowContribution) < 1);
  });

  it("preserves raw and shrunk metrics on the successful path", () => {
    const raw = { plateAppearances: 150, ops: 0.91, hrRate: 0.052 };
    const shrunk = { ops: 0.9, hrRate: 0.05 };
    const result = computeHrHandSplitShadow({
      batterHandSplits: handSplits({ vsRight: splitEntry({ raw, shrunk }) }),
      opposingPitcherHand: "R",
    });
    assert.deepEqual(result.raw, raw);
    assert.deepEqual(result.shrunk, shrunk);
  });

  it("is deterministic for identical inputs", () => {
    const input = { batterHandSplits: handSplits(), opposingPitcherHand: "R" };
    const first = computeHrHandSplitShadow(input);
    const second = computeHrHandSplitShadow(input);
    assert.deepEqual(first, second);
  });
});
