/**
 * Phase 1: generates the immutable historical yardage-outcome artifact from
 * the already-committed nflverse `stats_player_week` cache plus the
 * repository's own `games.json` schedules. Ground truth for passing,
 * rushing and receiving yards -- no projection, no model, no matchup score.
 * See src/lib/nfl/props/README.md for the full architecture and leakage
 * contract this artifact is built to satisfy.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGameJoinIndex,
  normalizeYardageOutcomeRow,
  outcomeRowKey,
  type NflPropRawGameRecord,
  type NflYardageOutcomeRow,
  type NflYardageOutcomeSkipReason,
} from "../src/lib/nfl/props/historicalOutcomes";
import {
  countGameContextResolution,
  countPlayersWithMultipleTeamsInSeason,
  emptySkipCounts,
  findDuplicateOutcomeKeys,
  summarizeSeasonCoverage,
} from "../src/lib/nfl/props/historicalOutcomesQa";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
const PLAYERS_CACHE_DIR = "data/nfl/nflverse/players";
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; retrievedDateUtc: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args: { seasons: number[] | null; output: string | null; generatedAt: string } = {
    seasons: null,
    output: null,
    generatedAt: new Date().toISOString(),
  };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--seasons=")) args.seasons = raw.slice(10).split(",").map(Number).filter(Number.isInteger);
    else if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be an ISO timestamp.");
  return args;
}

function readManifest(relativeDir: string): { path: string; value: CacheManifest } {
  const path = join(ROOT, relativeDir, "manifest.json");
  if (!existsSync(path)) throw new Error(`Missing source manifest ${path}`);
  return { path, value: JSON.parse(readFileSync(path, "utf8")) };
}

function verifiedCsvRows(relativeDir: string, manifest: CacheManifest, season: number) {
  const entry = manifest.files?.find((candidate) => candidate.season === season);
  if (!entry) return null;
  const path = join(ROOT, relativeDir, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { entry, rows: parseCsv(text) as CsvRow[] };
}

function readSeasonGames(season: number): NflPropRawGameRecord[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { games?: NflPropRawGameRecord[] };
  if (!Array.isArray(parsed.games)) throw new Error(`Malformed games.json for ${season}: missing "games" array.`);
  return parsed.games;
}

function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

const { seasons: requestedSeasons, output: outputOverride, generatedAt } = parseArgs(process.argv);

const statsManifest = readManifest(STATS_CACHE_DIR).value;
const availableSeasons = (statsManifest.files ?? [])
  .map((entry) => entry.season)
  .filter((season): season is number => Number.isInteger(season))
  .sort((a, b) => a - b);
if (!availableSeasons.length) throw new Error(`No cached seasons found in ${STATS_CACHE_DIR}/manifest.json.`);

const seasons = requestedSeasons ?? availableSeasons;
for (const season of seasons) {
  if (!availableSeasons.includes(season)) {
    throw new Error(`Season ${season} is not cached in ${STATS_CACHE_DIR}. Available: ${availableSeasons.join(",")}.`);
  }
}

const playersManifest = readManifest(PLAYERS_CACHE_DIR).value;
const playersSource = (() => {
  // players.csv is season-agnostic (season: null in its manifest entry) --
  // used only for the QA gsis-to-pfr crosswalk coverage stat below, not for
  // row identity (which is gsis-id-only).
  const entry = playersManifest.files?.find((candidate) => candidate.season === null);
  if (!entry) throw new Error(`Missing season-agnostic players.csv manifest entry in ${PLAYERS_CACHE_DIR}.`);
  const path = join(ROOT, PLAYERS_CACHE_DIR, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { entry, rows: parseCsv(text) as CsvRow[] };
})();
const gsisWithPfr = new Set(
  playersSource.rows.filter((row) => String(row.pfr_id || "").trim()).map((row) => String(row.gsis_id)),
);
const gsisTotal = new Set(playersSource.rows.map((row) => String(row.gsis_id))).size;

const allGames: NflPropRawGameRecord[] = [];
const seasonsWithoutSchedule: number[] = [];
for (const season of seasons) {
  const games = readSeasonGames(season);
  if (!games.length) seasonsWithoutSchedule.push(season);
  allGames.push(...games);
}
const gameJoinIndex = buildGameJoinIndex(allGames);

const rows: NflYardageOutcomeRow[] = [];
const sourceFiles: { season: number; entry: CacheEntry }[] = [];
const skipCounts = emptySkipCounts();
let totalSourceRows = 0;

for (const season of seasons) {
  const stats = verifiedCsvRows(STATS_CACHE_DIR, statsManifest, season);
  if (!stats) throw new Error(`Player-week source for ${season} is not cached. Run npm run fantasy:player-week-cache.`);
  sourceFiles.push({ season, entry: stats.entry });
  for (const source of stats.rows) {
    totalSourceRows += 1;
    const result = normalizeYardageOutcomeRow(source, gameJoinIndex);
    if (result.row == null) {
      skipCounts[result.skipReason as NflYardageOutcomeSkipReason] += 1;
      continue;
    }
    rows.push(result.row);
  }
}

rows.sort(
  (a, b) =>
    a.context.season - b.context.season ||
    a.context.week - b.context.week ||
    a.context.playerId.localeCompare(b.context.playerId),
);

const duplicateKeys = findDuplicateOutcomeKeys(rows);
if (duplicateKeys.length) {
  throw new Error(`Duplicate yardage outcome rows detected: ${duplicateKeys.join(", ")}`);
}
if (!rows.length) throw new Error("Historical yardage outcome generation produced zero rows.");

const gameContext = countGameContextResolution(rows);
const output =
  outputOverride ?? join(DEFAULT_OUTPUT_DIR, `yardage-outcomes-${seasons[0]}-${seasons.at(-1)}.json`);

const artifact = {
  _meta: {
    schemaVersion: "nfl-yardage-outcome-artifact-v1",
    generatedAt,
    source: "nflverse stats_player weekly (cached); public/data/nfl/<season>/games.json (schedule join)",
    seasons,
    rowCount: rows.length,
    coverage: summarizeSeasonCoverage(rows),
    qa: {
      totalSourceRows,
      rowsEmitted: rows.length,
      skippedByReason: skipCounts,
      duplicateKeysDetected: duplicateKeys.length,
      gameContextResolved: gameContext.resolved,
      gameContextUnresolved: gameContext.unresolved,
      playersWithMultipleTeamsInSeason: countPlayersWithMultipleTeamsInSeason(rows),
      seasonsWithoutSchedule,
      playerIdCrosswalk: {
        gsisWithPfrId: gsisWithPfr.size,
        gsisTotal,
      },
    },
    deferred: {
      marketFields: "spread/total/impliedTeamTotal are always null -- no offline per-game historical market cache exists in this repository (see README).",
      availabilityStatus: "always null -- no historical per-week availability join is built in Phase 1 (see README).",
      features: "no model feature category is populated -- Phase 2+ scope.",
      projectionsAndScores: "not generated by this script -- no model has been fit.",
      propEdge: "not generated anywhere -- blocked pending a compliant sportsbook line source (Phase 7).",
    },
    leakagePolicy: [
      "Every outcome and context field uses the row's own exact season/week; no other week's data ever enters a row.",
      "The schedule join (gameId/homeAway/gameDateUtc) is looked up by the row's own season+week+team only.",
      "No rolling, season-to-date, or opponent-strength feature exists in this artifact -- that is out of scope for Phase 1.",
      "No injury, snap, or market snapshot from any week enters this artifact.",
    ],
    sourceFiles,
  },
  rows,
};

writeAtomic(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Generated ${rows.length} yardage outcome rows (from ${totalSourceRows} source rows) at ${output}`);
console.log(`Skipped: ${JSON.stringify(skipCounts)}`);
console.log(`Game context resolved: ${gameContext.resolved} / unresolved: ${gameContext.unresolved}`);
