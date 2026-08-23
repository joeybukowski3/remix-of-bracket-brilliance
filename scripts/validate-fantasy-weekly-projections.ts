/**
 * Standalone validator for an already-generated production projection
 * artifact. Re-parses it against the strict schema and re-checks the rank
 * invariants that the schema alone cannot express. Exits non-zero on any
 * failure; never writes anything.
 *
 * Usage:
 *   tsx scripts/validate-fantasy-weekly-projections.ts --season=2026 --week=1
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  weeklyFantasyProjectionProductionArtifactSchema,
  assertProductionArtifactRankInvariants,
} from "../src/lib/fantasy/weekly/projections/production/artifactContract.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]) {
  const args = { season: 2026, week: 1 };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function main(): void {
  const { season, week } = parseArgs(process.argv);
  const path = join(ROOT, "public", "data", "fantasy", "projections", String(season), `week-${String(week).padStart(2, "0")}.json`);
  const raw = JSON.parse(readFileSync(path, "utf8"));

  const parsed = weeklyFantasyProjectionProductionArtifactSchema.parse(raw);
  assertProductionArtifactRankInvariants(parsed);

  if (parsed.season !== season || parsed.week !== week) {
    throw new Error(`Artifact season/week (${parsed.season}/${parsed.week}) does not match requested ${season}/${week}.`);
  }

  const rowCounts = Object.fromEntries((["QB", "RB", "WR", "TE"] as const).map((p) => [p, parsed.rows[p].length]));
  const totalRows = Object.values(rowCounts).reduce((a, b) => a + b, 0);
  if (totalRows === 0) throw new Error("Artifact has zero rows across all positions.");

  console.log(JSON.stringify({ status: "valid", path, season, week, rowCounts }, null, 2));
}

main();
