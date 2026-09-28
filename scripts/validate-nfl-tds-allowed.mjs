/**
 * Fail-closed check that public/data/nfl/tds-allowed-by-position.json matches the
 * player-week cache it was built from (no stale or double-counted sample).
 * A FINAL game nflverse has not published yet is logged as a warning only.
 *
 * Usage: tsx scripts/validate-nfl-tds-allowed.mjs --season=2026 [--week=3]
 *   --week is optional; when given, the artifact must be anchored to it.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reportPlayerWeekCoverage } from "./lib/nfl-allowed-by-position-coverage.mjs";
import { validateTdsAllowedArtifact } from "./lib/nfl-tds-allowed-coverage.mjs";
import { loadPlayerWeekRows } from "./lib/nflAllowedByPositionIo.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const season = Number(args.season);
const week = args.week == null ? null : Number(args.week);
if (!Number.isInteger(season) || (week != null && !Number.isInteger(week))) throw new Error("--season is required; --week must be an integer when given");

const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const artifact = read("public/data/nfl/tds-allowed-by-position.json");
const dir = `public/data/nfl/${season}`;
const playerWeekRows = loadPlayerWeekRows(ROOT, season);
reportPlayerWeekCoverage(
  { season, results: read(`${dir}/results.json`).results, games: read(`${dir}/games.json`).games, playerWeekRows },
  `TDs Allowed ${season} player-week cache`,
);
const problems = [];
if (artifact.season !== season) problems.push(`artifact season ${artifact.season} != ${season}`);
if (week != null && artifact.week !== week) problems.push(`artifact week ${artifact.week} != ${week}`);
problems.push(...validateTdsAllowedArtifact(artifact, playerWeekRows));
if (problems.length) {
  console.error(`TDs Allowed artifact is stale or invalid:\n- ${problems.slice(0, 12).join("\n- ")}`);
  process.exit(1);
}
console.log(`TDs Allowed artifact valid for ${season} week ${artifact.week}.`);
