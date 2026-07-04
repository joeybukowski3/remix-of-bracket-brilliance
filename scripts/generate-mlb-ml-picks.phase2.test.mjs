/**
 * generate-mlb-ml-picks.phase2.test.mjs
 * Run via: node --test scripts/generate-mlb-ml-picks.phase2.test.mjs
 *
 * Tests the exported buildMlPhase2Shadow() wiring helper in isolation
 * (dependency injection via plain objects) -- deliberately does not run
 * the full main() live slate, per the Phase 2 generator-wiring scope
 * ("avoid running a full live slate for unit tests").
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMlPhase2Shadow } from "./generate-mlb-ml-picks.mjs";
import { computeModelEdgeCore } from "./lib/mlb-ml-edge-core.mjs";

// Same fixture shape as mlb-ml-edge-core.test.mjs's FIXTURE_DETAIL, extended
// with gamesStarted (the Phase 2 addition already present in mlb-ml-detail-fetch.mjs).
const DETAIL = {
  starters: {
    away: { era: 3.2, strikeOuts: 150, inningsPitched: "140.0", homeRuns: 15, battersFaced: 580, baseOnBalls: 40, gamesStarted: 24 },
    home: { era: 4.1, strikeOuts: 120, inningsPitched: "130.0", homeRuns: 20, battersFaced: 560, baseOnBalls: 45, gamesStarted: 23 },
  },
  opponentSplits: {
    awayBattingVsHomeStarter: { ops: 0.75, strikeOuts: 20, plateAppearances: 90 },
    homeBattingVsAwayStarter: { ops: 0.7, strikeOuts: 25, plateAppearances: 88 },
  },
  lineupSummaries: {
    away: { ops: 0.74, slg: 0.42, obp: 0.32, kPct: 22 },
    home: { ops: 0.71, slg: 0.4, obp: 0.31, kPct: 24 },
  },
  awayContext: { lastFiveRecord: "3-2", awayRecord: "20-15", homeRecord: "18-17" },
  homeContext: { lastFiveRecord: "2-3", awayRecord: "17-18", homeRecord: "22-13" },
  game: {
    away: { abbreviation: "NYY", record: "45-30" },
    home: { abbreviation: "BOS", record: "40-35" },
  },
};

const GAME = { away: { id: 147, abbreviation: "NYY" }, home: { id: 111, abbreviation: "BOS" }, venue: "Fenway Park" };

function bullpenEntry() {
  return {
    teamId: 1,
    teamAbbr: "X",
    season: { seasonBullpenEra: 3.5, seasonBullpenHr9: 1.18, seasonBullpenKbb: 2.5, seasonBullpenWhip: 1.2, dataQuality: "high" },
    workload: { bullpenFatigueTier: "fresh" },
    freshnessStatus: "fresh",
  };
}
const BULLPEN_CACHE = { teams: { 147: bullpenEntry(), 111: bullpenEntry() } };

describe("buildMlPhase2Shadow: flags off -> exact legacy shape", () => {
  it("returns undefined (not null, not an empty object) when no relevant flag is enabled", () => {
    const result = buildMlPhase2Shadow({ detail: DETAIL, game: GAME, bullpenCache: BULLPEN_CACHE, flags: {} });
    assert.equal(result, undefined);
  });

  it("returns undefined when only an unrelated flag is enabled", () => {
    const result = buildMlPhase2Shadow({ detail: DETAIL, game: GAME, bullpenCache: BULLPEN_CACHE, flags: { ENABLE_PHASE2_SHADOW_COMPARISON: true } });
    assert.equal(result, undefined);
  });
});

describe("buildMlPhase2Shadow: individual component flags", () => {
  it("projected-IP only", () => {
    const result = buildMlPhase2Shadow({ detail: DETAIL, game: GAME, bullpenCache: BULLPEN_CACHE, flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true } });
    assert.ok(result.projectedIpShadow);
    assert.equal(result.parkShadow, null);
    assert.equal(result.enabledComponents.bullpen, false); // bullpen requires projectedIp AND its own flag
  });

  it("park only", () => {
    const result = buildMlPhase2Shadow({ detail: DETAIL, game: GAME, bullpenCache: BULLPEN_CACHE, flags: { ENABLE_ML_PARK_SHADOW: true } });
    assert.equal(result.projectedIpShadow, null);
    assert.ok(result.parkShadow);
  });

  it("bullpen only (requires projected-IP to have a weight set to attach to)", () => {
    const result = buildMlPhase2Shadow({
      detail: DETAIL,
      game: GAME,
      bullpenCache: BULLPEN_CACHE,
      flags: { ENABLE_ML_BULLPEN_SHADOW: true, ENABLE_ML_PROJECTED_IP_SHADOW: true },
    });
    assert.equal(result.enabledComponents.bullpen, true);
    assert.equal(result.projectedIpShadow.awayBullpenShadow.available, true);
  });

  it("all ML shadow flags on together", () => {
    const result = buildMlPhase2Shadow({
      detail: DETAIL,
      game: GAME,
      bullpenCache: BULLPEN_CACHE,
      flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true, ENABLE_ML_PARK_SHADOW: true, ENABLE_ML_BULLPEN_SHADOW: true },
    });
    assert.equal(result.enabledComponents.projectedIp, true);
    assert.equal(result.enabledComponents.park, true);
    assert.equal(result.enabledComponents.bullpen, true);
    assert.ok(result.projectedIpShadow);
    assert.ok(result.parkShadow);
  });
});

describe("buildMlPhase2Shadow: missing/malformed inputs fail neutral, never throw for data reasons", () => {
  it("missing venue falls back to missing_venue reason inside park shadow, does not throw", () => {
    const gameNoVenue = { away: GAME.away, home: GAME.home, venue: undefined };
    const result = buildMlPhase2Shadow({ detail: DETAIL, game: gameNoVenue, bullpenCache: BULLPEN_CACHE, flags: { ENABLE_ML_PARK_SHADOW: true } });
    assert.ok(result.parkShadow);
    assert.equal(result.parkShadow.parkDataQuality, "missing_venue");
  });

  it("missing bullpen cache (empty {teams:{}}) falls back to bullpen-unavailable, does not throw", () => {
    const result = buildMlPhase2Shadow({
      detail: DETAIL,
      game: GAME,
      bullpenCache: { teams: {} },
      flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true, ENABLE_ML_BULLPEN_SHADOW: true },
    });
    assert.equal(result.projectedIpShadow.awayBullpenShadow.available, false);
    assert.equal(result.projectedIpShadow.homeBullpenShadow.available, false);
  });

  it("malformed bullpen cache (wrong shape entirely) falls back safely via optional chaining, does not throw", () => {
    const result = buildMlPhase2Shadow({
      detail: DETAIL,
      game: GAME,
      bullpenCache: { notTeams: "garbage" },
      flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true, ENABLE_ML_BULLPEN_SHADOW: true },
    });
    assert.equal(result.projectedIpShadow.awayBullpenShadow.available, false);
  });

  it("throws for a genuinely malformed detail object (missing starters) -- caller is responsible for catching this", () => {
    assert.throws(() => buildMlPhase2Shadow({ detail: {}, game: GAME, bullpenCache: BULLPEN_CACHE, flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true } }));
  });
});

describe("buildMlPhase2Shadow: a shadow exception does not block live generation (isolation pattern)", () => {
  it("the exact isolation pattern used in main() converts a throw into undefined without propagating", () => {
    let phase2Shadow;
    let caughtWarning = null;
    try {
      phase2Shadow = buildMlPhase2Shadow({ detail: {}, game: GAME, bullpenCache: BULLPEN_CACHE, flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true } });
    } catch (shadowErr) {
      caughtWarning = shadowErr instanceof Error ? shadowErr.message : String(shadowErr);
      phase2Shadow = undefined;
    }
    assert.equal(phase2Shadow, undefined);
    assert.ok(caughtWarning); // the error was actually caught, not swallowed silently before this point
  });
});

describe("buildMlPhase2Shadow: live pick/differential/tier unchanged with flags on", () => {
  it("computeModelEdgeCore's own output is identical whether or not the shadow helper is also called", () => {
    const before = computeModelEdgeCore(DETAIL);
    buildMlPhase2Shadow({
      detail: DETAIL,
      game: GAME,
      bullpenCache: BULLPEN_CACHE,
      flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true, ENABLE_ML_PARK_SHADOW: true, ENABLE_ML_BULLPEN_SHADOW: true },
    });
    const after = computeModelEdgeCore(DETAIL);
    assert.deepEqual(before, after);
  });

  it("the shadow result's own `live` block matches computeModelEdgeCore exactly", () => {
    const live = computeModelEdgeCore(DETAIL);
    const result = buildMlPhase2Shadow({ detail: DETAIL, game: GAME, bullpenCache: BULLPEN_CACHE, flags: { ENABLE_ML_PROJECTED_IP_SHADOW: true } });
    assert.equal(result.live.pick, live.pick);
    assert.equal(result.live.differential, live.differential);
    assert.equal(result.live.confidence, live.confidence);
  });
});
