/**
 * Fail-closed check that public/data/nfl/yards-vs-average-by-position.json is
 * structurally sound and equals a fresh rebuild from the player-week cache it
 * claims to represent (see src/lib/nfl/yardsVsAverage/validate.ts).
 *
 * WARN only (never fails): a game FINAL in results.json that nflverse has not
 * published yet, or a cached game results.json does not mark FINAL yet.
 *
 * Usage: tsx scripts/validate-nfl-yards-vs-average.mjs --season=2026 [--week=3]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reportPlayerWeekCoverage } from "./lib/nfl-allowed-by-position-coverage.mjs";
import { loadGames, loadTeamAbbrs } from "./lib/nflAllowedByPositionIo.ts";
import { loadYardsVsAverageRows, YARDS_VS_AVERAGE_OUT_FILE } from "./lib/nflYardsVsAverageIo.ts";
import { resolveCurrentOpponents } from "../src/lib/nfl/fantasyAllowed/currentOpponents.ts";
import { buildYardsVsAverageArtifact } from "../src/lib/nfl/yardsVsAverage/buildArtifact.ts";
import { validateYardsVsAverageArtifact } from "../src/lib/nfl/yardsVsAverage/validate.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const season = Number(args.season);
const week = args.week == null ? null : Number(args.week);
if (!Number.isInteger(season) || (week != null && !Number.isInteger(week))) throw new Error("--season is required; --week must be an integer when given");

const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
let artifact;
try {
  artifact = read(YARDS_VS_AVERAGE_OUT_FILE);
} catch (error) {
  console.error(`Yards vs Avg artifact cannot be parsed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const rows = loadYardsVsAverageRows(ROOT, season);
const games = loadGames(ROOT, season);
const resultsPath = `public/data/nfl/${season}/results.json`;
reportPlayerWeekCoverage(
  { season, results: existsSync(join(ROOT, resultsPath)) ? read(resultsPath).results : [], games, playerWeekRows: rows.filter((row) => row.season === season) },
  `Yards vs Avg ${season} player-week cache`,
);

const teams = loadTeamAbbrs(ROOT);
const expectedWeek = Number.isInteger(artifact?.week) ? artifact.week : 1;
const expected = buildYardsVsAverageArtifact({
  rows, teams, season, week: expectedWeek, opponents: resolveCurrentOpponents(games, expectedWeek), generatedAt: artifact?.generatedAt ?? "",
});
const problems = validateYardsVsAverageArtifact(artifact, { expected, rows, teams, season });
if (week != null && artifact.week !== week) problems.unshift(`artifact week ${artifact.week} != ${week}`);
if (problems.length) {
  console.error(`Yards vs Avg artifact is stale or invalid (${problems.length} problems):\n- ${problems.slice(0, 12).join("\n- ")}`);
  process.exit(1);
}
console.log(`Yards vs Avg artifact valid for ${season} week ${artifact.week} (${artifact.rows.length} teams, ${artifact.games.length} defense-games, generatedAt ${artifact.generatedAt}).`);
