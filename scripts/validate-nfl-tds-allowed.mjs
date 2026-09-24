/**
 * Fail-closed check that public/data/nfl/tds-allowed-by-position.json covers every
 * completed regular-season game for its season (no silently stale sample).
 *
 * Usage: node scripts/validate-nfl-tds-allowed.mjs --season=2026 --week=3
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTdsAllowedArtifact } from "./lib/nfl-tds-allowed-coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const season = Number(args.season);
const week = Number(args.week);
if (!Number.isInteger(season) || !Number.isInteger(week)) throw new Error("--season and --week are required");

const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const artifact = read("public/data/nfl/tds-allowed-by-position.json");
const problems = [];
if (artifact.season !== season) problems.push(`artifact season ${artifact.season} != ${season}`);
if (artifact.week !== week) problems.push(`artifact week ${artifact.week} != ${week}`);
const dir = `public/data/nfl/${season}`;
problems.push(...validateTdsAllowedArtifact(artifact, read(`${dir}/results.json`).results, read(`${dir}/games.json`).games));
if (problems.length) {
  console.error(`TDs Allowed artifact is stale or invalid:\n- ${problems.slice(0, 12).join("\n- ")}`);
  process.exit(1);
}
console.log(`TDs Allowed artifact valid for ${season} week ${week}.`);
