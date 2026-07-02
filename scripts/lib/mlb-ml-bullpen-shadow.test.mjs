/**
 * mlb-ml-bullpen-shadow.test.mjs
 * Run via: node --test scripts/lib/mlb-ml-bullpen-shadow.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LIVE_EDGE_WEIGHTS } from "./mlb-ml-edge-core.mjs";
import {
  classifyBullpenAvailability,
  computeBullpenQualityScore,
  buildBullpenAwareShadowWeights,
  BULLPEN_BASE_WEIGHT,
  BULLPEN_MAX_WEIGHT,
} from "./mlb-ml-bullpen-shadow.mjs";

const OTHER_LIVE_WEIGHT_KEYS = ["matchup", "offense", "form", "season"];
const OTHER_LIVE_WEIGHT_SUM = OTHER_LIVE_WEIGHT_KEYS.reduce((sum, k) => sum + LIVE_EDGE_WEIGHTS[k], 0);

function bullpenEntry({
  era = 3.5,
  hr9 = 1.0,
  kbb = 2.5,
  whip = 1.2,
  dataQuality = "high",
  fatigueTier = "fresh",
  freshnessStatus = "fresh",
  omitWorkload = false,
} = {}) {
  return {
    teamId: 1,
    teamAbbr: "NYY",
    season: { seasonBullpenEra: era, seasonBullpenHr9: hr9, seasonBullpenKbb: kbb, seasonBullpenWhip: whip, dataQuality },
    workload: omitWorkload ? undefined : { bullpenFatigueTier: fatigueTier },
    freshnessStatus,
  };
}

function weightsFor(ipFactor, bullpenAnalysis) {
  return buildBullpenAwareShadowWeights({
    pitcherWeight: LIVE_EDGE_WEIGHTS.pitcher * ipFactor,
    livePitcherWeight: LIVE_EDGE_WEIGHTS.pitcher,
    bullpenAnalysis,
    liveWeights: LIVE_EDGE_WEIGHTS,
    otherKeys: OTHER_LIVE_WEIGHT_KEYS,
    otherSum: OTHER_LIVE_WEIGHT_SUM,
  });
}

function sumWeights(weights) {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

describe("classifyBullpenAvailability", () => {
  it("missing entry is unavailable", () => {
    assert.deepEqual(classifyBullpenAvailability(null), { available: false, reason: "missing" });
    assert.deepEqual(classifyBullpenAvailability(undefined), { available: false, reason: "missing" });
  });

  it("freshnessStatus 'missing' is unavailable", () => {
    const entry = bullpenEntry({ freshnessStatus: "missing" });
    assert.equal(classifyBullpenAvailability(entry).available, false);
    assert.equal(classifyBullpenAvailability(entry).reason, "missing");
  });

  it("freshnessStatus 'stale-fallback' is unavailable (stale data must fall back)", () => {
    const entry = bullpenEntry({ freshnessStatus: "stale-fallback" });
    assert.equal(classifyBullpenAvailability(entry).available, false);
    assert.equal(classifyBullpenAvailability(entry).reason, "stale");
  });

  it("low or insufficient season data quality is unavailable", () => {
    assert.equal(classifyBullpenAvailability(bullpenEntry({ dataQuality: "low" })).available, false);
    assert.equal(classifyBullpenAvailability(bullpenEntry({ dataQuality: "insufficient" })).available, false);
  });

  it("adequate or high season data quality with fresh status is available", () => {
    assert.equal(classifyBullpenAvailability(bullpenEntry({ dataQuality: "adequate" })).available, true);
    assert.equal(classifyBullpenAvailability(bullpenEntry({ dataQuality: "high" })).available, true);
  });

  it("missing season section is unavailable", () => {
    const entry = { teamId: 1, freshnessStatus: "fresh" };
    assert.equal(classifyBullpenAvailability(entry).available, false);
    assert.equal(classifyBullpenAvailability(entry).reason, "missing_season_section");
  });
});

describe("computeBullpenQualityScore: fatigue scenarios", () => {
  it("a fresh bullpen scores higher than an identical but tired bullpen", () => {
    const fresh = computeBullpenQualityScore(bullpenEntry({ fatigueTier: "fresh" }));
    const tired = computeBullpenQualityScore(bullpenEntry({ fatigueTier: "tired" }));
    assert.ok(fresh.available && tired.available);
    assert.ok(fresh.qualityScore > tired.qualityScore);
  });

  it("normal fatigue sits strictly between fresh and tired for identical stats", () => {
    const fresh = computeBullpenQualityScore(bullpenEntry({ fatigueTier: "fresh" }));
    const normal = computeBullpenQualityScore(bullpenEntry({ fatigueTier: "normal" }));
    const tired = computeBullpenQualityScore(bullpenEntry({ fatigueTier: "tired" }));
    assert.ok(fresh.qualityScore > normal.qualityScore);
    assert.ok(normal.qualityScore > tired.qualityScore);
  });

  it("missing workload section defaults to neutral 'normal' fatigue, not a hard failure", () => {
    const result = computeBullpenQualityScore(bullpenEntry({ omitWorkload: true }));
    assert.equal(result.available, true);
    assert.equal(result.fatigueTier, "normal");
    assert.ok(Number.isFinite(result.qualityScore));
  });

  it("missing bullpen entry produces available:false and qualityScore:null", () => {
    const result = computeBullpenQualityScore(null);
    assert.equal(result.available, false);
    assert.equal(result.qualityScore, null);
  });

  it("low-coverage bullpen data produces available:false and qualityScore:null", () => {
    const result = computeBullpenQualityScore(bullpenEntry({ dataQuality: "low" }));
    assert.equal(result.available, false);
    assert.equal(result.reason, "low_coverage");
    assert.equal(result.qualityScore, null);
  });

  it("quality score is always bounded to [15, 88]", () => {
    const extremeGood = computeBullpenQualityScore(bullpenEntry({ era: 0.5, hr9: 0.1, kbb: 10, whip: 0.5, fatigueTier: "fresh" }));
    const extremeBad = computeBullpenQualityScore(bullpenEntry({ era: 12, hr9: 5, kbb: 0.1, whip: 3, fatigueTier: "tired" }));
    assert.ok(extremeGood.qualityScore <= 88 && extremeGood.qualityScore >= 15);
    assert.ok(extremeBad.qualityScore <= 88 && extremeBad.qualityScore >= 15);
  });

  it("is deterministic: same input always produces the same output", () => {
    const entry = bullpenEntry();
    assert.deepEqual(computeBullpenQualityScore(entry), computeBullpenQualityScore(entry));
  });
});

describe("buildBullpenAwareShadowWeights: normalization", () => {
  it("weights sum to exactly 1.0 when bullpen is unavailable (pre-bullpen fallback)", () => {
    const result = weightsFor(1.0, { available: false, qualityScore: null });
    assert.ok(Math.abs(sumWeights(result.weights) - 1.0) < 1e-9);
    assert.equal(result.weights.bullpen, 0);
    assert.equal(result.bullpenBaseWeight, 0);
    assert.equal(result.bullpenTransferredWeight, 0);
    assert.equal(result.bullpenEffectiveWeight, 0);
  });

  it("weights sum to exactly 1.0 when bullpen is available with a deep starter (ipFactor=1)", () => {
    const result = weightsFor(1.0, { available: true, qualityScore: 60 });
    assert.ok(Math.abs(sumWeights(result.weights) - 1.0) < 1e-9);
  });

  it("weights sum to exactly 1.0 when bullpen is available with an extreme opener (ipFactor at floor)", () => {
    const result = weightsFor(0.5, { available: true, qualityScore: 60 });
    assert.ok(Math.abs(sumWeights(result.weights) - 1.0) < 1e-9);
  });
});

describe("buildBullpenAwareShadowWeights: deep starter (near-base) vs opener (meaningfully higher)", () => {
  it("a deep starter (ipFactor=1, no freed weight) leaves bullpen at exactly the base weight", () => {
    const result = weightsFor(1.0, { available: true, qualityScore: 60 });
    assert.equal(result.bullpenEffectiveWeight, BULLPEN_BASE_WEIGHT);
    assert.equal(result.bullpenTransferredWeight, 0);
  });

  it("a short-outing starter (ipFactor<1) increases bullpen weight meaningfully above the base", () => {
    const deep = weightsFor(1.0, { available: true, qualityScore: 60 });
    const opener = weightsFor(0.5, { available: true, qualityScore: 60 });
    assert.ok(opener.bullpenEffectiveWeight > deep.bullpenEffectiveWeight);
    assert.ok(opener.bullpenTransferredWeight > 0);
  });

  it("effective bullpen weight never exceeds BULLPEN_MAX_WEIGHT, even at the extreme opener floor", () => {
    const result = weightsFor(0.5, { available: true, qualityScore: 60 });
    assert.ok(result.bullpenEffectiveWeight <= BULLPEN_MAX_WEIGHT + 1e-9);
  });

  it("overflow beyond the cap is redistributed to the other four components, not dropped", () => {
    const result = weightsFor(0.5, { available: true, qualityScore: 60 });
    // freedFromPitcher at ipFactor=0.5 is 0.15; base(0.08)+freed(0.15)=0.23 > cap(0.20),
    // so 0.03 of overflow must appear back in the other four weights.
    for (const key of OTHER_LIVE_WEIGHT_KEYS) {
      assert.ok(result.weights[key] > 0);
    }
    assert.ok(Math.abs(sumWeights(result.weights) - 1.0) < 1e-9);
  });
});

describe("buildBullpenAwareShadowWeights: unavailable bullpen matches pre-bullpen behavior exactly", () => {
  it("freed weight redistributes across the other four components when bullpen is unavailable", () => {
    const result = weightsFor(0.5, { available: false, qualityScore: null });
    assert.ok(result.weights.matchup > LIVE_EDGE_WEIGHTS.matchup);
    assert.ok(result.weights.offense > LIVE_EDGE_WEIGHTS.offense);
    assert.ok(result.weights.form > LIVE_EDGE_WEIGHTS.form);
    assert.ok(result.weights.season > LIVE_EDGE_WEIGHTS.season);
    assert.equal(result.weights.bullpen, 0);
  });
});
