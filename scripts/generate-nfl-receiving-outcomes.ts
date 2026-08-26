/**
 * Phase 6: generates the historical receiving outcome artifact from the
 * Phase 5.5 canonical player-game universe's `receivingEligiblePregame`
 * rows -- INCLUDING true zero-target games. QB excluded (see
 * types/receivingOutcome.ts). Air yards supplemented from the raw
 * stats_player_week source (not carried by the universe/Phase 1 schema).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReceivingOutcomesFromUniverse } from "../src/lib/nfl/props/receivingOutcomes";
import type { NflPlayerGameUniverseRow } from "../src/lib/nfl/props/types/playerGameUniverse";
import type { NflTeamGamePlayVolumeRecord } from "../src/lib/nfl/props/types/teamPregameFeatures";
import type { NflAirYardsSupplement } from "../src/lib/nfl/props/receivingFeatures";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");
const ALL_SEASONS = [2022, 2023, 2024, 2025];

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args = { output: null as string | null, generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}
function readManifest(dir: string): CacheManifest {
  return JSON.parse(readFileSync(join(ROOT, dir, "manifest.json"), "utf8"));
}
function verifiedCsvRows(dir: string, manifest: CacheManifest, season: number) {
  const entry = manifest.files?.find((c) => c.season === season);
  if (!entry) return null;
  const text = readFileSync(join(ROOT, dir, entry.filename), "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return parseCsv(text) as CsvRow[];
}
function toPlayVolumeRecord(row: CsvRow): NflTeamGamePlayVolumeRecord {
  const num = (field: string, integer: boolean) => {
    const value = Number(String(row[field] ?? "").trim());
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) throw new Error(`play-volume field ${field} invalid`);
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
  try { writeFileSync(tmp, text, "utf8"); renameSync(tmp, path); } catch (error) { if (existsSync(tmp)) unlinkSync(tmp); throw error; }
}

const { output: outputOverride, generatedAt } = parseArgs(process.argv);

const universePath = join(DEFAULT_OUTPUT_DIR, `player-game-universe-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
if (!existsSync(universePath)) throw new Error(`Missing ${universePath}. Run npm run nfl:player-game-universe first.`);
const universeArtifact = JSON.parse(readFileSync(universePath, "utf8")) as { rows: NflPlayerGameUniverseRow[] };

const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
for (const season of ALL_SEASONS) {
  const rows = verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season);
  if (!rows) throw new Error(`Play-volume source for ${season} not cached.`);
  for (const row of rows) playVolumeRecords.push(toPlayVolumeRecord(row));
}
const teamPassAttemptsByGameTeam = new Map(playVolumeRecords.map((r) => [`${r.gameId}|${r.team}`, r.passPlays]));

const statsManifest = readManifest(STATS_CACHE_DIR);
const airYardsByPlayerWeek = new Map<string, NflAirYardsSupplement>();
for (const season of ALL_SEASONS) {
  const cache = verifiedCsvRows(STATS_CACHE_DIR, statsManifest, season);
  if (!cache) continue;
  for (const row of cache) {
    if (String(row.season_type ?? "").toUpperCase() !== "REG") continue;
    if (!row.player_id) continue;
    const airYards = Number(row.receiving_air_yards);
    if (!Number.isFinite(airYards)) continue;
    airYardsByPlayerWeek.set(`gsis:${String(row.player_id).trim()}|${season}|${Number(row.week)}`, { airYards });
  }
}

const rows = buildReceivingOutcomesFromUniverse(universeArtifact.rows, teamPassAttemptsByGameTeam);
if (!rows.length) throw new Error("Receiving outcome generation produced zero rows.");

const bySeason = ALL_SEASONS.map((season) => ({ season, rows: rows.filter((r) => r.season === season).length }));
const byPosition = ["RB", "WR", "TE"].map((position) => ({ position, rows: rows.filter((r) => r.position === position).length }));
const zeroTargetRows = rows.filter((r) => r.zeroTargetFlag);
const zeroTargetFromStatsTable = zeroTargetRows.filter((r) => r.membershipSource === "statsTable").length;
const zeroTargetFromActiveRoster = zeroTargetRows.filter((r) => r.membershipSource === "activeRosterConfirmed").length;

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `receiving-outcomes-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
const artifact = {
  _meta: {
    schemaVersion: "nfl-receiving-outcome-artifact-v1",
    generatedAt,
    source: "canonical player-game universe (receivingEligiblePregame rows, RB/WR/TE only -- QB excluded, see docs); play-volume compact cache (team pass-attempts context); stats_player_week (air yards supplement)",
    targetDefinition: "receivingYards: official receiving yards for every pregame-receiving-eligible RB/WR/TE player-game, INCLUDING true zero-target games.",
    seasons: ALL_SEASONS,
    rowCount: rows.length,
    coverageBySeason: bySeason,
    coverageByPosition: byPosition,
    zeroTargetRows: zeroTargetRows.length,
    zeroTargetFromStatsTable,
    zeroTargetFromActiveRosterConfirmed: zeroTargetFromActiveRoster,
    nonZeroTargetRows: rows.length - zeroTargetRows.length,
  },
  rows,
};
writeAtomic(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Generated ${rows.length} receiving outcome rows (${zeroTargetRows.length} zero-target: ${zeroTargetFromStatsTable} stats-row, ${zeroTargetFromActiveRoster} ACT-inferred) at ${output}`);
console.log("By position:", byPosition);
