/**
 * mlb-ml-phase2-shadow.test.mjs
 * Run via: node --test scripts/lib/mlb-ml-phase2-shadow.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeModelEdgeCore } from "./mlb-ml-edge-core.mjs";
import { computeMlPhase2Shadow } from "./mlb-ml-phase2-shadow.mjs";

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
    starters: {
      away: { era: 3.18, strikeOuts: 59, inningsPitched: "48.0", homeRuns: 4, battersFaced: 188, baseOnBalls: 18, gamesStarted: 8 },
      home: { era: 3.64, strikeOuts: 47, inningsPitched: "48.0", homeRuns: 5, battersFaced: 197, baseOnBalls: 17, gamesStarted: 8 },
    },
  };
}

describe("computeMlPhase2Shadow: flags off", () => {
  it("with both flags off, no shadow components run and the combined result mirrors live", () => {
    const detail = baseDetail();
    const result = computeMlPhase2Shadow(detail, { venue: "Coors Field", flags: {} });
    assert.equal(result.enabledComponents.projectedIp, false);
    assert.equal(result.enabledComponents.park, false);
    assert.equal(result.projectedIpShadow, null);
    assert.equal(result.parkShadow, null);
    assert.equal(result.combinedShadowPick, result.live.pick);
    assert.equal(result.combinedShadowDifferential, result.live.differential);
    assert.equal(result.pickFlipped, false);
  });

  it("live output is never mutated by calling this function", () => {
    const detail = baseDetail();
    const before = computeModelEdgeCore(detail);
    computeMlPhase2Shadow(detail, { venue: "Coors Field", flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true, ENABLE_ML_PARK_SHADOW: true } });
    const after = computeModelEdgeCore(detail);
    assert.deepEqual(before, after);
  });
});

describe("computeMlPhase2Shadow: projected-IP only", () => {
  it("runs only the projected-IP component when only that flag is true", () => {
    const detail = baseDetail();
    detail.starters.home.inningsPitched = "12.0"; // opener
    const result = computeMlPhase2Shadow(detail, { flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true } });
    assert.equal(result.enabledComponents.projectedIp, true);
    assert.equal(result.enabledComponents.park, false);
    assert.notEqual(result.projectedIpShadow, null);
    assert.equal(result.parkShadow, null);
    assert.equal(result.combinedShadowPick, result.projectedIpShadow.projectedIpShadowPick);
    assert.equal(result.combinedShadowDifferential, result.projectedIpShadow.projectedIpShadowDifferential);
  });
});

describe("computeMlPhase2Shadow: park only", () => {
  it("chains park shadow directly off the LIVE result when projected-IP is disabled", () => {
    const detail = baseDetail();
    const result = computeMlPhase2Shadow(detail, { venue: "Coors Field", flags: { ENABLE_ML_PARK_SHADOW: true } });
    assert.equal(result.enabledComponents.projectedIp, false);
    assert.equal(result.enabledComponents.park, true);
    assert.equal(result.parkShadow.baseDifferential, result.live.differential);
    assert.equal(result.parkShadow.basePick, result.live.pick);
    assert.equal(result.combinedShadowPick, result.parkShadow.parkShadowPick);
  });

  it("missing venue falls back to neutral (no material change) when chained off live", () => {
    const detail = baseDetail();
    const result = computeMlPhase2Shadow(detail, { flags: { ENABLE_ML_PARK_SHADOW: true } }); // no venue passed
    assert.equal(result.parkShadow.parkDataQuality, "missing_venue");
    assert.equal(result.combinedShadowDifferential, result.live.differential);
    assert.equal(result.combinedShadowPick, result.live.pick);
  });
});

describe("computeMlPhase2Shadow: both components chained", () => {
  it("chains park shadow off the PROJECTED-IP result (not live) when both are enabled", () => {
    const detail = baseDetail();
    detail.starters.home.inningsPitched = "12.0"; // opener, changes home's weighting
    const result = computeMlPhase2Shadow(detail, {
      venue: "Coors Field",
      flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true, ENABLE_ML_PARK_SHADOW: true },
    });
    assert.equal(result.parkShadow.baseDifferential, result.projectedIpShadow.projectedIpShadowDifferential);
    assert.equal(result.parkShadow.basePick, result.projectedIpShadow.projectedIpShadowPick);
    assert.equal(result.combinedShadowPick, result.parkShadow.parkShadowPick);
    assert.equal(result.combinedShadowDifferential, result.parkShadow.parkShadowDifferential);
  });

  it("park still cannot flip the side relative to its own base, even chained after projected-IP", () => {
    const detail = baseDetail();
    const result = computeMlPhase2Shadow(detail, {
      venue: "Coors Field", // most extreme park in the table
      flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true, ENABLE_ML_PARK_SHADOW: true },
    });
    const ipPick = result.projectedIpShadow.projectedIpShadowPick;
    if (ipPick !== "push") {
      const oppositeSide = ipPick === "away" ? "home" : "away";
      assert.notEqual(result.combinedShadowPick, oppositeSide);
    }
  });
});

describe("computeMlPhase2Shadow: identification and structure", () => {
  it("carries version identifiers and a deterministic shape with no timestamps", () => {
    const detail = baseDetail();
    const result = computeMlPhase2Shadow(detail, { flags: {} });
    assert.equal(result.liveModelVersion, "mlb-ml-edge-v1.0");
    assert.equal(result.shadowExperimentVersion, "mlb-ml-phase2-shadow-v1");
    assert.equal("generatedAt" in result, false);
  });

  it("is deterministic: same input always produces the same output", () => {
    const detail = baseDetail();
    const flags = { ENABLE_ML_PROJECTED_IP_SHADOW: true, ENABLE_ML_PARK_SHADOW: true };
    const r1 = computeMlPhase2Shadow(detail, { venue: "Fenway Park", flags });
    const r2 = computeMlPhase2Shadow(detail, { venue: "Fenway Park", flags });
    assert.deepEqual(r1, r2);
  });
});
