/**
 * Fail-closed check that the DFS yardage-history folder for a season/week exists and is
 * usable: public/data/nfl/yardage-history/<season>/week-NN/{index,QB,RB,WR,TE}.json.
 *
 * Usage: node scripts/validate-nfl-dfs-history.mjs --season=2026 --week=3
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DFS_HISTORY_FILES = ["index", "QB", "RB", "WR", "TE"];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function dfsHistoryDirectory(season, week, root = ROOT) {
  return join(root, "public", "data", "nfl", "yardage-history", String(season), `week-${String(week).padStart(2, "0")}`);
}

/** Returns the list of problems (empty when valid). */
export function validateDfsHistory(season, week, root = ROOT) {
  const directory = dfsHistoryDirectory(season, week, root);
  if (!existsSync(directory)) return [`missing folder ${directory}`];
  const problems = [];
  for (const name of DFS_HISTORY_FILES) {
    const path = join(directory, `${name}.json`);
    if (!existsSync(path)) { problems.push(`missing ${name}.json`); continue; }
    let data;
    try { data = JSON.parse(readFileSync(path, "utf-8")); } catch { problems.push(`${name}.json is not valid JSON`); continue; }
    if (data.season !== season || data.week !== week) problems.push(`${name}.json is for season ${data.season} week ${data.week}, expected ${season}/${week}`);
    if (name === "index") {
      if (!Array.isArray(data.playerKeys) || !data.playerKeys.length) problems.push("index.json has no playerKeys");
    } else if (!Object.values(data.players ?? {}).some((rows) => rows.length)) {
      problems.push(`${name}.json has no player history rows`);
    }
  }
  return problems;
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
  const season = Number(args.season);
  const week = Number(args.week);
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1) throw new Error("--season and --week are required integers");
  const problems = validateDfsHistory(season, week);
  if (problems.length) {
    console.error(`[nfl:validate-dfs-history] INVALID season ${season} week ${week}:\n - ${problems.join("\n - ")}`);
    process.exit(1);
  }
  console.log(`[nfl:validate-dfs-history] season ${season} week ${week}: ${DFS_HISTORY_FILES.length} files valid`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
