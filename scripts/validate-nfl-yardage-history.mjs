/**
 * Fail-closed freshness/leakage check for the monolithic Yardage Props Review artifact
 * public/data/nfl/<season>/yardage-history.json (legacy `players` + `teamDefense` Last-10 logs).
 *
 * A Week N artifact must (a) be built for Week N, (b) cover the target season, (c) include every
 * completed pre-Week-N game for each defense it lists, (d) contain no Week >= N target-season game,
 * and (e) be ordered newest -> oldest.
 *
 * Usage: node scripts/validate-nfl-yardage-history.mjs --season=2026 --week=3
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_HISTORY_GAMES = 10;

/**
 * @param {{artifact:object, games:object[], results:object[], season:number, week:number}} input
 * @returns {string[]} problems (empty when valid)
 */
export function validateYardageHistoryArtifact({ artifact, games, results, season, week }) {
  const problems = [];
  if (artifact.season !== season || artifact.week !== week) {
    return [`artifact is for season ${artifact.season} week ${artifact.week}, expected ${season}/${week}`];
  }
  if (!artifact.provenance?.statSeasons?.includes(season)) problems.push(`provenance.statSeasons does not include ${season}`);
  if (!artifact.provenance?.epaSeasons?.includes(season)) problems.push(`provenance.epaSeasons does not include ${season}`);

  const finalIds = new Set(results.map((r) => r.gameId));
  const completedByTeam = new Map(); // canonical abbr -> completed pre-target-week games
  for (const game of games) {
    if (game.season !== season || game.week >= week || !finalIds.has(game.gameId)) continue;
    for (const abbr of [game.homeAbbr, game.awayAbbr]) {
      if (!completedByTeam.has(abbr)) completedByTeam.set(abbr, []);
      completedByTeam.get(abbr).push({ gameId: game.gameId, week: game.week });
    }
  }

  const logs = [
    ...Object.entries(artifact.players ?? {}).map(([key, log]) => [`players[${key}]`, log]),
    ...Object.entries(artifact.teamDefense ?? {}).map(([key, log]) => [`teamDefense[${key}]`, log]),
  ];
  for (const [label, log] of logs) {
    const rows = log.games ?? [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.season === season && row.week >= week) problems.push(`${label} contains target-season week ${row.week} (>= ${week}) -- leakage`);
      const prev = rows[i - 1];
      if (prev && prev.season * 100 + prev.week < row.season * 100 + row.week) problems.push(`${label} is not ordered newest -> oldest`);
    }
  }

  // Completeness: a defense's log must lead with every completed pre-target-week game it played.
  for (const [key, log] of Object.entries(artifact.teamDefense ?? {})) {
    const expected = completedByTeam.get(log.team);
    if (!expected) continue;
    const present = new Set((log.games ?? []).map((row) => row.gameId));
    // Logs hold the NEWEST games, so require the newest min(10, n) completed ones (never the oldest).
    const wanted = [...expected].sort((a, b) => b.week - a.week).slice(0, MAX_HISTORY_GAMES).map((game) => game.gameId);
    const missing = wanted.filter((gameId) => !present.has(gameId));
    if (missing.length) problems.push(`teamDefense[${key}] omits completed game(s) ${missing.join(", ")}`);
  }
  return problems;
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
  const season = Number(args.season);
  const week = Number(args.week);
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1) throw new Error("--season and --week are required integers");
  const dir = join(ROOT, "public", "data", "nfl", String(season));
  const problems = validateYardageHistoryArtifact({
    artifact: readJson(join(dir, "yardage-history.json")),
    games: readJson(join(dir, "games.json")).games,
    results: readJson(join(dir, "results.json")).results,
    season,
    week,
  });
  if (problems.length) {
    console.error(`[nfl:validate-yardage-history] INVALID season ${season} week ${week}:\n - ${problems.slice(0, 20).join("\n - ")}`);
    process.exit(1);
  }
  console.log(`[nfl:validate-yardage-history] season ${season} week ${week}: yardage-history.json fresh, leakage-free, newest-first`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
