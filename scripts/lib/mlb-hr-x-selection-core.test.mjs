/**
 * mlb-hr-x-selection-core.test.mjs
 * Run via: node --test scripts/lib/mlb-hr-x-selection-core.test.mjs
 *
 * Previously no dedicated test file existed for this module at all.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfirmedGameIdentity, selectConfirmedHrProps } from "./mlb-hr-x-selection-core.mjs";
import { resolvePostingReadiness } from "./mlb-x-readiness.mjs";

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

    it("does NOT count team names as distinct games when gameId is missing (fixes the two-teams-one-game bug)", () => {
      // Both teams of the SAME matchup, no gameId -- must NOT resolve to 2 "games".
      const { confirmedGameCount, confirmedRowsWithoutGameIdentity } = selectConfirmedHrProps({
        batters: [batter({ player: "A", team: "BOS", gameId: null }), batter({ player: "B", team: "BOS", gameId: null }), batter({ player: "C", team: "TB", gameId: null })],
      });
      assert.equal(confirmedGameCount, 0);
      assert.equal(confirmedRowsWithoutGameIdentity, 3);
    });

    it("rows missing gameId increment confirmedRowsWithoutGameIdentity without inflating confirmedGameCount", () => {
      const { confirmedCount, confirmedGameCount, confirmedRowsWithoutGameIdentity } = selectConfirmedHrProps({
        batters: [
          batter({ player: "HasGame", gameId: 1 }),
          batter({ player: "NoGame1", gameId: null }),
          batter({ player: "NoGame2", gameId: undefined }),
        ],
      });
      assert.equal(confirmedCount, 3);
      assert.equal(confirmedGameCount, 1);
      assert.equal(confirmedRowsWithoutGameIdentity, 2);
    });

    it("keeps doubleheader legs distinct via distinct gameId even with identical teams/opponent", () => {
      const { confirmedGameCount } = selectConfirmedHrProps({
        batters: [
          batter({ player: "Leg1Batter", team: "BOS", opponent: "NYY", gameId: 900001 }),
          batter({ player: "Leg2Batter", team: "BOS", opponent: "NYY", gameId: 900002 }),
        ],
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

  describe("getConfirmedGameIdentity", () => {
    it("returns a canonical identity string for a valid numeric gameId", () => {
      assert.equal(getConfirmedGameIdentity(batter({ gameId: 42 })), "game:42");
    });

    it("returns null (never a fabricated identity) when gameId is missing, null, or non-numeric", () => {
      assert.equal(getConfirmedGameIdentity(batter({ gameId: null })), null);
      assert.equal(getConfirmedGameIdentity(batter({ gameId: undefined })), null);
      assert.equal(getConfirmedGameIdentity(batter({ gameId: "not-a-number" })), null);
    });

    it("never falls back to team, opponent, pitcher, or player identity", () => {
      const row = batter({ gameId: null, team: "BOS", opponent: "NYY", player: "Someone" });
      assert.equal(getConfirmedGameIdentity(row), null);
    });
  });

  describe("end-to-end diversity gate (selection-core + readiness combined)", () => {
    function lineupOf(team, opponent, gameId, count = 9) {
      return Array.from({ length: count }, (_, index) =>
        batter({ player: `${team}-${index + 1}`, team, opponent, gameId, battingOrder: index + 1, hrScore: 50 - index }),
      );
    }

    function polling(overrides = {}) {
      return {
        hasGames: true,
        allGamesStarted: false,
        phase: "POLLING",
        isExpired: false,
        isFinalCutoff: false,
        minutesUntilFirstPitch: 60,
        ...overrides,
      };
    }

    it("a single matchup with both full lineups confirmed still cannot pass minConfirmedGames: 2", () => {
      const batters = [...lineupOf("BOS", "TB", 1), ...lineupOf("TB", "BOS", 1)];
      const selection = selectConfirmedHrProps({ batters, maxTableSize: 5 });
      assert.equal(selection.confirmedGameCount, 1);
      const readiness = resolvePostingReadiness({
        timing: polling(),
        confirmedCount: selection.confirmedCount,
        targetCount: 5,
        maxTableSize: 5,
        confirmedGameCount: selection.confirmedGameCount,
        minConfirmedGames: 2,
      });
      assert.equal(readiness.ready, false);
    });

    it("two genuine matchups (distinct gameIds) can pass minConfirmedGames: 2", () => {
      const batters = [...lineupOf("BOS", "TB", 1, 3), ...lineupOf("NYY", "HOU", 2, 3)];
      const selection = selectConfirmedHrProps({ batters, maxTableSize: 5 });
      assert.equal(selection.confirmedGameCount, 2);
      const readiness = resolvePostingReadiness({
        timing: polling(),
        confirmedCount: selection.confirmedCount,
        targetCount: 5,
        maxTableSize: 5,
        confirmedGameCount: selection.confirmedGameCount,
        minConfirmedGames: 2,
      });
      assert.equal(readiness.ready, true);
    });

    it("early readiness fails closed when every confirmed row lacks reliable game identity", () => {
      const batters = ["A", "B", "C", "D", "E"].map((player) => batter({ player, gameId: null }));
      const selection = selectConfirmedHrProps({ batters, maxTableSize: 5 });
      assert.equal(selection.confirmedGameCount, 0);
      assert.equal(selection.confirmedRowsWithoutGameIdentity, 5);
      const readiness = resolvePostingReadiness({
        timing: polling(),
        confirmedCount: selection.confirmedCount,
        targetCount: 5,
        maxTableSize: 5,
        confirmedGameCount: selection.confirmedGameCount,
        minConfirmedGames: 2,
        confirmedRowsWithoutGameIdentity: selection.confirmedRowsWithoutGameIdentity,
      });
      assert.equal(readiness.ready, false);
      assert.equal(readiness.confirmedRowsWithoutGameIdentity, 5);
    });

    it("final-cutoff behavior is unchanged: still posts from a single confirmed game rather than miss the window", () => {
      const batters = lineupOf("BOS", "TB", 1, 5);
      const selection = selectConfirmedHrProps({ batters, maxTableSize: 5 });
      const readiness = resolvePostingReadiness({
        timing: polling({ isFinalCutoff: true }),
        confirmedCount: selection.confirmedCount,
        targetCount: 5,
        maxTableSize: 5,
        confirmedGameCount: selection.confirmedGameCount,
        minConfirmedGames: 2,
      });
      assert.equal(readiness.ready, true);
      assert.equal(readiness.selectedCount, 5);
    });
  });
});

/**
 * 2026-07-21 regression: live boxscore promotion.
 *
 * Built on real production data (see __fixtures__/mlb-x-hr-lineup-2026-07-21.json).
 * The generated artifact stamped all 270 batter rows "projected" -- it was built
 * at 12:59 ET and never re-run -- while the live poll snapshot at 15:48 ET
 * already carried confirmed 9-deep orders for 6 of 15 games. HR published
 * nothing all day because a PROJECTED row exited before liveConfirm was ever
 * consulted, pinning confirmedGameCount at 0.
 */
