import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const analysis = read("data/nfl/research/trench-advantage/analysis.json");
const trench = read("public/data/nfl/matchup-trench-metrics.json");
const market = read("public/data/nfl/matchup-market.json");
const results = read("public/data/nfl/2026/results.json").results;
const csv = readFileSync(new URL("../../data/nfl/research/trench-advantage/team_games.csv", import.meta.url), "utf8").trim().split(/\r?\n/);
const columns = csv[0].split(",");
const rows = csv.slice(1).map((line) => Object.fromEntries(line.split(",").map((v, i) => [columns[i], v.replace(/^"|"$/g, "")])));

test("all completed 2026 games have exactly two opposing team rows and a pregame rating", () => {
  assert.equal(rows.length, 64);
  assert.equal(new Set(rows.map((r) => `${r.game_id}:${r.team}`)).size, 64);
  assert.equal(results.length, 32);
  for (const row of rows) {
    const peer = rows.find((r) => r.game_id === row.game_id && r.team === row.opponent);
    assert.ok(peer);
    assert.equal(Number(row.ats_margin) + Number(peer.ats_margin), 0);
    assert.equal(Number(row.score_margin) + Number(peer.score_margin), 0);
    assert.ok(Date.parse(row.rating_as_of) < Date.parse(row.kickoff_utc));
    assert.equal(Number(row.rating_through_week), row.week === "1" ? 18 : 1);
  }
});

test("three manual rank-gap and ATS calculations agree with independent source fields", () => {
  for (const [gameId, team] of [["2026_02_GB_NYJ", "nyj"], ["2026_02_IND_KC", "ind"], ["2026_02_SEA_ARI", "sea"]]) {
    const row = rows.find((r) => r.game_id === gameId && r.team === team);
    const result = results.find((g) => g.gameId === gameId);
    const side = result.homeAbbr === team ? "home" : "away";
    const points = result[`${side}Score`];
    const opponentPoints = result[`${side === "home" ? "away" : "home"}Score`];
    const rating = trench.seasons["2026"].teams;
    assert.equal(Number(row.pass_rush_edge), rating[team].metrics["def.passRushWinRate"].espnRank * -1 + rating[row.opponent].metrics["off.passBlockWinRate"].espnRank);
    assert.equal(Number(row.team_spread), market.currentMarket[gameId].spread[side]);
    assert.equal(Number(row.ats_margin), points - opponentPoints + market.currentMarket[gameId].spread[side]);
  }
  assert.equal(analysis.historical["2021-2025"].validGames, 0);
});

test("Week 2 pass-volume qualifier uses the opponent's Week 1 plays", () => {
  const source = readFileSync(new URL("../../data/nfl/nflverse/play-volume-team-game/play_volume_team_game_2026.csv", import.meta.url), "utf8").trim().split(/\r?\n/);
  const header = source[0].split(",");
  const volume = source.slice(1).map((line) => Object.fromEntries(line.split(",").map((value, i) => [header[i], value])));
  for (const row of rows.filter((r) => r.week === "2")) {
    const prior = rows.find((r) => r.week === "1" && r.team === row.opponent);
    const sourceRow = volume.find((v) => v.game_id === prior.game_id && v.team.toLowerCase() === row.opponent);
    assert.ok(sourceRow);
    assert.equal(Number(row.opponent_pregame_pass_rate), Number(sourceRow.pass_plays) / Number(sourceRow.eligible_plays));
  }
  assert.ok(rows.filter((r) => r.week === "1").every((r) => r.opponent_pregame_pass_rate === ""));
});
