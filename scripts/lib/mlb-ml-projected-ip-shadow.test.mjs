/**
 * mlb-ml-projected-ip-shadow.test.mjs
 * Run via: node --test scripts/lib/mlb-ml-projected-ip-shadow.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeModelEdgeCore } from "./mlb-ml-edge-core.mjs";
import {
  computeMlProjectedIpShadow,
  FULL_START_IP,
  MIN_IP_WEIGHT_FACTOR,
} from "./mlb-ml-projected-ip-shadow.mjs";
import { BULLPEN_BASE_WEIGHT, BULLPEN_MAX_WEIGHT } from "./mlb-ml-bullpen-shadow.mjs";

// Same base fixture as mlb-ml-edge-core.test.mjs, with starters.*.gamesStarted
// added (the Phase 2 addition to mlb-ml-detail-fetch.mjs).
function baseDetail() {
  return {
    game: { away: { abbreviation: "NYY", record: "23-15" }, home: { abbreviation: "BOS", record: "21-18" } },
    homeContext: { lastFiveRecord: "3-2", homeRecord: "12-7", awayRecord: "9-11" },
    awayContext: { lastFiveRecord: "4-1", homeRecord: "11-9", awayRecord: "12-6" },
    opponentSplits: {
      awayBattingVsHomeStarter: { plateAppearances: 1308, strikeOuts: 306, ops: 0.77 },
      homeBattingVsAwayStarter: { plateAppearances: 1279, strikeOuts: 291, ops: 0.732 },
    },
    lineupSummaries: {
      home: { avg: 0.244, obp: 0.321, slg: 0.411, ops: 0.732, kPct: 22.8 },
      away: { avg: 0.252, obp: 0.334, slg: 0.436, ops: 0.77, kPct: 23.4 },
    },
    // Both starters average exactly FULL_START_IP (6.0 IP over 8 starts) by
    // default, so the baseline is "full live pitcher weight for both
    // sides" unless a test deliberately overrides inningsPitched/gamesStarted.
    starters: {
      away: { era: 3.18, strikeOuts: 59, inningsPitched: "48.0", homeRuns: 4, battersFaced: 188, baseOnBalls: 18, gamesStarted: 8 },
      home: { era: 3.64, strikeOuts: 47, inningsPitched: "48.0", homeRuns: 5, battersFaced: 197, baseOnBalls: 17, gamesStarted: 8 },
    },
  };
}

function assertWeightsNormalize(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9, `weights should sum to 1.0, got ${sum}`);
}

describe("computeMlProjectedIpShadow: weight normalization", () => {
  it("away and home shadow weights each sum to exactly 1.0 for a typical matchup", () => {
    const result = computeMlProjectedIpShadow(baseDetail());
    assertWeightsNormalize(result.awayWeightsShadow);
    assertWeightsNormalize(result.homeWeightsShadow);
  });

  it("weights normalize even at the extreme opener/workhorse ends", () => {
    const detail = baseDetail();
    detail.starters.away.inningsPitched = "12.0"; // 1.5 IP/start over 8 GS -> opener-range, clamped
    detail.starters.home.inningsPitched = "64.0"; // 8.0 IP/start over 8 GS -> workhorse, clamped to max
    const result = computeMlProjectedIpShadow(detail);
    assertWeightsNormalize(result.awayWeightsShadow);
    assertWeightsNormalize(result.homeWeightsShadow);
  });
});

describe("computeMlProjectedIpShadow: opener scenario", () => {
  it("a starter projected well below FULL_START_IP gets reduced pitcher weight, floored at MIN_IP_WEIGHT_FACTOR", () => {
    const detail = baseDetail();
    // 12.0 IP / 8 GS = 1.5 avg -> clamped to starter min (3.0) by calculateProjectedInnings,
    // still well below FULL_START_IP (6.0), so weight should hit the floor.
    detail.starters.home.inningsPitched = "12.0";
    const result = computeMlProjectedIpShadow(detail);
    assert.equal(result.homeStarterProjectedIp, 3.0);
    assert.ok(Math.abs(result.homePitcherEffectiveWeightShadow - 0.30 * MIN_IP_WEIGHT_FACTOR) < 1e-9);
  });

  it("freed weight is redistributed to the SAME team's other components, not dropped", () => {
    const detail = baseDetail();
    detail.starters.home.inningsPitched = "12.0";
    const result = computeMlProjectedIpShadow(detail);
    // home pitcher weight shrank from 0.30 -> 0.15; the other four home
    // weights must have grown proportionally to absorb the 0.15 freed.
    assert.ok(result.homeWeightsShadow.matchup > 0.25);
    assert.ok(result.homeWeightsShadow.offense > 0.20);
    assert.ok(result.homeWeightsShadow.form > 0.15);
    assert.ok(result.homeWeightsShadow.season > 0.10);
    assertWeightsNormalize(result.homeWeightsShadow);
  });

  it("one team's opener does not change the other team's weights", () => {
    const detail = baseDetail();
    detail.starters.home.inningsPitched = "12.0"; // home is the opener
    const result = computeMlProjectedIpShadow(detail);
    assert.equal(result.awayPitcherEffectiveWeightShadow, 0.30);
    // bullpen: 0 because no bullpen option was passed to
    // computeMlProjectedIpShadow() -- bullpen is unavailable by default
    // (see the Phase 2.4 bullpen-shadow-integration commit), so weights
    // fall back byte-for-byte to the pre-bullpen formula.
    assert.deepEqual(result.awayWeightsShadow, { pitcher: 0.30, matchup: 0.25, offense: 0.20, form: 0.15, season: 0.10, bullpen: 0 });
  });
});

describe("computeMlProjectedIpShadow: typical starter scenario", () => {
  it("a starter projected at/above FULL_START_IP keeps the full live pitcher weight", () => {
    const detail = baseDetail();
    detail.starters.away.inningsPitched = "48.0"; // 6.0 IP/start over 8 GS = FULL_START_IP exactly
    const result = computeMlProjectedIpShadow(detail);
    assert.equal(result.awayStarterProjectedIp, FULL_START_IP);
    assert.equal(result.awayPitcherEffectiveWeightShadow, 0.30);
  });
});

describe("computeMlProjectedIpShadow: workhorse scenario", () => {
  it("a starter projected well above FULL_START_IP is capped, not given extra weight", () => {
    const detail = baseDetail();
    detail.starters.away.inningsPitched = "70.0"; // 8.75 IP/start over 8 GS -> clamped to starter max 8.0
    const result = computeMlProjectedIpShadow(detail);
    assert.equal(result.awayStarterProjectedIp, 8.0);
    // Weight should not exceed the live 0.30 -- ipFactor is clamped to 1.0 max.
    assert.equal(result.awayPitcherEffectiveWeightShadow, 0.30);
  });
});

describe("computeMlProjectedIpShadow: missing-data scenario", () => {
  it("falls back to full live pitcher weight when gamesStarted is missing", () => {
    const detail = baseDetail();
    detail.starters.home.gamesStarted = null;
    const result = computeMlProjectedIpShadow(detail);
    assert.equal(result.homeStarterProjectedIpSource, "fallback_missing_data");
    assert.equal(result.homePitcherEffectiveWeightShadow, 0.30);
  });

  it("falls back to full live pitcher weight when inningsPitched is missing", () => {
    const detail = baseDetail();
    detail.starters.away.inningsPitched = null;
    const result = computeMlProjectedIpShadow(detail);
    assert.equal(result.awayStarterProjectedIpSource, "fallback_missing_data");
    assert.equal(result.awayPitcherEffectiveWeightShadow, 0.30);
  });

  it("falls back to full live pitcher weight when gamesStarted is 0 (would divide by zero)", () => {
    const detail = baseDetail();
    detail.starters.home.gamesStarted = 0;
    const result = computeMlProjectedIpShadow(detail);
    assert.equal(result.homeStarterProjectedIpSource, "fallback_missing_data");
    assert.equal(result.homePitcherEffectiveWeightShadow, 0.30);
  });

  it("projectedIpDataQuality.bothReal is false when either side is missing data", () => {
    const detail = baseDetail();
    detail.starters.home.gamesStarted = null;
    const result = computeMlProjectedIpShadow(detail);
    assert.equal(result.projectedIpDataQuality.bothReal, false);
    assert.equal(result.projectedIpDataQuality.away, "real");
    assert.equal(result.projectedIpDataQuality.home, "fallback_missing_data");
  });
});

describe("computeMlProjectedIpShadow: score-bound tests", () => {
  it("shadow confidence stays within the live [50, 82] bounds", () => {
    const cases = [
      baseDetail(),
      (() => { const d = baseDetail(); d.starters.away.inningsPitched = "12.0"; return d; })(),
      (() => { const d = baseDetail(); d.starters.home.inningsPitched = "70.0"; return d; })(),
      (() => { const d = baseDetail(); d.starters.away.gamesStarted = null; d.starters.home.gamesStarted = null; return d; })(),
    ];
    for (const detail of cases) {
      const result = computeMlProjectedIpShadow(detail);
      assert.ok(result.projectedIpShadowConfidence >= 50 && result.projectedIpShadowConfidence <= 82);
      assert.ok(["away", "home", "push"].includes(result.projectedIpShadowPick));
      assert.ok(["strong", "moderate", "slight", "coin-flip"].includes(result.projectedIpShadowTier));
      assert.ok(Number.isFinite(result.projectedIpShadowDifferential));
      assert.ok(result.projectedIpShadowDifferential >= 0);
    }
  });

  it("every pitcher effective weight stays within [0.30 * MIN_IP_WEIGHT_FACTOR, 0.30]", () => {
    const cases = [
      baseDetail(),
      (() => { const d = baseDetail(); d.starters.away.inningsPitched = "8.0"; return d; })(), // 1.0 IP/start, extreme opener
      (() => { const d = baseDetail(); d.starters.home.inningsPitched = "96.0"; return d; })(), // 12.0 IP/start, extreme workhorse
    ];
    for (const detail of cases) {
      const result = computeMlProjectedIpShadow(detail);
      for (const w of [result.awayPitcherEffectiveWeightShadow, result.homePitcherEffectiveWeightShadow]) {
        assert.ok(w >= 0.30 * MIN_IP_WEIGHT_FACTOR - 1e-9);
        assert.ok(w <= 0.30 + 1e-9);
      }
    }
  });
});

describe("computeMlProjectedIpShadow: live-output parity", () => {
  it("calling the shadow model does not change computeModelEdgeCore's live output on the same detail", () => {
    const detail = baseDetail();
    detail.starters.home.inningsPitched = "12.0"; // force a real weight-scaling scenario

    const liveBefore = computeModelEdgeCore(detail);
    computeMlProjectedIpShadow(detail);
    const liveAfter = computeModelEdgeCore(detail);

    assert.deepEqual(liveBefore, liveAfter);
    // Live Pitcher Quality weight must still be exactly 0.30, never scaled.
    const pitcherFactor = liveAfter.factors.find((f) => f.label === "Pitcher Quality");
    assert.equal(pitcherFactor.weight, 0.30);
  });

  it("shadow output fields are all namespaced (*Shadow / shadow*) so they cannot be mistaken for live fields", () => {
    const result = computeMlProjectedIpShadow(baseDetail());
    const liveOnlyFieldNames = ["pick", "confidence", "differential", "factors", "topFactor", "summary"];
    for (const name of liveOnlyFieldNames) {
      assert.equal(result[name], undefined, `shadow result should not contain live field '${name}'`);
    }
  });

  it("carries both the live and shadow experiment version, never conflated", () => {
    const result = computeMlProjectedIpShadow(baseDetail());
    assert.equal(result.liveModelVersion, "mlb-ml-edge-v1.0");
    assert.equal(result.shadowExperimentVersion, "mlb-ml-phase2-shadow-v1");
    assert.notEqual(result.liveModelVersion, result.shadowExperimentVersion);
  });
});

// -- Phase 2.4: bullpen shadow integration ---------------------------------

function bullpenEntry({
  era = 3.5,
  hr9 = 1.0,
  kbb = 2.5,
  whip = 1.2,
  dataQuality = "high",
  fatigueTier = "fresh",
  freshnessStatus = "fresh",
} = {}) {
  return {
    teamId: 1,
    teamAbbr: "NYY",
    season: { seasonBullpenEra: era, seasonBullpenHr9: hr9, seasonBullpenKbb: kbb, seasonBullpenWhip: whip, dataQuality },
    workload: { bullpenFatigueTier: fatigueTier },
    freshnessStatus,
  };
}

describe("computeMlProjectedIpShadow: bullpen integration -- backward compatibility", () => {
  it("omitting the bullpen option entirely is byte-for-byte identical to not passing options at all", () => {
    const detail = baseDetail();
    const withoutOptions = computeMlProjectedIpShadow(detail);
    const withEmptyOptions = computeMlProjectedIpShadow(detail, {});
    assert.deepEqual(withoutOptions, withEmptyOptions);
  });

  it("live Moneyline output is still byte-for-byte unchanged when bullpen data is supplied", () => {
    const detail = baseDetail();
    const liveBefore = computeModelEdgeCore(detail);
    computeMlProjectedIpShadow(detail, { bullpen: { away: bullpenEntry(), home: bullpenEntry() } });
    const liveAfter = computeModelEdgeCore(detail);
    assert.deepEqual(liveBefore, liveAfter);
  });
});

describe("computeMlProjectedIpShadow: bullpen integration -- availability scenarios", () => {
  it("missing bullpen data falls back to the pre-bullpen projected-IP shadow result", () => {
    const detail = baseDetail();
    const withoutBullpen = computeMlProjectedIpShadow(detail);
    const withMissingBullpen = computeMlProjectedIpShadow(detail, { bullpen: { away: null, home: null } });
    assert.equal(withMissingBullpen.awayBullpenShadow.available, false);
    assert.equal(withMissingBullpen.homeBullpenShadow.available, false);
    assert.equal(withMissingBullpen.projectedIpShadowDifferential, withoutBullpen.projectedIpShadowDifferential);
    assert.equal(withMissingBullpen.projectedIpShadowPick, withoutBullpen.projectedIpShadowPick);
    assert.deepEqual(withMissingBullpen.awayWeightsShadow, withoutBullpen.awayWeightsShadow);
  });

  it("low-coverage bullpen data falls back the same way as missing data", () => {
    const detail = baseDetail();
    const withoutBullpen = computeMlProjectedIpShadow(detail);
    const withLowCoverage = computeMlProjectedIpShadow(detail, {
      bullpen: { away: bullpenEntry({ dataQuality: "low" }), home: bullpenEntry({ dataQuality: "insufficient" }) },
    });
    assert.equal(withLowCoverage.awayBullpenShadow.available, false);
    assert.equal(withLowCoverage.awayBullpenShadow.reason, "low_coverage");
    assert.equal(withLowCoverage.homeBullpenShadow.reason, "low_coverage");
    assert.deepEqual(withLowCoverage.homeWeightsShadow, withoutBullpen.homeWeightsShadow);
  });

  it("one team's missing bullpen data does not affect the other team's weighting", () => {
    const detail = baseDetail();
    const result = computeMlProjectedIpShadow(detail, {
      bullpen: { away: bullpenEntry(), home: null },
    });
    assert.equal(result.awayBullpenShadow.available, true);
    assert.equal(result.homeBullpenShadow.available, false);
    assert.equal(result.homeWeightsShadow.bullpen, 0);
    assert.ok(result.awayWeightsShadow.bullpen > 0);
  });

  it("fresh, normal, and tired fatigue scenarios all remain available and bounded", () => {
    for (const fatigueTier of ["fresh", "normal", "tired"]) {
      const detail = baseDetail();
      const result = computeMlProjectedIpShadow(detail, {
        bullpen: { away: bullpenEntry({ fatigueTier }), home: bullpenEntry({ fatigueTier }) },
      });
      assert.equal(result.awayBullpenShadow.available, true);
      assert.equal(result.awayBullpenShadow.fatigueTier, fatigueTier);
      assert.ok(result.awayBullpenShadow.qualityScore >= 15 && result.awayBullpenShadow.qualityScore <= 88);
    }
  });
});

describe("computeMlProjectedIpShadow: bullpen integration -- weight transfer and normalization", () => {
  it("weights normalize to exactly 1.0 with bullpen available, for both a deep starter and an opener", () => {
    const deepDetail = baseDetail();
    const deepResult = computeMlProjectedIpShadow(deepDetail, { bullpen: { away: bullpenEntry(), home: bullpenEntry() } });
    for (const weights of [deepResult.awayWeightsShadow, deepResult.homeWeightsShadow]) {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1.0) < 1e-9);
    }

    const openerDetail = baseDetail();
    openerDetail.starters.home.inningsPitched = "12.0"; // opener
    const openerResult = computeMlProjectedIpShadow(openerDetail, { bullpen: { away: bullpenEntry(), home: bullpenEntry() } });
    for (const weights of [openerResult.awayWeightsShadow, openerResult.homeWeightsShadow]) {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1.0) < 1e-9);
    }
  });

  it("a deep starter leaves bullpen near the base weight; an opener increases it meaningfully", () => {
    const deepDetail = baseDetail(); // both starters at FULL_START_IP by default
    const deepResult = computeMlProjectedIpShadow(deepDetail, { bullpen: { away: bullpenEntry(), home: bullpenEntry() } });
    assert.equal(deepResult.homeBullpenShadow.effectiveWeight, BULLPEN_BASE_WEIGHT);

    const openerDetail = baseDetail();
    openerDetail.starters.home.inningsPitched = "12.0"; // opener
    const openerResult = computeMlProjectedIpShadow(openerDetail, { bullpen: { away: bullpenEntry(), home: bullpenEntry() } });
    assert.ok(openerResult.homeBullpenShadow.effectiveWeight > BULLPEN_BASE_WEIGHT);
    assert.ok(openerResult.homeBullpenShadow.transferredWeight > 0);
  });

  it("effective bullpen weight is capped at BULLPEN_MAX_WEIGHT even for the most extreme opener", () => {
    const detail = baseDetail();
    detail.starters.home.inningsPitched = "8.0"; // 1.0 IP/start, extreme opener
    const result = computeMlProjectedIpShadow(detail, { bullpen: { away: bullpenEntry(), home: bullpenEntry() } });
    assert.ok(result.homeBullpenShadow.effectiveWeight <= BULLPEN_MAX_WEIGHT + 1e-9);
  });

  it("bullpen contribution is exposed and is 0 for unavailable bullpens", () => {
    const detail = baseDetail();
    const result = computeMlProjectedIpShadow(detail, { bullpen: { away: bullpenEntry(), home: null } });
    assert.ok(Number.isFinite(result.awayBullpenShadow.contribution));
    assert.equal(result.homeBullpenShadow.contribution, 0);
  });

  it("bullpenShadowDataQuality summarizes both teams' availability", () => {
    const detail = baseDetail();
    const result = computeMlProjectedIpShadow(detail, { bullpen: { away: bullpenEntry(), home: bullpenEntry() } });
    assert.equal(result.bullpenShadowDataQuality.bothAvailable, true);
    assert.equal(result.bullpenShadowDataQuality.away, "high");
    assert.equal(result.bullpenShadowDataQuality.home, "high");
  });

  it("is deterministic: same input always produces the same output with bullpen data supplied", () => {
    const detail = baseDetail();
    const options = { bullpen: { away: bullpenEntry(), home: bullpenEntry({ fatigueTier: "tired" }) } };
    const r1 = computeMlProjectedIpShadow(detail, options);
    const r2 = computeMlProjectedIpShadow(detail, options);
    assert.deepEqual(r1, r2);
  });
});
