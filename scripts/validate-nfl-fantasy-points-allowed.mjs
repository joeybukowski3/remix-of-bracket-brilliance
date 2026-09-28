/**
 * Fail-closed check that public/data/nfl/fantasy-points-allowed.json is
 * structurally sound and matches the player-week cache it was built from
 * (every team/sample/position gamesSampled equals the cache's defense games,
 * so a stale or double-counted artifact cannot ship).
 *
 * WARN only (never fails): a game FINAL in results.json that nflverse has not
 * published yet, or a cached game results.json does not mark FINAL yet.
 *
 * Usage: tsx scripts/validate-nfl-fantasy-points-allowed.mjs --season=2026 [--week=3]
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reportPlayerWeekCoverage } from "./lib/nfl-allowed-by-position-coverage.mjs";
import { validateFantasyAllowedArtifact } from "./lib/nfl-fantasy-allowed-coverage.mjs";
import { loadPlayerWeekRows, loadTeamAbbrs } from "./lib/nflAllowedByPositionIo.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = "public/data/nfl/fantasy-points-allowed.json";
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const season = Number(args.season);
const week = args.week == null ? null : Number(args.week);
if (!Number.isInteger(season) || (week != null && !Number.isInteger(week))) throw new Error("--season is required; --week must be an integer when given");

const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
let artifact;
try {
  artifact = read(ARTIFACT);
} catch (error) {
  console.error(`Fantasy Points Allowed artifact cannot be parsed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const dir = `public/data/nfl/${season}`;
const currentRows = loadPlayerWeekRows(ROOT, season);
const playerWeekRows = [...loadPlayerWeekRows(ROOT, season - 1), ...currentRows];
reportPlayerWeekCoverage(
  { season, results: read(`${dir}/results.json`).results, games: read(`${dir}/games.json`).games, playerWeekRows: currentRows },
  `Fantasy Points Allowed ${season} player-week cache`,
);

const problems = validateFantasyAllowedArtifact(artifact, { playerWeekRows, teams: loadTeamAbbrs(ROOT), season });
if (week != null && artifact.week !== week) problems.unshift(`artifact week ${artifact.week} != ${week}`);
if (problems.length) {
  console.error(`Fantasy Points Allowed artifact is stale or invalid (${problems.length} problems):\n- ${problems.slice(0, 12).join("\n- ")}`);
  process.exit(1);
}
console.log(`Fantasy Points Allowed artifact valid for ${season} week ${artifact.week} (${artifact.rows.length} teams, generatedAt ${artifact.generatedAt}).`);
