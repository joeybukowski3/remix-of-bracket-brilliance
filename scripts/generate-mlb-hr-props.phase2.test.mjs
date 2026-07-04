/**
 * generate-mlb-hr-props.phase2.test.mjs
 * Run via: node --test scripts/generate-mlb-hr-props.phase2.test.mjs
 *
 * Tests the exported buildHrPhase2Shadow() wiring helper in isolation
 * (dependency injection via plain objects) -- deliberately does not run
 * the full main() live slate, per the Phase 2 generator-wiring scope
 * ("avoid running a full live slate for unit tests").
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHrPhase2Shadow } from "./generate-mlb-hr-props.mjs";

const HR_SCORE = 58.3;
const OPPOSING_STARTER = { inningsPitched: "48.0", gamesStarted: 8 };

function bullpenEntry() {
  return {
    teamId: 1,
    teamAbbr: "X",
    season: { seasonBullpenEra: 3.5, seasonBullpenHr9: 1.18, seasonBullpenKbb: 2.5, seasonBullpenWhip: 1.2, dataQuality: "high" },
    workload: { bullpenFatigueTier: "fresh" },
    freshnessStatus: "fresh",
  };
}
const BULLPEN_CACHE = { teams: { 111: bullpenEntry() } };

function splitEntry() {
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
  };
}
const HAND_SPLIT_CACHE = {
  players: { 592450: { playerId: 592450, freshnessStatus: "fresh", splits: { vsLeft: splitEntry(), vsRight: splitEntry() } } },
};

const BASE_PARAMS = {
  hrScore: HR_SCORE,
  opponentTeamId: 111,
  opposingPitcherSeasonStats: OPPOSING_STARTER,
  opposingPitcherHand: "R",
  playerId: 592450,
  bullpenCache: BULLPEN_CACHE,
  handSplitCache: HAND_SPLIT_CACHE,
};

describe("buildHrPhase2Shadow: flags off -> exact legacy shape", () => {
  it("returns undefined (not null, not an empty object) when neither relevant flag is enabled", () => {
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, flags: {} });
    assert.equal(result, undefined);
  });

  it("returns undefined when only an unrelated flag is enabled", () => {
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, flags: { ENABLE_PHASE2_SHADOW_COMPARISON: true } });
    assert.equal(result, undefined);
  });
});

describe("buildHrPhase2Shadow: individual component flags", () => {
  it("bullpen only", () => {
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, flags: { ENABLE_HR_BULLPEN_SHADOW: true } });
    assert.equal(result.enabledComponents.bullpen, true);
    assert.equal(result.enabledComponents.handSplit, false);
    assert.equal(result.handSplitShadow, null);
  });

  it("hand split only", () => {
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, flags: { ENABLE_HR_HAND_SPLIT_SHADOW: true } });
    assert.equal(result.enabledComponents.handSplit, true);
    assert.equal(result.enabledComponents.bullpen, false);
    assert.equal(result.bullpenShadow, null);
  });

  it("both HR shadow flags on", () => {
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, flags: { ENABLE_HR_BULLPEN_SHADOW: true, ENABLE_HR_HAND_SPLIT_SHADOW: true } });
    assert.equal(result.enabledComponents.bullpen, true);
    assert.equal(result.enabledComponents.handSplit, true);
    assert.ok(result.bullpenShadow);
    assert.ok(result.handSplitShadow);
  });
});

describe("buildHrPhase2Shadow: missing/malformed inputs fail neutral, never throw for data reasons", () => {
  it("unknown pitcher hand -> hand-split component unavailable, contribution 0", () => {
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, opposingPitcherHand: null, flags: { ENABLE_HR_HAND_SPLIT_SHADOW: true } });
    assert.equal(result.handSplitShadow.available, false);
    assert.equal(result.handSplitShadow.reason, "unknown_pitcher_hand");
    assert.equal(result.componentContributions.handSplit, 0);
  });

  it("missing hand-split cache -> unavailable, contribution 0", () => {
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, handSplitCache: { players: {} }, flags: { ENABLE_HR_HAND_SPLIT_SHADOW: true } });
    assert.equal(result.handSplitShadow.available, false);
    assert.equal(result.handSplitShadow.reason, "missing");
  });

  it("stale/unavailable split cache entry -> unavailable, contribution 0", () => {
    const staleCache = { players: { 592450: { playerId: 592450, freshnessStatus: "stale-fallback", splits: { vsLeft: splitEntry(), vsRight: splitEntry() } } } };
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, handSplitCache: staleCache, flags: { ENABLE_HR_HAND_SPLIT_SHADOW: true } });
    assert.equal(result.handSplitShadow.available, false);
    assert.equal(result.handSplitShadow.reason, "stale");
  });

  it("missing bullpen cache -> unavailable, contribution 0", () => {
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, bullpenCache: { teams: {} }, flags: { ENABLE_HR_BULLPEN_SHADOW: true } });
    assert.equal(result.bullpenShadow.available, false);
    assert.equal(result.componentContributions.bullpen, 0);
  });

  it("a malformed hrScore (non-numeric) degrades to a null combinedShadowScore rather than throwing or fabricating a number", () => {
    // computeHrPhase2Shadow is defensive by design: clamp()/round() both
    // propagate non-finite input to null instead of throwing. In real
    // generator usage hrScore is always a finite number by construction
    // (Math.round(...) / 10), so this documents graceful degradation for
    // a hypothetical malformed value, not a realistic production path.
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, hrScore: "not-a-number", flags: { ENABLE_HR_BULLPEN_SHADOW: true } });
    assert.equal(result.combinedShadowScore, null);
    assert.equal(result.live.hrScore, "not-a-number"); // still passed through untouched, never fabricated
  });
});

describe("buildHrPhase2Shadow: a per-batter shadow exception does not stop the slate (isolation pattern)", () => {
  it("the exact isolation pattern used in main() converts a genuine throw into undefined without propagating", () => {
    // The shadow modules are defensive enough that ordinary malformed data
    // never throws (see the test above) -- to exercise the isolation
    // pattern itself, force a genuine unexpected runtime error (e.g. the
    // kind a bug elsewhere or a throwing getter could cause) via a Proxy.
    const throwingFlags = new Proxy({}, { get() { throw new Error("simulated unexpected failure"); } });
    let phase2Shadow;
    let caughtMessage = null;
    try {
      phase2Shadow = buildHrPhase2Shadow({ ...BASE_PARAMS, flags: throwingFlags });
    } catch (shadowErr) {
      caughtMessage = shadowErr instanceof Error ? shadowErr.message : String(shadowErr);
      phase2Shadow = undefined;
    }
    assert.equal(phase2Shadow, undefined);
    assert.equal(caughtMessage, "simulated unexpected failure");
  });
});

describe("buildHrPhase2Shadow: live HR score integrity", () => {
  it("never mutates or recomputes the live HR score, and never affects ordering (caller sorts on hrScore before this runs)", () => {
    const result = buildHrPhase2Shadow({ ...BASE_PARAMS, flags: { ENABLE_HR_BULLPEN_SHADOW: true, ENABLE_HR_HAND_SPLIT_SHADOW: true } });
    assert.equal(result.live.hrScore, HR_SCORE);
  });

  it("is deterministic for identical inputs", () => {
    const flags = { ENABLE_HR_BULLPEN_SHADOW: true, ENABLE_HR_HAND_SPLIT_SHADOW: true };
    const first = buildHrPhase2Shadow({ ...BASE_PARAMS, flags });
    const second = buildHrPhase2Shadow({ ...BASE_PARAMS, flags });
    assert.deepEqual(first, second);
  });
});
