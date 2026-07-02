/**
 * mlb-hr-bullpen-shadow.test.mjs
 * Run via: node --test scripts/lib/mlb-hr-bullpen-shadow.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeHrBullpenShadow,
  classifyBullpenAvailability,
  MAX_HR_BULLPEN_CONTRIBUTION,
} from "./mlb-hr-bullpen-shadow.mjs";

function bullpenEntry({
  hr9 = 1.18,
  dataQuality = "high",
  freshnessStatus = "fresh",
} = {}) {
  return {
    teamId: 1,
    teamAbbr: "BOS",
    season: { seasonBullpenEra: 3.5, seasonBullpenHr9: hr9, seasonBullpenKbb: 2.5, seasonBullpenWhip: 1.2, dataQuality },
    workload: { bullpenFatigueTier: "fresh" },
    freshnessStatus,
  };
}

const DEEP_STARTER = { inningsPitched: "48.0", gamesStarted: 8 }; // 6.0 IP/start
const OPENER = { inningsPitched: "12.0", gamesStarted: 8 }; // 1.5 IP/start, clamped to 3.0 (reliever bounds n/a since GS>0 -> starter bounds min 3.0)

describe("classifyBullpenAvailability", () => {
  it("missing bullpen is unavailable", () => {
    assert.equal(classifyBullpenAvailability(null).available, false);
    assert.equal(classifyBullpenAvailability(null).reason, "missing");
  });

  it("stale-fallback freshness is unavailable", () => {
    const result = classifyBullpenAvailability(bullpenEntry({ freshnessStatus: "stale-fallback" }));
    assert.equal(result.available, false);
    assert.equal(result.reason, "stale");
  });

  it("low/insufficient data quality is unavailable", () => {
    assert.equal(classifyBullpenAvailability(bullpenEntry({ dataQuality: "low" })).available, false);
    assert.equal(classifyBullpenAvailability(bullpenEntry({ dataQuality: "insufficient" })).available, false);
  });

  it("adequate/high data quality with fresh status is available", () => {
    assert.equal(classifyBullpenAvailability(bullpenEntry({ dataQuality: "adequate" })).available, true);
    assert.equal(classifyBullpenAvailability(bullpenEntry({ dataQuality: "high" })).available, true);
  });
});

describe("computeHrBullpenShadow: missing/low-quality data -> neutral no-op", () => {
  it("missing opposing bullpen produces a neutral/no-op result", () => {
    const result = computeHrBullpenShadow({ opposingBullpen: null, opposingStarter: DEEP_STARTER });
    assert.equal(result.available, false);
    assert.equal(result.bullpenHrShadowContribution, 0);
    assert.equal(result.bullpenVulnerabilityScore, null);
  });

  it("low-coverage opposing bullpen produces a neutral/no-op result", () => {
    const result = computeHrBullpenShadow({ opposingBullpen: bullpenEntry({ dataQuality: "insufficient" }), opposingStarter: DEEP_STARTER });
    assert.equal(result.available, false);
    assert.equal(result.reason, "low_coverage");
    assert.equal(result.bullpenHrShadowContribution, 0);
  });

  it("no arguments at all does not throw and produces a neutral/no-op result", () => {
    const result = computeHrBullpenShadow();
    assert.equal(result.available, false);
    assert.equal(result.bullpenHrShadowContribution, 0);
  });

  it("missing opposing starter still produces a valid (role-default) exposure estimate, not a throw", () => {
    const result = computeHrBullpenShadow({ opposingBullpen: bullpenEntry(), opposingStarter: null });
    assert.equal(result.starterProjectedIpSource, "fallback_missing_data");
    assert.ok(Number.isFinite(result.projectedBullpenInnings));
  });
});

describe("computeHrBullpenShadow: exposure scaling by starter projected innings", () => {
  it("a deep-starter matchup produces a smaller |contribution| than a short-outing/opener matchup for the same bullpen", () => {
    const vulnerableBullpen = bullpenEntry({ hr9: 2.2 }); // well above league-average 1.18
    const deepResult = computeHrBullpenShadow({ opposingBullpen: vulnerableBullpen, opposingStarter: DEEP_STARTER });
    const openerResult = computeHrBullpenShadow({ opposingBullpen: vulnerableBullpen, opposingStarter: OPENER });
    assert.ok(deepResult.exposureFraction < openerResult.exposureFraction);
    assert.ok(Math.abs(deepResult.bullpenHrShadowContribution) < Math.abs(openerResult.bullpenHrShadowContribution));
  });

  it("projectedBullpenInnings is bounded to [0, 9] and complements starterProjectedIp", () => {
    const result = computeHrBullpenShadow({ opposingBullpen: bullpenEntry(), opposingStarter: DEEP_STARTER });
    assert.ok(result.projectedBullpenInnings >= 0 && result.projectedBullpenInnings <= 9);
    assert.ok(Math.abs(result.projectedBullpenInnings - (9 - result.starterProjectedIp)) < 1e-9);
  });
});

describe("computeHrBullpenShadow: bounded, deterministic, and isolated from live scoring", () => {
  it("contribution is always within +/-MAX_HR_BULLPEN_CONTRIBUTION", () => {
    const cases = [
      { hr9: 0.1 }, // extremely low, low-vulnerability
      { hr9: 5.0 }, // extremely high, high-vulnerability
      { hr9: 1.18 }, // exactly league average
    ];
    for (const c of cases) {
      const result = computeHrBullpenShadow({ opposingBullpen: bullpenEntry(c), opposingStarter: OPENER });
      assert.ok(result.bullpenHrShadowContribution <= MAX_HR_BULLPEN_CONTRIBUTION + 1e-9);
      assert.ok(result.bullpenHrShadowContribution >= -MAX_HR_BULLPEN_CONTRIBUTION - 1e-9);
    }
  });

  it("a bullpen at exactly league-average HR/9 produces zero (or near-zero) contribution", () => {
    const result = computeHrBullpenShadow({ opposingBullpen: bullpenEntry({ hr9: 1.18 }), opposingStarter: OPENER });
    assert.ok(Math.abs(result.bullpenHrShadowContribution) < 0.5);
  });

  it("a worse (higher HR/9) bullpen produces a higher contribution than a better bullpen, same exposure", () => {
    const goodBullpen = computeHrBullpenShadow({ opposingBullpen: bullpenEntry({ hr9: 0.7 }), opposingStarter: OPENER });
    const badBullpen = computeHrBullpenShadow({ opposingBullpen: bullpenEntry({ hr9: 1.8 }), opposingStarter: OPENER });
    assert.ok(badBullpen.bullpenHrShadowContribution > goodBullpen.bullpenHrShadowContribution);
  });

  it("is deterministic: same input always produces the same output", () => {
    const input = { opposingBullpen: bullpenEntry(), opposingStarter: OPENER };
    assert.deepEqual(computeHrBullpenShadow(input), computeHrBullpenShadow(input));
  });

  it("exposes contribution, data quality, and projected bullpen innings", () => {
    const result = computeHrBullpenShadow({ opposingBullpen: bullpenEntry(), opposingStarter: OPENER });
    assert.ok("bullpenHrShadowContribution" in result);
    assert.ok("dataQuality" in result);
    assert.ok("projectedBullpenInnings" in result);
  });

  it("carries the live and shadow experiment version, never conflated, and no live HR field names", () => {
    const result = computeHrBullpenShadow({ opposingBullpen: bullpenEntry(), opposingStarter: OPENER });
    assert.equal(result.liveModelVersion, "mlb-hr-quality-v1.1");
    assert.equal(result.shadowExperimentVersion, "mlb-hr-bullpen-shadow-v1");
    assert.notEqual(result.liveModelVersion, result.shadowExperimentVersion);
    assert.equal(result.candidateHrQualityScore, undefined);
    assert.equal(result.hrQualityScore, undefined);
  });
});
