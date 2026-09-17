import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const repo = fileURLToPath(new URL("../", import.meta.url));
function fixture({ staleYardage = false, missingContext = false, futureStats = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "jkb-td-rollover-"));
  const json = (file, value) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), JSON.stringify(value)); };
  const yesterday = new Date(Date.now() - 86400000).toISOString(), tomorrow = new Date(Date.now() + 86400000).toISOString();
  const game = { gameId: "2026_02_DET_BUF", season: 2026, week: 2, seasonType: "REG", homeAbbr: "buf", awayAbbr: "det", dateUtc: tomorrow };
  json("public/data/nfl/2026/games.json", { games: [{ ...game, gameId: "2026_01_DET_TEN", week: 1, dateUtc: yesterday }, game] });
  json("public/data/nfl/2026/results.json", { results: [{ gameId: "2026_01_DET_TEN", seasonType: "REG", final: true, homeAbbr: "ten", awayAbbr: "det", homeScore: 7, awayScore: 14 }] });
  json("public/data/nfl/2026/yardage-projections.json", { season: 2026, week: staleYardage ? 1 : 2, rows: [{ season: 2026, week: 2, status: "projected", playerId: "gsis:p1", playerName: "Player One", position: "RB", market: "rushing", team: "det", opponent: "buf", homeAway: "away", gameId: game.gameId, kickoff: tomorrow }] });
  json("public/data/nfl/2026/touchdown-preview.json", { sentinel: "prior artifact" });
  function csvCache(directory, filename, csv, context = false) {
    mkdirSync(path.join(root, directory), { recursive: true });
    writeFileSync(path.join(root, directory, filename), csv);
    const entry = { season: 2026, filename, byteSize: Buffer.byteLength(csv), sha256: createHash("sha256").update(csv).digest("hex"), rowCount: csv.trim().split("\n").length - 1, headerColumns: csv.split("\n")[0].split(",") };
    json(`${directory}/${context ? filename.replace(".csv", ".manifest.json") : "manifest.json"}`, context ? { ...entry, sourceState: "available", compactRows: entry.rowCount, compactColumns: entry.headerColumns } : { files: [entry] });
  }
  csvCache("data/nfl/nflverse/player-week-stats", "stats_player_week_2026.csv", "player_id,position,season,week,season_type,game_id,team,opponent_team,carries,targets,rushing_tds,receiving_tds\np1,RB,2026,1,REG,2026_01_DET_TEN,DET,TEN,1,0,1,0\n" + (futureStats ? "p1,RB,2026,2,REG,2026_02_DET_BUF,DET,BUF,99,99,99,99\n" : ""));
  if (!missingContext) csvCache("data/nfl/nflverse/touchdown-context", "touchdown_context_2026.csv", "player_id,game_id,season,week,team,opponent,rz_opportunity,inside_10_opportunity,goal_line_opportunity\np1,2026_01_DET_TEN,2026,1,DET,TEN,1,1,1\n", true);
  return root;
}
function run(root) {
  return spawnSync(process.execPath, [path.join(repo, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", path.join(repo, "tsconfig.app.json"), path.join(repo, "scripts/generate-nfl-touchdown-preview.ts"), "--season=2026"], { cwd: root, encoding: "utf8", timeout: 30000 });
}
function cleanup(root) {
  assert.ok(path.resolve(root).startsWith(path.join(tmpdir(), "jkb-td-rollover-")));
  rmSync(root, { recursive: true, force: true });
}
test("TD defaults to current Week 2 and includes completed Week 1 while excluding Week 2 stats", () => {
  const root = fixture({ futureStats: true });
  try {
    const result = run(root); assert.equal(result.status, 0, result.stderr);
    const artifact = JSON.parse(readFileSync(path.join(root, "public/data/nfl/2026/touchdown-preview.json"), "utf8"));
    assert.equal(artifact.week, 2); assert.equal(artifact.players.length, 1);
    assert.equal(artifact.players[0].gameId, "2026_02_DET_BUF");
    assert.equal(artifact.players[0].playerHistory.length, 1);
    assert.equal(artifact.players[0].playerHistory[0].week, 1);
    assert.equal(artifact.players[0].windows["2026"].usagePerGame, 1);
  } finally { cleanup(root); }
});
for (const [name, options, error] of [
  ["stale candidate source", { staleYardage: true }, "season/week mismatch"],
  ["missing completed-week PBP", { missingContext: true }, "requires current player-week and touchdown context"],
]) test(`TD fails closed for ${name}`, () => {
  const root = fixture(options);
  try {
    const result = run(root); assert.notEqual(result.status, 0); assert.ok(result.stderr.includes(error), result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "public/data/nfl/2026/touchdown-preview.json"), "utf8")), { sentinel: "prior artifact" });
    assert.ok(existsSync(path.join(root, "public/data/nfl/2026/touchdown-preview.json")));
  } finally { cleanup(root); }
});
