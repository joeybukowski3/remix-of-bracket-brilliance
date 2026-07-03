/**
 * mlb-hr-phase2-shadow.test.mjs
 * Run via: node --test scripts/lib/mlb-hr-phase2-shadow.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeHrPhase2Shadow } from "./mlb-hr-phase2-shadow.mjs";
import { MLB_HR_MODEL_VERSION, MLB_HR_PHASE2_SHADOW_VERSION } from "./mlb-hr-model-version.mjs";

const LIVE_HR_SCORE = 62.4;

function bullpenEntry({ hr9 = 1.18, dataQuality = "high", freshnessStatus = "fresh" } = {}) {
  return {
    teamId: 1,
    teamAbbr: "BOS",
    season: { seasonBullpenEra: 3.5, seasonBullpenHr9: hr9, seasonBullpenKbb: 2.5, seasonBullpenWhip: 1.2, dataQuality },
    workload: { bullpenFatigueTier: "fresh" },
    freshnessStatus,
  };
}
const DEEP_STARTER = { inningsPitched: "48.0", gamesStarted: 8 };

function splitEntry(overrides = {}) {
  return {
    plateAppearances: 150,
    sampleSizeTier: "medium",
    dataQuality: "medium",
    shrinkageApplied: true,
    shrinkageWeight: 0.65,
    fallbackUsed: true,
    fallbackSource: "batter_overall_season",
    raw: { plateAppearances: 150, ops: 0.95, hrRate: 0.06 },
    shrunk: { ops: 0.95, hrRate: 0.06 },
    ...overrides,
  };
}
function handSplits(overrides = {}) {
  return { playerId: 592450, freshnessStatus: "fresh", splits: { vsLeft: splitEntry(), vsRight: splitEntry(), ...overrides } };
}

const BOTH_FLAGS_ON = { ENABLE_HR_BULLPEN_SHADOW: true, ENABLE_HR_HAND_SPLIT_SHADOW: true };

describe("computeHrPhase2Shadow: neither component", () => {
  it("returns the exact pre-Phase-2 no-op when both flags are off", () => {
    const result = computeHrPhase2Shadow(LIVE_HR_SCORE, {
      opposingBullpen: bullpenEntry(),
      opposingStarter: DEEP_STARTER,
      batterHandSplits: handSplits(),
      opposingPitcherHand: "R",
      flags: {},
    });
    assert.equal(result.enabledComponents.bullpen, false);
    assert.equal(result.enabledComponents.handSplit, false);
    assert.equal(result.bullpenShadow, null);
    assert.equal(result.handSplitShadow, null);
    assert.equal(result.componentContributions.bullpen, 0);
    assert.equal(result.componentContributions.handSplit, 0);
    assert.equal(result.combinedShadowScore, LIVE_HR_SCORE);
  });

  it("returns the exact pre-Phase-2 no-op when both flags are on but both components are unavailable", () => {
    const result = computeHrPhase2Shadow(LIVE_HR_SCORE, {
      opposingBullpen: null,
      opposingStarter: null,
      batterHandSplits: null,
      opposingPitcherHand: null,
      flags: BOTH_FLAGS_ON,
    });
    assert.equal(result.componentAvailability.bullpen, false);
    assert.equal(result.componentAvailability.handSplit, false);
    assert.equal(result.combinedShadowScore, LIVE_HR_SCORE);
  });
});

describe("computeHrPhase2Shadow: bullpen-only", () => {
  it("applies only the bullpen contribution when hand-split is disabled", () => {
    const result = computeHrPhase2Shadow(LIVE_HR_SCORE, {
      opposingBullpen: bullpenEntry({ hr9: 1.8 }), // above-average HR9 -> positive vulnerability contribution
      opposingStarter: DEEP_STARTER,
      batterHandSplits: handSplits(),
      opposingPitcherHand: "R",
      flags: { ENABLE_HR_BULLPEN_SHADOW: true },
    });
    assert.equal(result.enabledComponents.bullpen, true);
    assert.equal(result.enabledComponents.handSplit, false);
    assert.equal(result.handSplitShadow, null);
    assert.equal(result.componentContributions.handSplit, 0);
    assert.notEqual(result.componentContributions.bullpen, 0);
    assert.equal(result.combinedShadowScore, Math.round((LIVE_HR_SCORE + result.componentContributions.bullpen) * 10) / 10);
  });
});

describe("computeHrPhase2Shadow: hand-split-only", () => {
  it("applies only the hand-split contribution when bullpen is disabled", () => {
    const result = computeHrPhase2Shadow(LIVE_HR_SCORE, {
      opposingBullpen: bullpenEntry({ hr9: 1.8 }),
      opposingStarter: DEEP_STARTER,
      batterHandSplits: handSplits(),
      opposingPitcherHand: "R",
      flags: { ENABLE_HR_HAND_SPLIT_SHADOW: true },
    });
    assert.equal(result.enabledComponents.bullpen, false);
    assert.equal(result.enabledComponents.handSplit, true);
    assert.equal(result.bullpenShadow, null);
    assert.equal(result.componentContributions.bullpen, 0);
    assert.notEqual(result.componentContributions.handSplit, 0);
    assert.equal(result.combinedShadowScore, Math.round((LIVE_HR_SCORE + result.componentContributions.handSplit) * 10) / 10);
  });
});

describe("computeHrPhase2Shadow: both components", () => {
  it("sums both contributions into the combined score", () => {
    const result = computeHrPhase2Shadow(LIVE_HR_SCORE, {
      opposingBullpen: bullpenEntry({ hr9: 1.8 }),
      opposingStarter: DEEP_STARTER,
      batterHandSplits: handSplits(),
      opposingPitcherHand: "R",
      flags: BOTH_FLAGS_ON,
    });
    assert.equal(result.enabledComponents.bullpen, true);
    assert.equal(result.enabledComponents.handSplit, true);
    const expected = Math.round(Math.min(100, Math.max(0, LIVE_HR_SCORE + result.componentContributions.bullpen + result.componentContributions.handSplit)) * 10) / 10;
    assert.equal(result.combinedShadowScore, expected);
  });

  it("lets one component apply when the other is unavailable, without blocking it", () => {
    const result = computeHrPhase2Shadow(LIVE_HR_SCORE, {
      opposingBullpen: null, // unavailable
      opposingStarter: null,
      batterHandSplits: handSplits(),
      opposingPitcherHand: "R", // available
      flags: BOTH_FLAGS_ON,
    });
    assert.equal(result.componentAvailability.bullpen, false);
    assert.equal(result.componentAvailability.handSplit, true);
    assert.equal(result.componentContributions.bullpen, 0);
    assert.notEqual(result.componentContributions.handSplit, 0);
  });
});

describe("computeHrPhase2Shadow: combined-score bounds", () => {
  it("clamps the combined score to [0, 100] near the top", () => {
    const result = computeHrPhase2Shadow(99, {
      opposingBullpen: bullpenEntry({ hr9: 3 }), // max positive vulnerability
      opposingStarter: { inningsPitched: "3.0", gamesStarted: 8 }, // opener-like, max exposure
      batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: 2.0, hrRate: 0.5 } }) }), // max positive hand-split
      opposingPitcherHand: "R",
      flags: BOTH_FLAGS_ON,
    });
    assert.ok(result.combinedShadowScore <= 100);
  });

  it("clamps the combined score to [0, 100] near the bottom", () => {
    const result = computeHrPhase2Shadow(1, {
      opposingBullpen: bullpenEntry({ hr9: 0.3 }), // max negative vulnerability
      opposingStarter: { inningsPitched: "3.0", gamesStarted: 8 },
      batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: 0.1, hrRate: 0 } }) }), // max negative hand-split
      opposingPitcherHand: "R",
      flags: BOTH_FLAGS_ON,
    });
    assert.ok(result.combinedShadowScore >= 0);
  });
});

describe("computeHrPhase2Shadow: feature-flag gating", () => {
  it("never reads bullpen/hand-split data when its flag is off, even if supplied", () => {
    const result = computeHrPhase2Shadow(LIVE_HR_SCORE, {
      opposingBullpen: bullpenEntry({ hr9: 5 }),
      opposingStarter: DEEP_STARTER,
      batterHandSplits: handSplits({ vsRight: splitEntry({ shrunk: { ops: 2, hrRate: 1 } }) }),
      opposingPitcherHand: "R",
      flags: {},
    });
    assert.equal(result.combinedShadowScore, LIVE_HR_SCORE);
  });
});

describe("computeHrPhase2Shadow: live score integrity and identification", () => {
  it("never mutates or recomputes the live HR score", () => {
    const result = computeHrPhase2Shadow(LIVE_HR_SCORE, {
      opposingBullpen: bullpenEntry({ hr9: 1.8 }),
      opposingStarter: DEEP_STARTER,
      batterHandSplits: handSplits(),
      opposingPitcherHand: "R",
      flags: BOTH_FLAGS_ON,
    });
    assert.equal(result.live.hrScore, LIVE_HR_SCORE);
  });

  it("carries the production model version and the composition shadow experiment version, never conflated", () => {
    const result = computeHrPhase2Shadow(LIVE_HR_SCORE, { flags: {} });
    assert.equal(result.liveModelVersion, MLB_HR_MODEL_VERSION);
    assert.equal(result.shadowExperimentVersion, MLB_HR_PHASE2_SHADOW_VERSION);
    assert.notEqual(result.liveModelVersion, result.shadowExperimentVersion);
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      opposingBullpen: bullpenEntry({ hr9: 1.8 }),
      opposingStarter: DEEP_STARTER,
      batterHandSplits: handSplits(),
      opposingPitcherHand: "R",
      flags: BOTH_FLAGS_ON,
    };
    const first = computeHrPhase2Shadow(LIVE_HR_SCORE, input);
    const second = computeHrPhase2Shadow(LIVE_HR_SCORE, input);
    assert.deepEqual(first, second);
  });
});