describe("selectConfirmedHrProps live promotion (2026-07-21 regression)", () => {
  const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "mlb-x-hr-lineup-2026-07-21.json");
  const FIXTURE = JSON.parse(readFileSync(fixturePath, "utf8"));

  /** Live confirmation expressed exactly as the poll snapshot stores it. */
  function liveConfirmFromSnapshot(row) {
    const game = FIXTURE.games.find((g) => g.gamePk === row.gameId);
    if (!game) return null;
    const side = game.homeAbbr === row.team ? game.homeLineup : game.awayAbbr === row.team ? game.awayLineup : null;
    if (!side) return null;
    if (!side.confirmed) return null; // no opinion -- explicitly not a veto
    return side.batters.some((b) => b.id === row.playerId);
  }

  it("the real generated artifact carried zero confirmed rows", () => {
    assert.deepEqual([...new Set(FIXTURE.batters.map((b) => b.lineupStatus))], ["projected"]);
  });

  it("without live promotion the whole slate is unpostable -- the actual bug", () => {
    const result = selectConfirmedHrProps({ batters: FIXTURE.batters, liveConfirm: () => null });
    assert.equal(result.confirmedCount, 0);
    assert.equal(result.confirmedGameCount, 0, "matches the confirmedGameCount=0 the plan reported all day");
    assert.equal(result.projectedExcludedCount, FIXTURE.batters.length);
  });

  it("live boxscore promotion recovers the confirmed CLE side", () => {
    const result = selectConfirmedHrProps({ batters: FIXTURE.batters, liveConfirm: liveConfirmFromSnapshot });
    assert.ok(result.confirmedCount > 0, "at least one hitter is recoverable from live data");
    assert.equal(result.confirmedGameCount, 1, "only MIN@CLE had a confirmed side in the snapshot");
    assert.equal(result.promotedFromLiveCount, result.confirmedCount);
    assert.ok(result.selected.every((r) => r.team === "CLE"));
  });

  it("does not promote a side the live snapshot has not confirmed", () => {
    const result = selectConfirmedHrProps({ batters: FIXTURE.batters, liveConfirm: liveConfirmFromSnapshot });
    assert.ok(result.selected.every((r) => r.team !== "MIN" && r.team !== "DET"));
  });

  it("stays fail-closed: only an explicit true promotes", () => {
    for (const live of [null, undefined, false, 0, "", "true"]) {
      const result = selectConfirmedHrProps({ batters: FIXTURE.batters, liveConfirm: () => live });
      assert.equal(result.confirmedCount, 0, `live=${JSON.stringify(live)} must not confirm anything`);
      assert.equal(result.promotedFromLiveCount, 0);
    }
  });

  it("still lets a live veto override a generated confirmed stamp", () => {
    const confirmedRow = { ...FIXTURE.batters[0], lineupStatus: "confirmed", battingOrder: 3 };
    assert.equal(selectConfirmedHrProps({ batters: [confirmedRow], liveConfirm: () => null }).confirmedCount, 1);
    const vetoed = selectConfirmedHrProps({ batters: [confirmedRow], liveConfirm: () => false });
    assert.equal(vetoed.confirmedCount, 0);
    assert.equal(vetoed.unconfirmedExcludedCount, 1);
  });

  it("never promotes a scratched hitter", () => {
    const result = selectConfirmedHrProps({ batters: [{ ...FIXTURE.batters[0], lineupStatus: "out" }], liveConfirm: () => true });
    assert.equal(result.confirmedCount, 0);
    assert.equal(result.promotedFromLiveCount, 0);
  });
});
