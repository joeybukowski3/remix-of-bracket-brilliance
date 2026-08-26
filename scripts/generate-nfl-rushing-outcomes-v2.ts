/**
 * Phase 5.5 (5R): rebuilds the rushing outcome artifact from the canonical
 * player-game universe's `rushingEligiblePregame` rows -- INCLUDING true
 * zero-carry games for already-eligible players, correcting the Phase 5
 * gap (`rushing-outcomes-2022-2025.json` only ever contained carries > 0
 * rows). See docs/nfl-player-game-universe.md.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRushingOutcomesFromUniverse } from "../src/lib/nfl/props/rushingOutcomes";
import type { NflPlayerGameUniverseRow } from "../src/lib/nfl/props/types/playerGameUniverse";
import type { NflTeamGamePlayVolumeRecord } from "../src/lib/nfl/props/types/teamPregameFeatures";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");

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
function readManifest(relativeDir: string): CacheManifest {
  return JSON.parse(readFileSync(join(ROOT, relativeDir, "manifest.json"), "utf8"));
}
function verifiedCsvRows(relativeDir: string, manifest: CacheManifest, season: number) {
  const entry = manifest.files?.find((c) => c.season === season);
  if (!entry) return null;
  const path = join(ROOT, relativeDir, entry.filename);
  const text = readFileSync(path, "utf8");
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
const ALL_SEASONS = [2022, 2023, 2024, 2025];

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
const teamRushAttemptsByGameTeam = new Map(playVolumeRecords.map((r) => [`${r.gameId}|${r.team}`, r.rushPlays]));

const rows = buildRushingOutcomesFromUniverse(universeArtifact.rows, teamRushAttemptsByGameTeam);
if (!rows.length) throw new Error("Corrected rushing outcome generation produced zero rows.");

const bySeason = ALL_SEASONS.map((season) => ({ season, rows: rows.filter((r) => r.season === season).length }));
const byPosition = ["QB", "RB", "WR", "TE"].map((position) => ({ position, rows: rows.filter((r) => r.position === position).length }));
const zeroCarryRows = rows.filter((r) => r.carries === 0).length;

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `rushing-outcomes-v2-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
const artifact = {
  _meta: {
    schemaVersion: "nfl-rushing-outcome-v2-artifact-v1",
    generatedAt,
    source: "canonical player-game universe (rushingEligiblePregame rows); play-volume compact cache (team rush-attempts context)",
    targetDefinition: "rushingYards: official rushing yards for every pregame-rushing-eligible QB/RB/WR/TE player-game, INCLUDING true zero-carry games (corrected from Phase 5, which only included carries > 0 rows).",
    seasons: ALL_SEASONS,
    rowCount: rows.length,
    coverageBySeason: bySeason,
    coverageByPosition: byPosition,
    zeroCarryRows,
    nonZeroCarryRows: rows.length - zeroCarryRows,
  },
  rows,
};
writeAtomic(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Generated ${rows.length} corrected rushing outcome rows (${zeroCarryRows} zero-carry) at ${output}`);
console.log("By position:", byPosition);
