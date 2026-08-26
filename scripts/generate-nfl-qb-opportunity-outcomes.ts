/**
 * Phase 3: generates the historical QB passing-opportunity outcome
 * artifact. Ground truth only -- no projection, no model. Builds Phase 1
 * player-week outcome rows in-memory (same normalization function Phase 1
 * uses) rather than depending on Phase 1's own committed artifact, so this
 * script has no large intermediate file to commit.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, normalizeYardageOutcomeRow, type NflPropRawGameRecord, type NflYardageOutcomeRow } from "../src/lib/nfl/props/historicalOutcomes";
import { buildQbOpportunityOutcomes, indexTeamDropbacks } from "../src/lib/nfl/props/qbOpportunityOutcomes";
import type { NflTeamGamePlayVolumeRecord } from "../src/lib/nfl/props/types/teamPregameFeatures";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; retrievedDateUtc: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args: { seasons: number[] | null; output: string | null; generatedAt: string } = {
    seasons: null, output: null, generatedAt: new Date().toISOString(),
  };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--seasons=")) args.seasons = raw.slice(10).split(",").map(Number).filter(Number.isInteger);
    else if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function readManifest(relativeDir: string): CacheManifest {
  const path = join(ROOT, relativeDir, "manifest.json");
  if (!existsSync(path)) throw new Error(`Missing source manifest ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function verifiedCsvRows(relativeDir: string, manifest: CacheManifest, season: number) {
  const entry = manifest.files?.find((c) => c.season === season);
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

function toPlayVolumeRecord(row: CsvRow): NflTeamGamePlayVolumeRecord {
  const num = (field: string, integer: boolean) => {
    const text = String(row[field] ?? "").trim();
    if (text === "") throw new Error(`compact play-volume row missing ${field}`);
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`compact play-volume row field ${field} is not finite`);
    if (integer && !Number.isInteger(value)) throw new Error(`compact play-volume row field ${field} must be an integer`);
    return value;
  };
  return {
    gameId: String(row.game_id ?? "").trim(), season: num("season", true), week: num("week", true),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    eligiblePlays: num("eligible_plays", true), passPlays: num("pass_plays", true), rushPlays: num("rush_plays", true),
    neutralEligiblePlays: num("neutral_eligible_plays", true), neutralPassPlays: num("neutral_pass_plays", true),
    passOeSum: num("pass_oe_sum", false), passOeCount: num("pass_oe_count", true),
  };
}

function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (error) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw error;
  }
}

const { seasons: requestedSeasons, output: outputOverride, generatedAt } = parseArgs(process.argv);

const statsManifest = readManifest(STATS_CACHE_DIR);
const availableSeasons = (statsManifest.files ?? [])
  .map((e) => e.season).filter((s): s is number => Number.isInteger(s)).sort((a, b) => a - b);
if (!availableSeasons.length) throw new Error(`No cached seasons in ${STATS_CACHE_DIR}.`);
const seasons = requestedSeasons ?? availableSeasons;

const allGames: NflPropRawGameRecord[] = [];
for (const season of seasons) allGames.push(...readSeasonGames(season));
const gameJoinIndex = buildGameJoinIndex(allGames);

const yardageOutcomeRows: NflYardageOutcomeRow[] = [];
for (const season of seasons) {
  const cache = verifiedCsvRows(STATS_CACHE_DIR, statsManifest, season);
  if (!cache) throw new Error(`Player-week source for ${season} is not cached.`);
  for (const source of cache.rows) {
    const result = normalizeYardageOutcomeRow(source, gameJoinIndex);
    if (result.row) yardageOutcomeRows.push(result.row);
  }
}

const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
for (const season of seasons) {
  const cache = verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season);
  if (!cache) throw new Error(`Play-volume source for ${season} is not cached. Run npm run nfl:play-volume-cache.`);
  for (const row of cache.rows) playVolumeRecords.push(toPlayVolumeRecord(row));
}
const teamDropbacksByGameTeam = indexTeamDropbacks(playVolumeRecords);

const rows = buildQbOpportunityOutcomes(yardageOutcomeRows, teamDropbacksByGameTeam);
if (!rows.length) throw new Error("QB opportunity outcome generation produced zero rows.");

const bySeason = seasons.map((season) => ({ season, rows: rows.filter((r) => r.season === season).length }));
const multiQbRows = rows.filter((r) => r.instabilityCategory === "multiQbGame").length;
const unresolvedGameContext = rows.filter((r) => r.gameId == null).length;

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `qb-opportunity-outcomes-${seasons[0]}-${seasons.at(-1)}.json`);
const artifact = {
  _meta: {
    schemaVersion: "nfl-qb-opportunity-outcome-artifact-v1",
    generatedAt,
    source: "nflverse stats_player weekly (Phase 1 normalization, in-memory); play-volume compact cache (Phase 2, team-dropback context)",
    targetDefinition: "primaryQbAttempts: the official pass-attempt total (not a sack/scramble-inclusive dropback figure) of the team's leading passer that week -- see docs/nfl-qb-opportunity-baseline-competition.md 'Target definition'.",
    seasons,
    rowCount: rows.length,
    coverageBySeason: bySeason,
    multiQbGameRows: multiQbRows,
    singleQbGameRows: rows.length - multiQbRows,
    unresolvedGameContext,
    leakagePolicy: [
      "Every field describes the target team-game's own outcome only -- this is ground truth, not a prediction.",
      "instabilityCategory and primaryQbAttemptShare are outcome-derived and must never be used as a MODEL FEATURE for that same game -- diagnostic/reporting use only.",
    ],
  },
  rows,
};
writeAtomic(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Generated ${rows.length} QB opportunity outcome rows (${multiQbRows} multi-QB) at ${output}`);
