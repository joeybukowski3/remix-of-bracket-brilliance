/**
 * Import an approved nfl-power-v0.4-beta preseason projection source into
 * the permanent repo artifact.
 *
 * This is intentionally NOT part of the automated Tuesday EPA pipeline
 * (nfl-team-ratings.yml / generate-nfl-v03-artifacts.mjs). The v0.4
 * projection layer is a curated, offseason, human-reviewed dataset — guide
 * calibration, luck/regression review, and personnel/coach/injury judgment
 * calls are made outside this repo and handed in as a finished JSON file.
 * This script only copies and structurally checks that file; it never
 * computes or regenerates any subjective adjustment.
 *
 * Usage:
 *   node scripts/import-nfl-power-v04-projection.mjs --source=<path-to-approved-json>
 *   node scripts/import-nfl-power-v04-projection.mjs --source=<path> --dry-run
 *   node scripts/import-nfl-power-v04-projection.mjs --source=<path> --output=<path>
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = resolve(ROOT, "public", "data", "nfl", "2026", "projected-power-ratings-v04.json");

const NFL_V04_MODEL_VERSION = "nfl-power-v0.4-beta";
const NFL_V04_BASE_MODEL = "nfl-power-v0.3.1";
const KNOWN_DIVISIONS = new Set([
  "AFC East", "AFC North", "AFC South", "AFC West",
  "NFC East", "NFC North", "NFC South", "NFC West",
]);

export function parseArgs(argv) {
  const args = { source: null, output: DEFAULT_OUTPUT, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--source=")) args.source = resolve(arg.slice("--source=".length));
    else if (arg.startsWith("--output=")) args.output = resolve(arg.slice("--output=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.source) throw new Error("--source=<path-to-approved-json> is required");
  return args;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Structural sanity check only — narrower than the TypeScript validator in
 * src/lib/nfl/v04Projection.ts (which the app loads at runtime). This check
 * exists so a bad import fails loudly at copy time rather than at page load.
 */
function assertStructurallyValid(artifact) {
  if (!artifact || typeof artifact !== "object") throw new Error("root value must be an object");
  const meta = artifact._meta;
  if (!meta || typeof meta !== "object") throw new Error("_meta must be an object");
  if (meta.modelVersion !== NFL_V04_MODEL_VERSION) {
    throw new Error(`_meta.modelVersion must be ${NFL_V04_MODEL_VERSION}, got ${meta.modelVersion}`);
  }
  if (meta.baseModel !== NFL_V04_BASE_MODEL) {
    throw new Error(`_meta.baseModel must be ${NFL_V04_BASE_MODEL}, got ${meta.baseModel}`);
  }
  if (meta.sosAffectsRating !== false) {
    throw new Error("_meta.sosAffectsRating must be false");
  }
  if (!Array.isArray(meta.luckCoverageTeams)) {
    throw new Error("_meta.luckCoverageTeams must be an array");
  }

  if (!Array.isArray(artifact.teams) || artifact.teams.length !== 32) {
    throw new Error(`teams must be an array of exactly 32 entries, got ${artifact.teams?.length}`);
  }

  const abbrs = new Set();
  const ranks = new Set();
  const sosRanks = new Set();
  const coverage = new Set(meta.luckCoverageTeams.map((abbr) => String(abbr).toUpperCase()));

  for (const team of artifact.teams) {
    const label = team.abbr ?? team.team ?? "<unknown>";
    if (typeof team.abbr !== "string" || !team.abbr) throw new Error(`${label}: abbr is required`);
    if (abbrs.has(team.abbr)) throw new Error(`${label}: duplicate abbr`);
    abbrs.add(team.abbr);

    if (!Number.isInteger(team.rank) || team.rank < 1 || team.rank > 32) {
      throw new Error(`${label}: rank must be an integer in [1, 32]`);
    }
    if (ranks.has(team.rank)) throw new Error(`${label}: duplicate rank ${team.rank}`);
    ranks.add(team.rank);

    if (!KNOWN_DIVISIONS.has(team.division)) {
      throw new Error(`${label}: division "${team.division}" is not a recognized NFL division`);
    }

    for (const key of ["rating2025Adjusted", "projectionAdjustment2026", "rating2026", "sosAvgOpponentRating"]) {
      if (!isFiniteNumber(team[key])) throw new Error(`${label}: ${key} must be a finite number`);
    }
    if (team.rating2025Adjusted < 1 || team.rating2025Adjusted > 99) {
      throw new Error(`${label}: rating2025Adjusted out of [1, 99]`);
    }
    if (team.rating2026 < 1 || team.rating2026 > 99) {
      throw new Error(`${label}: rating2026 out of [1, 99]`);
    }
    if (!Number.isInteger(team.sosRank) || team.sosRank < 1 || team.sosRank > 32) {
      throw new Error(`${label}: sosRank must be an integer in [1, 32]`);
    }
    if (sosRanks.has(team.sosRank)) throw new Error(`${label}: duplicate sosRank ${team.sosRank}`);
    sosRanks.add(team.sosRank);

    const components = team.components;
    if (!components || typeof components !== "object") throw new Error(`${label}: components is required`);
    const isCoverageTeam = coverage.has(team.abbr.toUpperCase());
    const hasLuckRank = components.luckAverageRank !== null;
    if (hasLuckRank && !isCoverageTeam) {
      throw new Error(`${label}: luckAverageRank is set but team is not in luckCoverageTeams`);
    }
    if (!hasLuckRank && isCoverageTeam) {
      throw new Error(`${label}: luckAverageRank is null but team is listed in luckCoverageTeams`);
    }

    // Betting/vendor terminology must never make it into a checked-in artifact.
    const forbidden = ["claude", "anthropic", "betting", "spread", "odds", "wager", "sportsbook"];
    const noteLower = String(team.notes ?? "").toLowerCase();
    for (const term of forbidden) {
      if (noteLower.includes(term)) throw new Error(`${label}: notes contains forbidden term "${term}"`);
    }
  }

  if (ranks.size !== 32) throw new Error("ranks do not cover 1..32");
  if (sosRanks.size !== 32) throw new Error("sosRank values do not cover 1..32");
}

export function importV04Projection({ source, output, dryRun }) {
  if (!existsSync(source)) throw new Error(`source file not found: ${source}`);
  const raw = readFileSync(source, "utf8");
  const artifact = JSON.parse(raw);
  assertStructurallyValid(artifact);

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (!dryRun) writeFileSync(output, serialized, "utf8");
  return { teamCount: artifact.teams.length, output, dryRun };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = importV04Projection(args);
  if (result.dryRun) {
    console.log(`[dry-run] validated ${result.teamCount} teams from ${args.source}; would write ${result.output}`);
  } else {
    console.log(`Imported ${result.teamCount} teams from ${args.source} to ${result.output}`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`import-nfl-power-v04-projection failed: ${error.message}`);
    process.exitCode = 1;
  });
}
