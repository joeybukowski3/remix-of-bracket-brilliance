import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requirePlayerWeekCoverage, validateTdsAllowedArtifact } from "./nfl-tds-allowed-coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));

const results = [
  { gameId: "2026_01_AAA_BBB", week: 1, seasonType: "REG", final: true, awayAbbr: "aaa", homeAbbr: "bbb" },
  { gameId: "2026_02_BBB_AAA", week: 2, seasonType: "REG", final: true, awayAbbr: "bbb", homeAbbr: "aaa" },
  { gameId: "2026_03_AAA_BBB", week: 3, seasonType: "REG", final: false, awayAbbr: "aaa", homeAbbr: "bbb" },
];
const rows = (week) => ["aaa", "bbb"].map((team) => ({ season: 2026, week, team }));
const run = (playerWeekRows) => requirePlayerWeekCoverage({ season: 2026, results, games: results, playerWeekRows });

test("fails when a completed game is missing from the player-week source", () => {
  assert.throws(() => run(rows(1)), /missing team-games/);
});

test("passes when only unplayed games are missing", () => {
  assert.doesNotThrow(() => run([...rows(1), ...rows(2)]));
});

test("artifact claiming a newer week fails while its sample lags completed games", () => {
  const sample = (gamesSampled) => ({ qbPass: { gamesSampled } });
  const artifact = (n) => ({
    season: 2026,
    week: 3,
    rows: Array.from({ length: 32 }, (_, i) => ({ team: i < 2 ? ["aaa", "bbb"][i] : `t${i}`, samples: { 2026: sample(i < 2 ? n : 0) } })),
  });
  assert.equal(validateTdsAllowedArtifact(artifact(2), results).length, 0);
  assert.match(validateTdsAllowedArtifact(artifact(1), results)[0], /1 games sampled, 2 completed/);
});

// Real committed caches: ATL vs CAR Week 2, 2026.
const playerWeek = readFileSync(join(ROOT, "data/nfl/nflverse/stats-player-week/stats_player_week_2026.csv"), "utf8")
  .replace(/\r/g, "").split("\n").filter(Boolean);
const header = playerWeek[0].split(",");
const sourceRows = playerWeek.slice(1).map((line) => Object.fromEntries(line.split(",").map((v, i) => [header[i], v])));
// Raw nflverse abbreviations the loader normalises to canonical ids.
const RAW_TEAM_ALIASES = { LA: "lar", WAS: "wsh" };
const atlWeek2 = (name, column) => Number(sourceRows.find((r) => r.player_display_name === name && r.week === "2" && r.opponent_team === "ATL")?.[column]);

test("ATL Week 2 source rows carry the Carolina touchdowns", () => {
  assert.equal(atlWeek2("Bryce Young", "passing_tds"), 3);
  assert.equal(atlWeek2("Chuba Hubbard", "receiving_tds"), 1);
  assert.equal(atlWeek2("Darren Waller", "receiving_tds"), 2);
});

const artifact = readJson("public/data/nfl/tds-allowed-by-position.json");
const atl = artifact.rows.find((row) => row.team === "atl").samples["2026"];

test("ATL full-2026 totals include Weeks 1 and 2", () => {
  assert.equal(atl.qbPass.touchdownsAllowedTotal, 4);
  assert.equal(atl.rbRec.touchdownsAllowedTotal, 1);
  assert.equal(atl.teRec.touchdownsAllowedTotal, 3);
});

test("all 32 teams have full completed-game coverage in cache and artifact", () => {
  const current = readJson("public/data/nfl/2026/results.json").results;
  const games = readJson("public/data/nfl/2026/games.json").games;
  const cacheRows = sourceRows.map((r) => ({ season: 2026, week: Number(r.week), team: RAW_TEAM_ALIASES[r.team] ?? r.team.toLowerCase() }));
  assert.doesNotThrow(() => requirePlayerWeekCoverage({ season: 2026, results: current, games, playerWeekRows: cacheRows }));
  assert.deepEqual(validateTdsAllowedArtifact(artifact, current, games), []);
});
