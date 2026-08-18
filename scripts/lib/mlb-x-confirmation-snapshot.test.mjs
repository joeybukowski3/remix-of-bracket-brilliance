/**
 * mlb-x-confirmation-snapshot.test.mjs
 * Run via: node --test scripts/lib/mlb-x-confirmation-snapshot.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildConfirmationSnapshot,
  findGameById,
  findGameForTeam,
  resolveHrRowFacts,
  resolveKRowFacts,
} from "./mlb-x-confirmation-snapshot.mjs";

function jsonResponse(value) {
  return { ok: true, status: 200, json: async () => value };
}

function doubleheaderSchedule() {
  return {
    dates: [
      {
        games: [
          {
            gamePk: 201,
            gameDate: "2026-08-18T17:05:00Z",
            gameNumber: 1,
            doubleHeader: "Y",
            status: { abstractGameState: "Preview", detailedState: "Scheduled" },
            teams: {
              away: { team: { abbreviation: "NYY" }, probablePitcher: { id: 11, fullName: "Away Starter G1" } },
              home: { team: { abbreviation: "BOS" }, probablePitcher: { id: 22, fullName: "Home Starter G1" } },
            },
          },
          {
            gamePk: 202,
            gameDate: "2026-08-18T21:05:00Z",
            gameNumber: 2,
            doubleHeader: "Y",
            status: { abstractGameState: "Preview", detailedState: "Scheduled" },
            teams: {
              away: { team: { abbreviation: "NYY" }, probablePitcher: { id: 33, fullName: "Away Starter G2" } },
              home: { team: { abbreviation: "BOS" }, probablePitcher: { id: 44, fullName: "Home Starter G2" } },
            },
          },
        ],
      },
    ],
  };
}

function boxscoreConfirming(playerIds) {
  const team = {
    battingOrder: playerIds,
    players: Object.fromEntries(playerIds.map((id) => [`ID${id}`, { person: { fullName: `Player ${id}` } }])),
  };
  return { teams: { away: team, home: team } };
}

async function fetchDoubleheaderSnapshot({ boxscoreByGamePk = {} } = {}) {
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes("/schedule?")) return jsonResponse(doubleheaderSchedule());
    const match = u.match(/\/game\/(\d+)\/boxscore/);
    if (match) {
      const gamePk = Number(match[1]);
      return jsonResponse(boxscoreByGamePk[gamePk] ?? boxscoreConfirming([]));
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  return buildConfirmationSnapshot({ date: "2026-08-18", now: new Date("2026-08-18T15:00:00Z"), fetchImpl });
}

describe("buildConfirmationSnapshot doubleheader handling", () => {
  it("preserves both legs of a doubleheader as distinct snapshot games", async () => {
    const snapshot = await fetchDoubleheaderSnapshot();
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.games.length, 2);

    const [g1, g2] = snapshot.games;
    assert.equal(g1.gamePk, 201);
    assert.equal(g1.gameDate, "2026-08-18T17:05:00Z");
    assert.equal(g1.gameNumber, 1);
    assert.equal(g1.doubleHeader, "Y");
    assert.equal(g1.isDoubleheader, true);

    assert.equal(g2.gamePk, 202);
    assert.equal(g2.gameDate, "2026-08-18T21:05:00Z");
    assert.equal(g2.gameNumber, 2);
    assert.equal(g2.doubleHeader, "Y");
    assert.equal(g2.isDoubleheader, true);

    assert.notEqual(g1.gamePk, g2.gamePk);
  });

  it("does not let one leg's boxscore/lineup overwrite the other's", async () => {
    const snapshot = await fetchDoubleheaderSnapshot({
      boxscoreByGamePk: {
        201: boxscoreConfirming(Array.from({ length: 9 }, (_, i) => i + 1)),
        202: boxscoreConfirming([]),
      },
    });
    const [g1, g2] = snapshot.games;
    assert.equal(g1.awayLineup.confirmed, true);
    assert.equal(g2.awayLineup.confirmed, false);
  });
});

describe("findGameForTeam ambiguity handling", () => {
  const snapshot = {
    games: [
      { gamePk: 201, awayAbbr: "NYY", homeAbbr: "BOS", started: false },
      { gamePk: 202, awayAbbr: "NYY", homeAbbr: "BOS", started: false },
    ],
  };

  it("returns null (fails closed) when team alone matches more than one game", () => {
    assert.equal(findGameForTeam(snapshot, "NYY"), null);
  });

  it("still fails closed with team+opponent when both legs share the same matchup", () => {
    assert.equal(findGameForTeam(snapshot, "NYY", { opponentAbbr: "BOS" }), null);
  });

  it("resolves unambiguously when only one game matches team+opponent", () => {
    const single = { games: [{ gamePk: 500, awayAbbr: "TEX", homeAbbr: "HOU", started: false }] };
    const located = findGameForTeam(single, "TEX", { opponentAbbr: "HOU" });
    assert.equal(located.game.gamePk, 500);
    assert.equal(located.side, "away");
  });
});

describe("findGameById", () => {
  const snapshot = {
    games: [
      { gamePk: 201, awayAbbr: "NYY", homeAbbr: "BOS" },
      { gamePk: 202, awayAbbr: "NYY", homeAbbr: "BOS" },
    ],
  };

  it("resolves the exact leg by gamePk even when team alone is ambiguous", () => {
    const located = findGameById(snapshot, 202, "NYY");
    assert.equal(located.game.gamePk, 202);
    assert.equal(located.side, "away");
  });

  it("returns null for an unknown gamePk", () => {
    assert.equal(findGameById(snapshot, 999, "NYY"), null);
  });
});

function doubleheaderSnapshotFixture() {
  const lineupFor = (ids) => ({
    confirmed: ids.length >= 9,
    batters: ids.map((id, index) => ({ id, name: `Player ${id}`, battingOrder: index + 1 })),
  });
  return {
    games: [
      {
        gamePk: 201,
        gameDate: "2026-08-18T17:05:00Z",
        gameNumber: 1,
        isDoubleheader: true,
        started: false,
        excluded: false,
        awayAbbr: "NYY",
        homeAbbr: "BOS",
        awayStarter: { id: 11, name: "Away Starter G1" },
        homeStarter: { id: 22, name: "Home Starter G1" },
        awayLineup: lineupFor(Array.from({ length: 9 }, (_, i) => 100 + i)),
        homeLineup: lineupFor([]),
      },
      {
        gamePk: 202,
        gameDate: "2026-08-18T21:05:00Z",
        gameNumber: 2,
        isDoubleheader: true,
        started: false,
        excluded: false,
        awayAbbr: "NYY",
        homeAbbr: "BOS",
        awayStarter: { id: 33, name: "Away Starter G2" },
        homeStarter: { id: 44, name: "Home Starter G2" },
        awayLineup: lineupFor(Array.from({ length: 9 }, (_, i) => 200 + i)),
        homeLineup: lineupFor([]),
      },
    ],
  };
}

describe("resolveHrRowFacts doubleheader resolution", () => {
  it("resolves game 1 context for a row carrying game 1's gameId", () => {
    const snapshot = doubleheaderSnapshotFixture();
    const facts = resolveHrRowFacts(snapshot, { team: "NYY", opponent: "BOS", gameId: 201, playerId: 100 });
    assert.equal(facts.gamePk, 201);
    assert.equal(facts.gameNumber, 1);
    assert.equal(facts.isDoubleheader, true);
    assert.equal(facts.liveConfirmed, true);
  });

  it("resolves game 2 context for a row carrying game 2's gameId", () => {
    const snapshot = doubleheaderSnapshotFixture();
    const facts = resolveHrRowFacts(snapshot, { team: "NYY", opponent: "BOS", gameId: 202, playerId: 200 });
    assert.equal(facts.gamePk, 202);
    assert.equal(facts.gameNumber, 2);
    assert.equal(facts.isDoubleheader, true);
    assert.equal(facts.liveConfirmed, true);
  });

  it("does not attach game 2's confirmation to a game 1 row (no cross-leg leakage)", () => {
    const snapshot = doubleheaderSnapshotFixture();
    // playerId 200 is only in game 2's confirmed lineup; a game-1-scoped row must not see it.
    const facts = resolveHrRowFacts(snapshot, { team: "NYY", opponent: "BOS", gameId: 201, playerId: 200 });
    assert.equal(facts.gamePk, 201);
    assert.equal(facts.liveConfirmed, false);
  });

  it("fails closed (no game context, liveConfirmed null) when the row has no gameId and team+opponent is ambiguous", () => {
    const snapshot = doubleheaderSnapshotFixture();
    const facts = resolveHrRowFacts(snapshot, { team: "NYY", opponent: "BOS", gameId: null, playerId: 100 });
    assert.equal(facts.gamePk, null);
    assert.equal(facts.liveConfirmed, null);
    assert.equal(facts.gameStarted, false);
  });
});

describe("resolveKRowFacts doubleheader resolution", () => {
  it("resolves game 1's starter/context for a game-1-scoped row", () => {
    const snapshot = doubleheaderSnapshotFixture();
    const facts = resolveKRowFacts(snapshot, { team: "NYY", opponent: "BOS", pitcher: "Away Starter G1", gameId: 201 });
    assert.equal(facts.gamePk, 201);
    assert.equal(facts.gameNumber, 1);
    assert.equal(facts.isCurrentStarter, true);
  });

  it("resolves game 2's starter/context for a game-2-scoped row", () => {
    const snapshot = doubleheaderSnapshotFixture();
    const facts = resolveKRowFacts(snapshot, { team: "NYY", opponent: "BOS", pitcher: "Away Starter G2", gameId: 202 });
    assert.equal(facts.gamePk, 202);
    assert.equal(facts.gameNumber, 2);
    assert.equal(facts.isCurrentStarter, true);
  });

  it("does not match a game-1 starter name against a game-1-scoped row that is really game 2's pitcher (no cross-leg leakage)", () => {
    const snapshot = doubleheaderSnapshotFixture();
    const facts = resolveKRowFacts(snapshot, { team: "NYY", opponent: "BOS", pitcher: "Away Starter G2", gameId: 201 });
    assert.equal(facts.gamePk, 201);
    assert.equal(facts.isCurrentStarter, false);
  });

  it("fails closed with no gameId and an ambiguous team+opponent pair", () => {
    const snapshot = doubleheaderSnapshotFixture();
    const facts = resolveKRowFacts(snapshot, { team: "NYY", opponent: "BOS", pitcher: "Away Starter G1", gameId: null });
    assert.equal(facts.gamePk, null);
    assert.equal(facts.isCurrentStarter, false);
    assert.equal(facts.gameStarted, false);
    assert.equal(facts.opposingLineupConfirmed, false);
  });
});
