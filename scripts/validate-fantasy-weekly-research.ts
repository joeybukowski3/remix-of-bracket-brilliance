import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { weeklyFantasyProjectionProductionArtifactSchema } from "../src/lib/fantasy/weekly/projections/production/artifactContract.ts";
import {
  assertWeeklyFantasyResearchArtifactIdentity,
  weeklyFantasyResearchArtifactSchema,
} from "../src/lib/fantasy/weekly/researchArtifact.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;

function parseArgs(argv: string[]) {
  const args = { season: 2026, week: 1 };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || !Number.isInteger(args.week) || args.week < 1 || args.week > 18) {
    throw new Error("Invalid --season/--week.");
  }
  return args;
}

function main(): void {
  const { season, week } = parseArgs(process.argv);
  const filename = `week-${String(week).padStart(2, "0")}.json`;
  const projectionPath = join(ROOT, "public", "data", "fantasy", "projections", String(season), filename);
  const researchPath = join(ROOT, "public", "data", "fantasy", "weekly-research", String(season), filename);
  const projectionText = readFileSync(projectionPath, "utf8");
  const projection = weeklyFantasyProjectionProductionArtifactSchema.parse(JSON.parse(projectionText));
  const research = weeklyFantasyResearchArtifactSchema.parse(JSON.parse(readFileSync(researchPath, "utf8")));
  assertWeeklyFantasyResearchArtifactIdentity(research);

  if (research.season !== season || research.week !== week) throw new Error("Research artifact season/week mismatch.");
  const expectedProjectionPath = `/data/fantasy/projections/${season}/${filename}`;
  if (research.projectionArtifact.path !== expectedProjectionPath) throw new Error("Research artifact projection path mismatch.");
  if (research.projectionArtifact.schemaVersion !== projection.schemaVersion) throw new Error("Research artifact projection schema mismatch.");
  const projectionHash = createHash("sha256").update(projectionText).digest("hex");
  if (research.projectionArtifact.sourceHash !== projectionHash) throw new Error("Research artifact is stale relative to its projection artifact.");

  const projectionRows = POSITIONS.flatMap((position) => projection.rows[position]);
  const projectionById = new Map(projectionRows.map((row) => [row.playerId, row]));
  if (research.rows.length !== projectionRows.length) throw new Error("Research/projection row counts differ.");
  for (const row of research.rows) {
    const projected = projectionById.get(row.playerId);
    if (!projected || projected.position !== row.position) throw new Error(`Research identity mismatch: ${row.playerId}`);
  }

  console.log(JSON.stringify({
    artifact: researchPath,
    rows: research.rows.length,
    exactPlayerIdCoverage: true,
    projectionSourceHashMatches: true,
  }, null, 2));
}

main();
