/**
 * Phase 4: generates the historical QB passing outcome artifact (target:
 * `primaryQbPassingYards`). Builds Phase 1 outcome rows in-memory (same
 * normalization as Phase 1/3) plus a supplemental completions/TD/INT
 * lookup read directly from the same stats_player_week cache, since Phase
 * 1's committed schema deliberately does not carry those fields.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, normalizeYardageOutcomeRow, type NflPropRawGameRecord, type NflYardageOutcomeRow } from "../src/lib/nfl/props/historicalOutcomes";
import { buildQbPassingOutcomes, supplementalKey, type NflQbSupplementalStats } from "../src/lib/nfl/props/qbPassingOutcomes";
import { indexTeamDropbacks } from "../src/lib/nfl/props/qbOpportunityOutcomes";
import type { NflTeamGamePlayVolumeRecord } from "../src/lib/nfl/props/types/teamPregameFeatures";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; [key: string]: unknown };
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
  return Array.isArray(parsed.games) ? parsed.games : [];
}

function toPlayVolumeRecord(row: CsvRow): NflTeamGamePlayVolumeRecord {
  const num = (field: string, integer: boolean) => {
    const text = String(row[field] ?? "").trim();
    const value = Number(text);
    if (text === "" || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
      throw new Error(`compact play-volume row field ${field} invalid: "${row[field]}"`);
    }
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
const seasons = requestedSeasons ?? availableSeasons;

const allGames: NflPropRawGameRecord[] = [];
for (const season of seasons) allGames.push(...readSeasonGames(season));
const gameJoinIndex = buildGameJoinIndex(allGames);

const yardageOutcomeRows: NflYardageOutcomeRow[] = [];
const supplementalByPlayerWeek = new Map<string, NflQbSupplementalStats>();
for (const season of seasons) {
  const cache = verifiedCsvRows(STATS_CACHE_DIR, statsManifest, season);
  if (!cache) throw new Error(`Player-week source for ${season} is not cached.`);
  for (const source of cache.rows) {
    const result = normalizeYardageOutcomeRow(source, gameJoinIndex);
    if (result.row) yardageOutcomeRows.push(result.row);
    if (String(source.position) === "QB" && String(source.season_type).toUpperCase() === "REG") {
      const playerId = `gsis:${String(source.player_id ?? "").trim()}`;
      const week = Number(source.week);
      if (source.player_id && Number.isInteger(week)) {
        supplementalByPlayerWeek.set(supplementalKey(playerId, season, week), {
          completions: Number(source.completions) || 0,
          passingTds: Number(source.passing_tds) || 0,
          interceptions: Number(source.interceptions) || 0,
        });
      }
    }
  }
}

const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
for (const season of seasons) {
  const cache = verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season);
  if (!cache) throw new Error(`Play-volume source for ${season} is not cached.`);
  for (const row of cache.rows) playVolumeRecords.push(toPlayVolumeRecord(row));
}
const teamDropbacksByGameTeam = indexTeamDropbacks(playVolumeRecords);

const rows = buildQbPassingOutcomes(yardageOutcomeRows, teamDropbacksByGameTeam, supplementalByPlayerWeek);
if (!rows.length) throw new Error("QB passing outcome generation produced zero rows.");

const bySeason = seasons.map((season) => ({ season, rows: rows.filter((r) => r.season === season).length }));
const multiQbRows = rows.filter((r) => r.instabilityCategory === "multiQbGame").length;

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `qb-passing-outcomes-${seasons[0]}-${seasons.at(-1)}.json`);
const artifact = {
  _meta: {
    schemaVersion: "nfl-qb-passing-outcome-artifact-v1",
    generatedAt,
    source: "nflverse stats_player weekly (Phase 1 normalization + supplemental completions/TD/INT, in-memory); play-volume compact cache (team-dropback context)",
    targetDefinition: "primaryQbPassingYards: the official passing yards of the team's leading passer (by attempts) that week. No row is dropped for multi-QB status, injury, benching, or poor performance.",
    seasons,
    rowCount: rows.length,
    coverageBySeason: bySeason,
    multiQbGameRows: multiQbRows,
    singleQbGameRows: rows.length - multiQbRows,
  },
  rows,
};
writeAtomic(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Generated ${rows.length} QB passing outcome rows (${multiQbRows} multi-QB) at ${output}`);
