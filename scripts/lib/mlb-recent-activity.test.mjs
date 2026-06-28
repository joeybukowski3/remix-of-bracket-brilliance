import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateRecentActivityFromBoxscores,
  buildRecentActivityResults,
  dedupeCandidatesByKey,
  filterCollectionByRecentActivity,
  getRecentActivityWindow,
  summarizeGameActivity,
} from "./mlb-recent-activity.mjs";

const checkedAt = "2026-06-28T12:00:00.000Z";
function game(gamePk, officialDate, overrides = {}) { return { gamePk, officialDate, gameType: "R", status: { codedGameState: "F", detailedState: "Final", abstractGameState: "Final" }, ...overrides }; }
function box(players) { return { teams: { away: { players }, home: { players: {} } } }; }
function player(id, plateAppearances, atBats) { return { person: { id }, stats: { batting: { plateAppearances, atBats } } }; }
function resultFor(candidates, games, boxscores, options = {}) {
  const aggregate = aggregateRecentActivityFromBoxscores(games, boxscores, { slateDate: "2026-06-28", checkedAt, lookbackDays: 10 });
  return buildRecentActivityResults(candidates, aggregate, { checkedAt, lookbackDays: 10, ...options }).resultsByKey;
}

test("lookback covers enough calendar days to collect five prior games", () => {
  assert.deepEqual(getRecentActivityWindow("2026-06-28", 10), { startDate: "2026-06-18", endDate: "2026-06-27", lookbackDays: 10 });
});

test("default mode qualifies at least three at-bats across previous two games", () => {
  const results = resultFor([{ key: "a|NYY", playerId: 1 }], [game(101, "2026-06-27"), game(100, "2026-06-26")], new Map([
    ["101", box({ ID1: player(1, 3, 2) })],
    ["100", box({ ID1: player(1, 2, 1) })],
  ]));
  const result = results.get("a|NYY");
  assert.equal(result.active, true);
  assert.equal(result.atBatsPrevious2, 3);
  assert.equal(result.qualifiesDefault, true);
  assert.equal(result.qualifiesBroad, true);
});

test("broad mode keeps one at-bat across previous five games", () => {
  const games = [27, 26, 25, 24, 23].map((day, index) => game(200 + index, `2026-06-${day}`));
  const boxscores = new Map(games.map((item, index) => [String(item.gamePk), box({ ID2: player(2, index === 4 ? 1 : 0, index === 4 ? 1 : 0) })]));
  const result = resultFor([{ key: "b|NYY", playerId: 2 }], games, boxscores).get("b|NYY");
  assert.equal(result.active, true);
  assert.equal(result.atBatsPrevious2, 0);
  assert.equal(result.atBatsPrevious5, 1);
  assert.equal(result.qualifiesDefault, false);
  assert.equal(result.qualifiesBroad, true);
});

test("player with no at-bats in previous five games is excluded", () => {
  const results = resultFor([{ key: "c|NYY", playerId: 3 }], [game(301, "2026-06-27")], new Map([["301", box({ ID3: player(3, 1, 0) })]]));
  const result = results.get("c|NYY");
  assert.equal(result.active, false);
  assert.equal(result.reason, "no_at_bat_previous_five_games");
});

test("game log is sorted newest first and limited to previous five", () => {
  const activity = { gameLog: [
    { date: "2026-06-24", gamePk: "1", atBats: 1 },
    { date: "2026-06-27", gamePk: "2", atBats: 2 },
    { date: "2026-06-26", gamePk: "3", atBats: 1 },
  ] };
  const summary = summarizeGameActivity(activity);
  assert.equal(summary.atBatsPrevious2, 3);
});

test("postponed and non-regular-season games are ignored", () => {
  const results = resultFor([{ key: "d|NYY", playerId: 4 }], [
    game(401, "2026-06-27", { status: { detailedState: "Postponed" } }),
    game(402, "2026-06-26", { gameType: "S" }),
  ], new Map([
    ["401", box({ ID4: player(4, 4, 4) })],
    ["402", box({ ID4: player(4, 4, 4) })],
  ]));
  assert.equal(results.get("d|NYY").active, false);
});

test("API failure and unresolved IDs remain safely excluded", () => {
  const failed = resultFor([{ key: "e|NYY", playerId: 5 }], [], new Map(), { anyLookupFailed: true });
  const unresolved = resultFor([{ key: "f|NYY", playerId: null }], [], new Map());
  assert.equal(failed.get("e|NYY").reason, "activity_lookup_failed");
  assert.equal(unresolved.get("f|NYY").reason, "unresolved_player_id");
});

test("duplicate candidates and output rows are deduped", () => {
  const candidates = dedupeCandidatesByKey([{ key: "g|NYY", playerId: 7 }, { key: "g|NYY", playerId: 7 }]);
  const results = resultFor(candidates, [game(501, "2026-06-27")], new Map([["501", box({ ID7: player(7, 4, 4) })]]));
  const output = filterCollectionByRecentActivity([{ playerName: "G", team: "NYY" }, { playerName: "G", team: "NYY" }], { keyForPlayer: () => "g|NYY", resultsByKey: results });
  assert.equal(candidates.length, 1);
  assert.equal(output.length, 1);
});
