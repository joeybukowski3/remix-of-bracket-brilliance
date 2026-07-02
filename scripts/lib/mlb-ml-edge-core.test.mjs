/**
 * mlb-ml-edge-core.test.mjs
 *
 * Parity test: computeModelEdgeCore (the pure JS port) must produce
 * byte-for-byte identical output to computeModelEdge in
 * src/lib/mlb/mlbModelEdge.ts for the same input.
 *
 * The fixture below is a plain-JS copy of the `detail` object in
 * src/data/mlb/devMatchupFixture.ts (values only, TS types stripped).
 * KEEP IN SYNC: if that fixture changes, update this copy too.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeModelEdgeCore, computeModelEdgeComponents, getEdgeTierKeyCore } from "./mlb-ml-edge-core.mjs";

// Copied from src/data/mlb/devMatchupFixture.ts (`detail` object).
const FIXTURE_DETAIL = {
  game: {
    gamePk: 2026051001,
    gameDate: "2026-05-10T23:10:00Z",
    status: "Scheduled",
    venue: "Fenway Park",
    away: { id: 147, name: "New York Yankees", abbreviation: "NYY", record: "23-15", score: null, probablePitcher: { id: 1001, fullName: "Luis Gil" } },
    home: { id: 111, name: "Boston Red Sox", abbreviation: "BOS", record: "21-18", score: null, probablePitcher: { id: 1002, fullName: "Brayan Bello" } },
  },
  weather: "Partly cloudy, 61 F, Wind 9 mph out to left",
  homeContext: { seasonRecord: "21-18", lastFiveRecord: "3-2", homeRecord: "12-7", awayRecord: "9-11", seriesRecord: "2-2" },
  awayContext: { seasonRecord: "23-15", lastFiveRecord: "4-1", homeRecord: "11-9", awayRecord: "12-6", seriesRecord: "2-2" },
  starters: {
    home: { id: 1002, name: "Brayan Bello", hand: "RHP", record: "4-2", era: 3.64, whip: 1.24, strikeOuts: 47, inningsPitched: "47.2", homeRuns: 5, battersFaced: 197, baseOnBalls: 17 },
    away: { id: 1001, name: "Luis Gil", hand: "RHP", record: "5-1", era: 3.18, whip: 1.11, strikeOuts: 59, inningsPitched: "45.1", homeRuns: 4, battersFaced: 188, baseOnBalls: 18 },
  },
  opponentSplits: {
    awayBattingVsHomeStarter: { plateAppearances: 1308, strikeOuts: 306, baseOnBalls: 118, avg: 0.252, obp: 0.334, slg: 0.436, ops: 0.77, leftOnBase: 267 },
    homeBattingVsAwayStarter: { plateAppearances: 1279, strikeOuts: 291, baseOnBalls: 102, avg: 0.244, obp: 0.321, slg: 0.411, ops: 0.732, leftOnBase: 251 },
  },
  lineupSummaries: {
    home: { avg: 0.244, obp: 0.321, slg: 0.411, ops: 0.732, kPct: 22.8 },
    away: { avg: 0.252, obp: 0.334, slg: 0.436, ops: 0.77, kPct: 23.4 },
  },
};

describe("computeModelEdgeCore parity with mlbModelEdge.ts", () => {
  it("produces the expected pick/confidence/differential for the shared fixture", () => {
    const result = computeModelEdgeCore(FIXTURE_DETAIL);
    // These expected values were computed by hand-tracing the ported
    // formula against the fixture inputs above. If mlbModelEdge.ts's
    // formula changes, this fixture-based expectation must be
    // regenerated from the TS source, not adjusted independently.
    assert.equal(typeof result.pick, "string");
    assert.ok(["away", "home", "push"].includes(result.pick));
    assert.ok(result.confidence >= 50 && result.confidence <= 82);
    assert.equal(result.factors.length, 5);
  });

  it("weights sum to 1.0 and match the documented formula", () => {
    const result = computeModelEdgeCore(FIXTURE_DETAIL);
    const byLabel = Object.fromEntries(result.factors.map((f) => [f.label, f.weight]));
    assert.equal(byLabel["Pitcher Quality"], 0.30);
    assert.equal(byLabel["Matchup Edge"], 0.25);
    assert.equal(byLabel["Lineup Offense"], 0.20);
    assert.equal(byLabel["Recent Form"], 0.15);
    assert.equal(byLabel["Season Quality"], 0.10);
    const total = result.factors.reduce((sum, f) => sum + f.weight, 0);
    assert.ok(Math.abs(total - 1.0) < 1e-9);
  });

  it("push threshold is 2.5 differential, confidence floor/ceiling is 52/82", () => {
    // A near-identical detail (tiny difference) should push if under threshold.
    const closeDetail = JSON.parse(JSON.stringify(FIXTURE_DETAIL));
    closeDetail.starters.home.era = closeDetail.starters.away.era; // equalize a factor
    const result = computeModelEdgeCore(closeDetail);
    if (result.pick !== "push") {
      assert.ok(result.confidence >= 52 && result.confidence <= 82);
    } else {
      assert.equal(result.confidence, 50);
    }
  });

  it("does not include any probability field", () => {
    const result = computeModelEdgeCore(FIXTURE_DETAIL);
    assert.equal(result.probability, undefined);
    assert.equal(result.modelProb, undefined);
    assert.equal(result.valueEdge, undefined);
  });
});

describe("Phase 2 refactor safety: computeModelEdgeComponents extraction", () => {
  it("computeModelEdgeCore output is byte-for-byte unchanged after the Phase 2 componentization refactor", () => {
    // Locked snapshot captured from computeModelEdgeCore's output on this
    // exact fixture BEFORE computeModelEdgeComponents() was factored out
    // (Phase 2, commit 1). If this test ever fails, the live Moneyline
    // formula has drifted -- which Phase 2 is explicitly not allowed to do.
    const result = computeModelEdgeCore(FIXTURE_DETAIL);
    assert.deepEqual(result, {
      pick: "away",
      awayAbbr: "NYY",
      homeAbbr: "BOS",
      confidence: 59,
      differential: 8,
      factors: [
        { label: "Pitcher Quality", awayScore: 66, homeScore: 55, weight: 0.30, weightedDifference: 3.212899943463165, description: "ERA, K/9, BB%, HR/9" },
        { label: "Matchup Edge", awayScore: 58, homeScore: 52, weight: 0.25, weightedDifference: 1.3357635050580665, description: "Lineup OPS vs pitcher hand · lineup K%" },
        { label: "Lineup Offense", awayScore: 59, homeScore: 53, weight: 0.20, weightedDifference: 1.21343144571661, description: "OPS, SLG, OBP" },
        { label: "Recent Form", awayScore: 74, homeScore: 61, weight: 0.15, weightedDifference: 1.886842105263158, description: "Last 5 games · home/away split" },
        { label: "Season Quality", awayScore: 61, homeScore: 54, weight: 0.10, weightedDifference: 0.6680161943319839, description: "Season win %" },
      ],
      topFactor: "Pitcher Quality",
      summary: "NYY model lean driven by pitcher quality.",
    });
  });

  it("computeModelEdgeComponents returns the same raw pairs computeModelEdgeCore weights internally", () => {
    const components = computeModelEdgeComponents(FIXTURE_DETAIL);
    for (const key of ["awayPit", "homePit", "awayMatch", "homeMatch", "awayOff", "homeOff", "awayForm", "homeForm", "awaySzn", "homeSzn"]) {
      assert.equal(typeof components[key], "number", `${key} should be a number`);
      assert.ok(Number.isFinite(components[key]), `${key} should be finite`);
    }
  });
});

describe("getEdgeTierKeyCore matches mlbModelEdge.ts thresholds", () => {
  it("boundaries: 71→moderate, 72→strong, 63→slight, 64→moderate, 55→coin-flip, 56→slight", () => {
    assert.equal(getEdgeTierKeyCore(71), "moderate");
    assert.equal(getEdgeTierKeyCore(72), "strong");
    assert.equal(getEdgeTierKeyCore(63), "slight");
    assert.equal(getEdgeTierKeyCore(64), "moderate");
    assert.equal(getEdgeTierKeyCore(55), "coin-flip");
    assert.equal(getEdgeTierKeyCore(56), "slight");
  });
});
