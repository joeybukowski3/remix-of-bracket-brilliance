/**
 * compute-opponent-k-ratio.test.mjs
 * Run via: node --test scripts/mlb-k/compute-opponent-k-ratio.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeOpponentKRatio, computeLeagueKRateVsHand } from "./compute-opponent-k-ratio.mjs";

function handSplitsMap(players) {
  return new Map(players.map((player) => [player.playerId, player]));
}

function batter(playerId, { vsLeftK = null, vsLeftPa = null, vsRightK = null, vsRightPa = null } = {}) {
  return {
    playerId,
    splits: {
      vsLeft: vsLeftPa != null ? { strikeouts: vsLeftK, plateAppearances: vsLeftPa } : undefined,
      vsRight: vsRightPa != null ? { strikeouts: vsRightK, plateAppearances: vsRightPa } : undefined,
    },
  };
}

describe("computeOpponentKRatio", () => {
  it("aggregates lineup K% vs RHP using batter performance vs RHP (splitSide correctness)", () => {
    const handSplits = handSplitsMap([
      batter(1, { vsRightK: 20, vsRightPa: 100 }),
      batter(2, { vsRightK: 10, vsRightPa: 50 }),
      batter(3, { vsLeftK: 999, vsLeftPa: 1 }), // vsLeft data must NOT leak into RHP calc
    ]);
    const result = computeOpponentKRatio({
      pitcherHand: "R",
      lineupBatters: [
        { playerId: 1, lineupStatus: "confirmed" },
        { playerId: 2, lineupStatus: "projected" },
        { playerId: 3, lineupStatus: "confirmed" },
      ],
      teamRosterPlayerIds: [],
      handSplitsByPlayerId: handSplits,
    });
    // 30 K / 150 PA = 0.20, batter 3 contributes nothing (no vsRight data)
    assert.equal(result.opponentKRateVsHand, 0.2);
    assert.equal(result.source, "LINEUP");
  });

  it("aggregates lineup K% vs LHP using batter performance vs LHP (splitSide correctness)", () => {
    const handSplits = handSplitsMap([
      batter(1, { vsLeftK: 15, vsLeftPa: 50 }),
      batter(2, { vsLeftK: 5, vsLeftPa: 50 }),
    ]);
    const result = computeOpponentKRatio({
      pitcherHand: "L",
      lineupBatters: [
        { playerId: 1, lineupStatus: "confirmed" },
        { playerId: 2, lineupStatus: "confirmed" },
      ],
      teamRosterPlayerIds: [],
      handSplitsByPlayerId: handSplits,
    });
    assert.equal(result.opponentKRateVsHand, 20 / 100);
    assert.equal(result.source, "LINEUP");
  });

  it("never inverts hand direction: RHP result differs from LHP result for the same batter set", () => {
    const handSplits = handSplitsMap([
      batter(1, { vsRightK: 40, vsRightPa: 100, vsLeftK: 5, vsLeftPa: 100 }),
    ]);
    const lineupBatters = [{ playerId: 1, lineupStatus: "confirmed" }];
    const rhpResult = computeOpponentKRatio({ pitcherHand: "R", lineupBatters, teamRosterPlayerIds: [], handSplitsByPlayerId: handSplits });
    const lhpResult = computeOpponentKRatio({ pitcherHand: "L", lineupBatters, teamRosterPlayerIds: [], handSplitsByPlayerId: handSplits });
    assert.equal(rhpResult.opponentKRateVsHand, 0.4);
    assert.equal(lhpResult.opponentKRateVsHand, 0.05);
    assert.notEqual(rhpResult.opponentKRateVsHand, lhpResult.opponentKRateVsHand);
  });

  it("weights aggregation by plate appearances, not a simple average of batter rates", () => {
    // Batter A: 1/2 = 50% K in tiny sample. Batter B: 10/100 = 10% K in a large sample.
    // A simple average of rates would be 30%; PA-weighted aggregation must be close to 10%.
    const handSplits = handSplitsMap([
      batter(1, { vsRightK: 1, vsRightPa: 2 }),
      batter(2, { vsRightK: 10, vsRightPa: 100 }),
    ]);
    const result = computeOpponentKRatio({
      pitcherHand: "R",
      lineupBatters: [
        { playerId: 1, lineupStatus: "confirmed" },
        { playerId: 2, lineupStatus: "confirmed" },
      ],
      teamRosterPlayerIds: [],
      handSplitsByPlayerId: handSplits,
    });
    const naiveAverage = (0.5 + 0.1) / 2;
    assert.equal(result.opponentKRateVsHand, 11 / 102);
    assert.notEqual(result.opponentKRateVsHand, naiveAverage);
  });

  it("falls back to team-season K% vs hand when no lineup batters have usable data", () => {
    const handSplits = handSplitsMap([
      batter(9, { vsRightK: 30, vsRightPa: 120 }),
    ]);
    const result = computeOpponentKRatio({
      pitcherHand: "R",
      lineupBatters: [{ playerId: 1, lineupStatus: "confirmed" }], // no split data for player 1
      teamRosterPlayerIds: [9],
      handSplitsByPlayerId: handSplits,
    });
    assert.equal(result.source, "TEAM_FALLBACK");
    assert.equal(result.opponentKRateVsHand, 30 / 120);
  });

  it("falls back to neutral OpponentKRatio=1.00 when lineup and team data are both unavailable", () => {
    const handSplits = handSplitsMap([]);
    const result = computeOpponentKRatio({
      pitcherHand: "R",
      lineupBatters: [{ playerId: 1, lineupStatus: "confirmed" }],
      teamRosterPlayerIds: [2],
      handSplitsByPlayerId: handSplits,
    });
    assert.equal(result.source, "NEUTRAL");
    assert.equal(result.opponentKRatio, 1);
    assert.equal(result.opponentKRateVsHand, null);
  });

  it("computeLeagueKRateVsHand aggregates numerator/denominator across all players for the given hand", () => {
    const handSplits = handSplitsMap([
      batter(1, { vsRightK: 20, vsRightPa: 100 }),
      batter(2, { vsRightK: 30, vsRightPa: 100 }),
    ]);
    assert.equal(computeLeagueKRateVsHand("R", handSplits), 50 / 200);
  });

  it("OpponentKRatio divides opponent vs-hand rate by league vs-hand rate at the same grain", () => {
    const handSplits = handSplitsMap([
      batter(1, { vsRightK: 30, vsRightPa: 100 }), // lineup: 30%
      batter(2, { vsRightK: 20, vsRightPa: 100 }), // contributes to league only
    ]);
    const result = computeOpponentKRatio({
      pitcherHand: "R",
      lineupBatters: [{ playerId: 1, lineupStatus: "confirmed" }],
      teamRosterPlayerIds: [],
      handSplitsByPlayerId: handSplits,
    });
    // league = (30+20)/(100+100) = 0.25; opponent = 0.30
    assert.equal(result.leagueKRateVsHand, 0.25);
    assert.equal(result.opponentKRatio, 0.3 / 0.25);
  });
});
