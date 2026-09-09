import assert from "node:assert/strict";
import test from "node:test";
import { touchdownContextEvent, validateTouchdownPbpHeader, TOUCHDOWN_PBP_COLUMNS } from "./nfl-touchdown-context-core.mjs";

const play = (overrides = {}) => ({
  game_id: "2025_01_AAA_BBB", play_id: "10", drive: "1", season: "2025", season_type: "REG", week: "1",
  posteam: "AAA", defteam: "BBB", yardline_100: "20", rush: "1", pass: "0", no_play: "0", two_point_attempt: "0",
  qb_kneel: "0", qb_spike: "0", rusher_player_id: "00-1", rusher_player_name: "Runner", receiver_player_id: "",
  receiver_player_name: "", rush_touchdown: "0", pass_touchdown: "0", ...overrides,
});

test("validates required upstream touchdown schema and fails closed", () => {
  assert.doesNotThrow(() => validateTouchdownPbpHeader([...TOUCHDOWN_PBP_COLUMNS]));
  assert.throws(() => validateTouchdownPbpHeader(TOUCHDOWN_PBP_COLUMNS.filter((column) => column !== "yardline_100")), /yardline_100/);
});

test("uses inclusive 20, 10, and 5 yard boundaries", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(touchdownContextEvent(play({ yardline_100: "20" }))).filter(([key]) => key.endsWith("opportunity"))), { rz_opportunity: 1, inside_10_opportunity: 0, goal_line_opportunity: 0 });
  assert.deepEqual(Object.fromEntries(Object.entries(touchdownContextEvent(play({ yardline_100: "10" }))).filter(([key]) => key.endsWith("opportunity"))), { rz_opportunity: 1, inside_10_opportunity: 1, goal_line_opportunity: 0 });
  assert.deepEqual(Object.fromEntries(Object.entries(touchdownContextEvent(play({ yardline_100: "5" }))).filter(([key]) => key.endsWith("opportunity"))), { rz_opportunity: 1, inside_10_opportunity: 1, goal_line_opportunity: 1 });
});

test("includes rushing and receiving scorer TDs without crediting the passer", () => {
  assert.equal(touchdownContextEvent(play({ rush_touchdown: "1" })).touchdown, 1);
  const receiving = touchdownContextEvent(play({ rush: "0", pass: "1", rusher_player_id: "", receiver_player_id: "00-2", receiver_player_name: "Receiver", pass_touchdown: "1" }));
  assert.equal(receiving.player_id, "00-2");
  assert.equal(receiving.touchdown, 1);
});

test("excludes passing-only, special-teams-equivalent, two-point, kneel, spike, and no-play rows", () => {
  assert.equal(touchdownContextEvent(play({ rush: "0", pass: "1", rusher_player_id: "" })), null);
  assert.equal(touchdownContextEvent(play({ posteam: "", defteam: "", rush: "0", pass: "0", rusher_player_id: "" })), null);
  assert.equal(touchdownContextEvent(play({ two_point_attempt: "1" })), null);
  assert.equal(touchdownContextEvent(play({ qb_kneel: "1" })), null);
  assert.equal(touchdownContextEvent(play({ qb_spike: "1" })), null);
  assert.equal(touchdownContextEvent(play({ no_play: "1" })), null);
});

test("preserves a missing yardline as unavailable instead of a zero opportunity", () => {
  const event = touchdownContextEvent(play({ yardline_100: "" }));
  assert.equal(event.yardline_100, "");
  assert.equal(event.rz_opportunity, "");
  assert.equal(event.inside_10_opportunity, "");
  assert.equal(event.goal_line_opportunity, "");
});
