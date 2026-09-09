import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { extractTouchdownContextFromGzip, touchdownContextEvent, validateTouchdownPbpHeader, TOUCHDOWN_PBP_COLUMNS } from "./nfl-touchdown-context-core.mjs";

const play = (overrides = {}) => ({
  game_id: "2025_01_AAA_BBB", play_id: "10", drive: "1", season: "2025", season_type: "REG", week: "1",
  posteam: "AAA", defteam: "BBB", yardline_100: "20", rush: "1", pass: "0", play_type: "run", two_point_attempt: "0",
  qb_kneel: "0", qb_spike: "0", rusher_player_id: "00-1", rusher_player_name: "Runner", receiver_player_id: "",
  receiver_player_name: "", rush_touchdown: "0", pass_touchdown: "0", ...overrides,
});

test("accepts the current nflverse header contract with play_type and without a no_play column", () => {
  const currentHeader = ["desc", ...TOUCHDOWN_PBP_COLUMNS, "penalty"];
  assert.equal(currentHeader.includes("no_play"), false);
  assert.doesNotThrow(() => validateTouchdownPbpHeader(currentHeader));
});

test("extracts from a current-shape nflverse gzip without a no_play column", async () => {
  const currentHeader = ["desc", ...TOUCHDOWN_PBP_COLUMNS, "penalty"];
  const source = play({ rush_touchdown: "1" });
  const csv = `${currentHeader.join(",")}\n${currentHeader.map((column) => source[column] ?? "").join(",")}\n`;
  const response = new Response(gzipSync(csv));
  const extracted = await extractTouchdownContextFromGzip(response);
  assert.equal(extracted.sourceRows, 1);
  assert.equal(extracted.rows.length, 1);
  assert.equal(extracted.rows[0].touchdown, 1);
});

test("fails closed when a truly required upstream touchdown column is missing", () => {
  assert.throws(() => validateTouchdownPbpHeader(TOUCHDOWN_PBP_COLUMNS.filter((column) => column !== "yardline_100")), /yardline_100/);
  assert.throws(() => validateTouchdownPbpHeader(TOUCHDOWN_PBP_COLUMNS.filter((column) => column !== "play_type")), /play_type/);
});

test("uses inclusive 20, 10, and 5 yard boundaries", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(touchdownContextEvent(play({ yardline_100: "20" }))).filter(([key]) => key.endsWith("opportunity"))), { rz_opportunity: 1, inside_10_opportunity: 0, goal_line_opportunity: 0 });
  assert.deepEqual(Object.fromEntries(Object.entries(touchdownContextEvent(play({ yardline_100: "10" }))).filter(([key]) => key.endsWith("opportunity"))), { rz_opportunity: 1, inside_10_opportunity: 1, goal_line_opportunity: 0 });
  assert.deepEqual(Object.fromEntries(Object.entries(touchdownContextEvent(play({ yardline_100: "5" }))).filter(([key]) => key.endsWith("opportunity"))), { rz_opportunity: 1, inside_10_opportunity: 1, goal_line_opportunity: 1 });
});

test("retains a qualifying rushing touchdown", () => {
  assert.equal(touchdownContextEvent(play({ rush_touchdown: "1" })).touchdown, 1);
});

test("retains a qualifying receiving touchdown", () => {
  const receiving = touchdownContextEvent(play({ rush: "0", pass: "1", rusher_player_id: "", receiver_player_id: "00-2", receiver_player_name: "Receiver", pass_touchdown: "1" }));
  assert.equal(receiving.player_id, "00-2");
  assert.equal(receiving.touchdown, 1);
});

test("does not treat a passing touchdown as a scorer touchdown for the passer", () => {
  assert.equal(touchdownContextEvent(play({ rush: "0", pass: "1", rusher_player_id: "", pass_touchdown: "1" })), null);
});

test("normalizes reviewed nflverse team aliases in compact context rows", () => {
  const event = touchdownContextEvent(play({ posteam: "LA", defteam: "WAS" }));
  assert.equal(event.team, "lar");
  assert.equal(event.opponent, "wsh");
});

test("excludes non-scorer special-teams-equivalent rows", () => {
  assert.equal(touchdownContextEvent(play({ posteam: "", defteam: "", rush: "0", pass: "0", rusher_player_id: "" })), null);
});

test("excludes penalty-nullified touchdowns via nflverse play_type=no_play", () => {
  assert.equal(touchdownContextEvent(play({ play_type: "no_play", rush_touchdown: "1" })), null);
});

test("does not blanket-exclude a non-nullifying penalty", () => {
  assert.equal(touchdownContextEvent(play({ penalty: "1", rush_touchdown: "1" })).touchdown, 1);
});

test("excludes two-point attempts", () => {
  assert.equal(touchdownContextEvent(play({ two_point_attempt: "1" })), null);
});

test("excludes kneels", () => {
  assert.equal(touchdownContextEvent(play({ qb_kneel: "1" })), null);
});

test("excludes spikes", () => {
  assert.equal(touchdownContextEvent(play({ qb_spike: "1" })), null);
});

test("preserves a missing yardline as unavailable instead of a zero opportunity", () => {
  const event = touchdownContextEvent(play({ yardline_100: "" }));
  assert.equal(event.yardline_100, "");
  assert.equal(event.rz_opportunity, "");
  assert.equal(event.inside_10_opportunity, "");
  assert.equal(event.goal_line_opportunity, "");
});
