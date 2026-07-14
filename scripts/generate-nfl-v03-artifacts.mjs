/**
 * Generate internal Stage-1 nfl-power-v0.3.0 artifacts from checked-in data.
 *
 * This command is intentionally offline. It validates the immutable weekly
 * cache before computation and has no provider acquisition path.
 *
 * Usage:
 *   node scripts/generate-nfl-v03-artifacts.mjs
 *   node scripts/generate-nfl-v03-artifacts.mjs --dry-run
 *   node scripts/generate-nfl-v03-artifacts.mjs --output-dir=path
 *   node scripts/generate-nfl-v03-artifacts.mjs --generated-at=2026-07-14T12:00:00.000Z
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  NFL_V03_PERFORMANCE_SEASONS,
  NFL_V03_PRESEASON_SEASONS,
  NFL_V03_SOURCE_SEASONS,
  buildNflV03ArtifactSet,
  serializeNflV03Artifact,
} from "./lib/nfl-v03-artifacts.mjs";
import { validateNflWeeklySourceCache } from "./validate-nfl-weekly-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT_DIR = join(ROOT, "public", "data", "nfl");
const DEFAULT_OUTPUT_DIR = DEFAULT_INPUT_DIR;
const WEEKLY_CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "stats-team-week");

export function parseArgs(argv) {
  const args = {
    dryRun: false,
    inputDir: DEFAULT_INPUT_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    generatedAt: null,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--input-dir=")) {
      args.inputDir = resolve(arg.slice("--input-dir=".length));
    } else if (arg.startsWith("--output-dir=")) {
      args.outputDir = resolve(arg.slice("--output-dir=".length));
    } else if (arg.startsWith("--generated-at=")) {
      args.generatedAt = arg.slice("--generated-at=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.generatedAt != null && Number.isNaN(Date.parse(args.generatedAt))) {
    throw new Error(`Invalid --generated-at value: ${args.generatedAt}`);
  }
  return args;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON ${path}: ${error.message}`);
  }
}

function existingPaths() {
  return [
    ...NFL_V03_PERFORMANCE_SEASONS.map((season) => `${season}/context-flags.json`),
    ...NFL_V03_PRESEASON_SEASONS.flatMap((season) => [
      `${season}/manual-adjustments.json`,
      `${season}/preseason-power-ratings.json`,
    ]),
  ];
}

export function loadNflV03Inputs({ inputDir, outputDir }) {
  const teamsJson = readJson(join(inputDir, "teams.json"));
  const seasonInputs = {};
  for (const season of NFL_V03_PERFORMANCE_SEASONS) {
    seasonInputs[season] = {
      games: readJson(join(inputDir, String(season), "games.json")).games,
      results: readJson(join(inputDir, String(season), "results.json")).results,
      weeklyCsvText: NFL_V03_SOURCE_SEASONS.includes(season)
        ? readFileSync(join(WEEKLY_CACHE_DIR, `stats_team_week_${season}.csv`), "utf8")
        : null,
    };
  }
  const existingArtifacts = {};
  for (const relativePath of existingPaths()) {
    const path = join(outputDir, ...relativePath.split("/"));
    if (existsSync(path)) existingArtifacts[relativePath] = readJson(path);
  }
  return { teamsJson, seasonInputs, existingArtifacts };
}

export function writeNflV03Artifacts(artifacts, outputDir, { dryRun = false } = {}) {
  const written = [];
  if (dryRun) return written;
  for (const [relativePath, payload] of Object.entries(artifacts)) {
    const path = join(outputDir, ...relativePath.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeNflV03Artifact(payload));
    written.push(path);
  }
  return written;
}

export function artifactSummary(artifacts) {
  return Object.entries(artifacts).map(([path, artifact]) => ({
    path,
    count:
      artifact.teams?.length ??
      artifact.ratings?.length ??
      artifact.flags?.length ??
      artifact.entries?.length ??
      0,
  }));
}

export function runNflV03ArtifactCli(args, log = console.log) {
  const cacheValidation = validateNflWeeklySourceCache({ rootDir: ROOT });
  if (!cacheValidation.valid) throw new Error("Weekly source-cache validation failed");
  const inputs = loadNflV03Inputs(args);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const artifacts = buildNflV03ArtifactSet({ ...inputs, generatedAt });
  const written = writeNflV03Artifacts(artifacts, args.outputDir, { dryRun: args.dryRun });
  for (const summary of artifactSummary(artifacts)) {
    log(
      `[nfl:v03-artifacts] ${summary.path}: ${summary.count} rows${args.dryRun ? " (dry-run)" : ""}`
    );
  }
  log(
    `[nfl:v03-artifacts] complete: ${Object.keys(artifacts).length} artifacts, ${written.length} written`
  );
  return { artifacts, written, cacheValidation };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
  try {
    runNflV03ArtifactCli(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`[nfl:v03-artifacts] FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
