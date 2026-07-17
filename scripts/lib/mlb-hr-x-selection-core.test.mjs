/**
 * mlb-hr-x-selection-core.test.mjs
 * Run via: node --test scripts/lib/mlb-hr-x-selection-core.test.mjs
 *
 * Previously no dedicated test file existed for this module at all.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectConfirmedHrProps } from "./mlb-hr-x-selection-core.mjs";

function batter(overrides = {}) {
  return {
    player: "Test Batter",
    team: "BOS",
    gameId: 1,
    hrScore: 50,
    hrScoreRank: 1,
    lineupStatus: "confirmed",
    battingOrder: 1,
    ...overrides,
  };
}

describe("selectConfirmedHrProps", () => {
  it("excludes projected rows entirely, even a very high-scoring one", () => {
    const { selected, confirmedCount, projectedExcludedCount } = selectConfirmedHrProps({
      batters: [
        batter({ player: "Projected Star", hrScore: 99, lineupStatus: "projected", battingOrder: null }),
        batter({ player: "Confirmed", hrScore: 40 }),
      ],
    });
    assert.deepEqual(selected.map((r) => r.player), ["Confirmed"]);
    assert.equal(confirmedCount, 1);
    assert.equal(projectedExcludedCount, 1);
  });

  it("excludes unconfirmed/out rows and a confirmed row missing a valid batting-order slot", () => {
    const { selected, unconfirmedExcludedCount } = selectConfirmedHrProps({
      batters: [
        batter({ player: "Out", lineupStatus: "out" }),
        batter({ player: "Unknown status", lineupStatus: "unknown" }),
        batter({ player: "Confirmed no order", lineupStatus: "confirmed", battingOrder: null }),
        batter({ player: "Confirmed order 10", lineupStatus: "confirmed", battingOrder: 10 }),
        batter({ player: "Really confirmed", lineupStatus: "confirmed", battingOrder: 3 }),
      ],
    });
    assert.deepEqual(selected.map((r) => r.player), ["Really confirmed"]);
    assert.equal(unconfirmedExcludedCount, 4);
  });

  it("excludes rows whose game has started", () => {
    const { selected, startedExcludedCount } = selectConfirmedHrProps({
      batters: [batter({ player: "Started", hrScore: 90 }), batter({ player: "Not started", hrScore: 10 })],
      isGameStarted: (row) => row.player === "Started",
    });
    assert.deepEqual(selected.map((r) => r.player), ["Not started"]);
    assert.equal(startedExcludedCount, 1);
  });

  it("a live liveConfirm=false veto excludes an otherwise-confirmed row (fail-closed)", () => {
    const { selected, unconfirmedExcludedCount } = selectConfirmedHrProps({
      batters: [batter({ player: "Vetoed", hrScore: 90 }), batter({ player: "Kept", hrScore: 10 })],
      liveConfirm: (row) => (row.player === "Vetoed" ? false : null),
    });
    assert.deepEqual(selected.map((r) => r.player), ["Kept"]);
    assert.equal(unconfirmedExcludedCount, 1);
  });

  it("a live liveConfirm of null or true never excludes a generated-confirmed row", () => {
    const { selected } = selectConfirmedHrProps({
      batters: [batter({ player: "Deferred", hrScore: 50 }), batter({ player: "Reaffirmed", hrScore: 40 })],
      liveConfirm: (row) => (row.player === "Deferred" ? null : true),
    });
    assert.deepEqual(
      selected.map((r) => r.player).sort(),
      ["Deferred", "Reaffirmed"],
    );
  });

  it("rebuilds the ranking from every confirmed hitter, sorted by hrScore descending, backfilling past excluded rows", () => {
    // A(proj) B(conf) C(proj) D(conf) E(conf) -> table becomes B, D, E, not just B.
    const { selected } = selectConfirmedHrProps({
      batters: [
        batter({ player: "A", hrScore: 99, lineupStatus: "projected", battingOrder: null }),
        batter({ player: "B", hrScore: 90 }),
        batter({ player: "C", hrScore: 85, lineupStatus: "projected", battingOrder: null }),
        batter({ player: "D", hrScore: 80 }),
        batter({ player: "E", hrScore: 70 }),
      ],
      maxTableSize: 3,
    });
    assert.deepEqual(selected.map((r) => r.player), ["B", "D", "E"]);
  });

  it("breaks score ties by ascending hrScoreRank, deterministically", () => {
    const { selected } = selectConfirmedHrProps({
      batters: [
        batter({ player: "Rank5", hrScore: 60, hrScoreRank: 5 }),
        batter({ player: "Rank2", hrScore: 60, hrScoreRank: 2 }),
        batter({ player: "Rank9", hrScore: 60, hrScoreRank: 9 }),
      ],
    });
    assert.deepEqual(selected.map((r) => r.player), ["Rank2", "Rank5", "Rank9"]);
  });

  it("never mutates the input batters array", () => {
    const batters = [batter({ player: "One" }), batter({ player: "Two", hrScore: 10 })];
    const before = structuredClone(batters);
    selectConfirmedHrProps({ batters });
    assert.deepEqual(batters, before);
  });

  it("defaults maxTableSize to 3 and confirmedCount reflects the full pool, not the sliced table", () => {
    const batters = [1, 2, 3, 4, 5].map((n) => batter({ player: `P${n}`, hrScore: n }));
    const { selected, confirmedCount } = selectConfirmedHrProps({ batters });
    assert.equal(selected.length, 3);
    assert.equal(confirmedCount, 5);
  });

  describe("confirmedGameCount (game-diversity signal for the readiness gate)", () => {
    it("counts one distinct game when every confirmed batter shares the same gameId", () => {
      const { confirmedGameCount } = selectConfirmedHrProps({
        batters: [batter({ player: "Bos1", team: "BOS", gameId: 824766 }), batter({ player: "Bos2", team: "BOS", gameId: 824766 }), batter({ player: "TB1", team: "TB", gameId: 824766 })],
      });
      assert.equal(confirmedGameCount, 1);
    });

    it("counts each distinct gameId separately across multiple confirmed games", () => {
      const { confirmedGameCount } = selectConfirmedHrProps({
        batters: [batter({ player: "A", gameId: 1 }), batter({ player: "B", gameId: 2 }), batter({ player: "C", gameId: 3 })],
      });
      assert.equal(confirmedGameCount, 3);
    });

    it("only counts games represented in the CONFIRMED pool, not excluded projected/unconfirmed/started rows", () => {
      const { confirmedGameCount } = selectConfirmedHrProps({
        batters: [
          batter({ player: "Confirmed", gameId: 1 }),
          batter({ player: "Projected", gameId: 2, lineupStatus: "projected", battingOrder: null }),
          batter({ player: "StartedGame", gameId: 3, hrScore: 99 }),
        ],
        isGameStarted: (row) => row.player === "StartedGame",
      });
      assert.equal(confirmedGameCount, 1);
    });

    it("falls back to team as the game proxy when gameId is missing", () => {
      const { confirmedGameCount } = selectConfirmedHrProps({
        batters: [batter({ player: "A", team: "BOS", gameId: null }), batter({ player: "B", team: "BOS", gameId: null }), batter({ player: "C", team: "TB", gameId: null })],
      });
      assert.equal(confirmedGameCount, 2);
    });

    it("is 0 when nothing is confirmed", () => {
      const { confirmedGameCount, confirmedCount } = selectConfirmedHrProps({
        batters: [batter({ lineupStatus: "projected", battingOrder: null })],
      });
      assert.equal(confirmedCount, 0);
      assert.equal(confirmedGameCount, 0);
    });

    it("reflects the full confirmed pool's diversity even when maxTableSize slices the selection down to fewer games", () => {
      // Three confirmed games, but the top-2-by-score table only includes players from 2 of them --
      // confirmedGameCount must still report 3 (the true diversity of the eligible pool the readiness
      // gate should evaluate), not the 2 games actually present in `selected`.
      const { selected, confirmedGameCount } = selectConfirmedHrProps({
        batters: [
          batter({ player: "G1a", gameId: 1, hrScore: 90 }),
          batter({ player: "G1b", gameId: 1, hrScore: 80 }),
          batter({ player: "G2", gameId: 2, hrScore: 20 }),
          batter({ player: "G3", gameId: 3, hrScore: 10 }),
        ],
        maxTableSize: 2,
      });
      assert.deepEqual(selected.map((r) => r.player), ["G1a", "G1b"]);
      assert.equal(confirmedGameCount, 3);
    });
  });
});
