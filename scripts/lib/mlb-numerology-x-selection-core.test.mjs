/**
 * mlb-numerology-x-selection-core.test.mjs
 * Run via: node --test scripts/lib/mlb-numerology-x-selection-core.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NUMEROLOGY_QUALIFYING_SCORE_THRESHOLD, selectConfirmedNumerologyPlays } from "./mlb-numerology-x-selection-core.mjs";

function play(overrides = {}) {
  return { player: "Test Player", team: "NYY", numerologyScore: 70, ...overrides };
}

describe("selectConfirmedNumerologyPlays", () => {
  it("excludes a play with no live confirmation signal (projected/probable/unknown)", () => {
    const result = selectConfirmedNumerologyPlays({
      plays: [play()],
      liveConfirm: () => null,
    });
    assert.equal(result.selected.length, 0);
    assert.equal(result.unconfirmedExcludedCount, 1);
  });

  it("excludes a play explicitly not found in the live confirmed order (scratched/bench)", () => {
    const result = selectConfirmedNumerologyPlays({
      plays: [play()],
      liveConfirm: () => false,
    });
    assert.equal(result.selected.length, 0);
    assert.equal(result.unconfirmedExcludedCount, 1);
  });

  it("includes only a play with an explicit live-confirmed true", () => {
    const result = selectConfirmedNumerologyPlays({
      plays: [play({ player: "Confirmed Player" })],
      liveConfirm: () => true,
    });
    assert.deepEqual(result.selected.map((p) => p.player), ["Confirmed Player"]);
    assert.equal(result.confirmedCount, 1);
  });

  it("excludes a play whose game has already started, even if live-confirmed", () => {
    const result = selectConfirmedNumerologyPlays({
      plays: [play()],
      liveConfirm: () => true,
      isGameStarted: () => true,
    });
    assert.equal(result.selected.length, 0);
    assert.equal(result.startedExcludedCount, 1);
  });

  it(`excludes a play at or below the qualifying threshold (default ${NUMEROLOGY_QUALIFYING_SCORE_THRESHOLD})`, () => {
    const result = selectConfirmedNumerologyPlays({
      plays: [play({ numerologyScore: NUMEROLOGY_QUALIFYING_SCORE_THRESHOLD })],
      liveConfirm: () => true,
    });
    assert.equal(result.selected.length, 0);
    assert.equal(result.belowThresholdExcludedCount, 1);
  });

  it("preserves the input model ranking order -- never re-sorts", () => {
    const plays = [
      play({ player: "Second Highest", numerologyScore: 80 }),
      play({ player: "Highest", numerologyScore: 90 }),
      play({ player: "Third Highest", numerologyScore: 70 }),
    ];
    const result = selectConfirmedNumerologyPlays({ plays, liveConfirm: () => true });
    // Input order is [Second, Highest, Third] -- output must stay in that
    // exact order even though it is not numerologyScore-descending, proving
    // selection never re-sorts (that would silently change the model's rank).
    assert.deepEqual(result.selected.map((p) => p.player), ["Second Highest", "Highest", "Third Highest"]);
  });

  it("caps at maxTableSize (default 5), keeping the first N in rank order", () => {
    const plays = Array.from({ length: 8 }, (_, i) => play({ player: `Player ${i + 1}`, numerologyScore: 90 - i }));
    const result = selectConfirmedNumerologyPlays({ plays, liveConfirm: () => true });
    assert.equal(result.selected.length, 5);
    assert.deepEqual(result.selected.map((p) => p.player), ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5"]);
    assert.equal(result.confirmedCount, 8);
  });

  it("returns an empty selection with zero counts for an empty input", () => {
    const result = selectConfirmedNumerologyPlays({ plays: [] });
    assert.deepEqual(result.selected, []);
    assert.equal(result.confirmedCount, 0);
    assert.equal(result.belowThresholdExcludedCount, 0);
    assert.equal(result.unconfirmedExcludedCount, 0);
    assert.equal(result.startedExcludedCount, 0);
  });
});
