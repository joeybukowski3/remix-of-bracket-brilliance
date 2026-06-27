import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateRecentActivityFromBoxscores,
  buildRecentActivityResults,
  dedupeCandidatesByKey,
  filterCollectionByRecentActivity,
  getRecentActivityWindow,
} from "./mlb-recent-activity.mjs";

const checkedAt = "2026-06-27T12:00:00.000Z";

function game(gamePk, officialDate, overrides = {}) {
  return {
    gamePk,
    officialDate,
    gameType: "R",
    status: { codedGameState: "F", detailedState: "Final", abstractGameState: "Final" },
    ...overrides,
  };
}

function box(players) {
  return {
    teams: {
      away: { players },
      home: { players: {} },
    },
  };
}

function player(id, plateAppearances, atBats) {
  return {
    person: { id },
    stats: { batting: { plateAppearances, atBats } },
  };
}

function resultFor(candidates, games, boxscores, options = {}) {
  const aggregate = aggregateRecentActivityFromBoxscores(games, boxscores, {
    slateDate: "2026-06-27",
    checkedAt,
    lookbackDays: 4,
  });
  return buildRecentActivityResults(candidates, aggregate, {
    checkedAt,
    lookbackDays: 4,
    ...options,
  }).resultsByKey;
}

test("lookback uses the four calendar days before the slate date", () => {
  assert.deepEqual(getRecentActivityWindow("2026-06-27", 4), {
    startDate: "2026-06-23",
    endDate: "2026-06-26",
    lookbackDays: 4,
  });
});

test("4 PA yesterday is included", () => {
  const results = resultFor(
    [{ key: "a|NYY", playerId: 1 }],
    [game(101, "2026-06-26")],
    new Map([["101", box({ ID1: player(1, 4, 3) })]]),
  );
  assert.equal(results.get("a|NYY").active, true);
  assert.equal(results.get("a|NYY").plateAppearances, 4);
});

test("1 PA three days ago is included", () => {
  const results = resultFor(
    [{ key: "b|NYY", playerId: 2 }],
    [game(102, "2026-06-24")],
    new Map([["102", box({ ID2: player(2, 1, 0) })]]),
  );
  assert.equal(results.get("b|NYY").active, true);
});

test("0 AB but 1 PA is included", () => {
  const results = resultFor(
    [{ key: "c|NYY", playerId: 3 }],
    [game(103, "2026-06-25")],
    new Map([["103", box({ ID3: player(3, 1, 0) })]]),
  );
  assert.equal(results.get("c|NYY").active, true);
});

test("0 PA and 0 AB throughout lookback is excluded", () => {
  const results = resultFor(
    [{ key: "d|NYY", playerId: 4 }],
    [game(104, "2026-06-25")],
    new Map([["104", box({ ID4: player(4, 0, 0) })]]),
  );
  assert.equal(results.get("d|NYY").active, false);
  assert.equal(results.get("d|NYY").reason, "no_recent_plate_appearance");
});

test("last appearance five days ago is excluded", () => {
  const results = resultFor(
    [{ key: "e|NYY", playerId: 5 }],
    [game(105, "2026-06-22")],
    new Map([["105", box({ ID5: player(5, 4, 4) })]]),
  );
  assert.equal(results.get("e|NYY").active, false);
});

test("team off yesterday with appearance two days ago is included", () => {
  const results = resultFor(
    [{ key: "f|NYY", playerId: 6 }],
    [game(106, "2026-06-25")],
    new Map([["106", box({ ID6: player(6, 3, 3) })]]),
  );
  assert.equal(results.get("f|NYY").active, true);
  assert.equal(results.get("f|NYY").latestGameDate, "2026-06-25");
});

test("postponed game is ignored", () => {
  const results = resultFor(
    [{ key: "g|NYY", playerId: 7 }],
    [game(107, "2026-06-26", { status: { detailedState: "Postponed" } })],
    new Map([["107", box({ ID7: player(7, 4, 4) })]]),
  );
  assert.equal(results.get("g|NYY").active, false);
});

test("scheduled and in-progress games are ignored", () => {
  const results = resultFor(
    [{ key: "h|NYY", playerId: 8 }],
    [
      game(108, "2026-06-26", { status: { detailedState: "Scheduled", abstractGameState: "Preview" } }),
      game(109, "2026-06-26", { status: { detailedState: "In Progress", abstractGameState: "Live" } }),
    ],
    new Map([
      ["108", box({ ID8: player(8, 4, 4) })],
      ["109", box({ ID8: player(8, 4, 4) })],
    ]),
  );
  assert.equal(results.get("h|NYY").active, false);
});

test("API failure excludes unresolved active state with error reason", () => {
  const results = resultFor(
    [{ key: "i|NYY", playerId: 9 }],
    [],
    new Map(),
    { anyLookupFailed: true },
  );
  assert.equal(results.get("i|NYY").active, false);
  assert.equal(results.get("i|NYY").reason, "activity_lookup_failed");
});

test("duplicate player records are deduped before lookup and emit one output record", () => {
  const candidates = dedupeCandidatesByKey([
    { key: "j|NYY", playerId: 10 },
    { key: "j|NYY", playerId: 10 },
  ]);
  const results = resultFor(
    candidates,
    [game(110, "2026-06-26")],
    new Map([["110", box({ ID10: player(10, 4, 4) })]]),
  );
  const output = filterCollectionByRecentActivity(
    [{ playerName: "J", team: "NYY" }, { playerName: "J", team: "NYY" }],
    {
      keyForPlayer: () => "j|NYY",
      resultsByKey: results,
    },
  );
  assert.equal(candidates.length, 1);
  assert.equal(output.length, 1);
});

test("inactive player in exact and root arrays is removed from both", () => {
  const results = resultFor(
    [{ key: "k|NYY", playerId: 11 }],
    [game(111, "2026-06-26")],
    new Map([["111", box({ ID11: player(11, 0, 0) })]]),
  );
  const options = { keyForPlayer: () => "k|NYY", resultsByKey: results };
  assert.equal(filterCollectionByRecentActivity([{ playerName: "K", team: "NYY" }], options).length, 0);
  assert.equal(filterCollectionByRecentActivity([{ playerName: "K", team: "NYY" }], options).length, 0);
});

test("unresolved player ID is excluded", () => {
  const results = resultFor([{ key: "l|NYY", playerId: null }], [], new Map());
  assert.equal(results.get("l|NYY").active, false);
  assert.equal(results.get("l|NYY").reason, "unresolved_player_id");
});

test("non-regular-season game is ignored", () => {
  const results = resultFor(
    [{ key: "m|NYY", playerId: 12 }],
    [game(112, "2026-06-26", { gameType: "S" })],
    new Map([["112", box({ ID12: player(12, 4, 4) })]]),
  );
  assert.equal(results.get("m|NYY").active, false);
});

test("today's incomplete game is not counted", () => {
  const results = resultFor(
    [{ key: "n|NYY", playerId: 13 }],
    [game(113, "2026-06-27", { status: { detailedState: "In Progress", abstractGameState: "Live" } })],
    new Map([["113", box({ ID13: player(13, 4, 4) })]]),
  );
  assert.equal(results.get("n|NYY").active, false);
});
