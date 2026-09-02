/**
 * WU4B S1 — build the historical positional-pool + player-share dataset.
 *
 * Research artifact only. Reads existing outcome artifacts + compact
 * caches; writes `data/nfl/props/role-allocation-dataset-2022-2025.json`.
 * Does not touch any production archive, model, or public artifact.
 *
 *   npx tsx scripts/analysis/nfl-role-allocation/build-dataset.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../../../src/lib/nfl/props/historicalOutcomes";
import type { NflRushingOutcome } from "../../../src/lib/nfl/props/types/rushingOutcome";
import type { NflReceivingOutcome } from "../../../src/lib/nfl/props/types/receivingOutcome";
import {
  assembleDataset,
  buildReceivingShareRows,
  buildRushShareRows,
  buildTeamPositionalPools,
  type NflPoolPlayVolume,
  type NflPoolTeamWeek,
  type NflWeeklyRosterEntry,
} from "../../../src/lib/nfl/props/roleAllocation/dataset";
import { buildTeamTopRbCarryShareByGameTeam } from "../../../src/lib/nfl/props/rushingFeatures";
import { parseCsv } from "../../lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "../../lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SEASONS = [2022, 2023, 2024, 2025];
const PROPS_DIR = join(ROOT, "data", "nfl", "props");

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; [k: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function readManifest(rel: string): CacheManifest {
  return JSON.parse(readFileSync(join(ROOT, rel, "manifest.json"), "utf8"));
}
function verifiedRows(rel: string, manifest: CacheManifest, season: number): CsvRow[] {
  const entry = manifest.files?.find((c) => c.season === season);
  if (!entry) throw new Error(`${rel} not cached for ${season}`);
  const text = readFileSync(join(ROOT, rel, entry.filename), "utf8");
  const problems = verifyCacheEntry(entry as never, text);
  if (problems.length) throw new Error(`${rel} ${season}: ${problems.join("; ")}`);
  return parseCsv(text) as CsvRow[];
}
function readSeasonGames(season: number): (NflPropRawGameRecord & { isDome?: boolean })[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { games?: (NflPropRawGameRecord & { isDome?: boolean })[] };
  return Array.isArray(parsed.games) ? parsed.games : [];
}
function writeAtomic(path: string, text: string): void {
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
/** stats_team_week uses raw nflverse codes (LA, WAS); the compact caches + outcomes use canonical site codes. */
const TEAM_ALIAS: Record<string, string> = { la: "lar", lar: "lar", was: "wsh", wsh: "wsh", jac: "jax", ari: "ari", az: "ari" };
function canonTeam(raw: string): string {
  const t = raw.trim().toLowerCase();
  return TEAM_ALIAS[t] ?? t;
}
function n(v: string | undefined): number {
  const x = Number(String(v ?? "").trim());
  return Number.isFinite(x) ? x : 0;
}

// --- outcome artifacts -------------------------------------------------------
const rushPath = join(PROPS_DIR, "rushing-outcomes-v2-2022-2025.json");
const recPath = join(PROPS_DIR, "receiving-outcomes-2022-2025.json");
if (!existsSync(rushPath) || !existsSync(recPath)) throw new Error("Missing rushing-outcomes-v2 / receiving-outcomes artifacts.");
const rushingOutcomes = (JSON.parse(readFileSync(rushPath, "utf8")) as { rows: NflRushingOutcome[] }).rows;
const receivingOutcomes = (JSON.parse(readFileSync(recPath, "utf8")) as { rows: NflReceivingOutcome[] }).rows;

// --- compact caches ---------------------------------------------------------
const pvManifest = readManifest("data/nfl/nflverse/play-volume-team-game");
const twManifest = readManifest("data/nfl/nflverse/stats-team-week");
const rosterManifest = readManifest("data/nfl/nflverse/weekly-rosters");

const playVolumeByTeamGame = new Map<string, NflPoolPlayVolume>();
const teamWeekByTeamGame = new Map<string, NflPoolTeamWeek>();
const allGames: (NflPropRawGameRecord & { isDome?: boolean })[] = [];
const rosterEntries: NflWeeklyRosterEntry[] = [];

for (const season of SEASONS) {
  for (const row of verifiedRows("data/nfl/nflverse/play-volume-team-game", pvManifest, season)) {
    const key = `${String(row.game_id).trim()}|${String(row.team).trim()}`;
    playVolumeByTeamGame.set(key, { designedRushes: n(row.rush_plays), dropbacks: n(row.pass_plays) });
  }
  for (const row of verifiedRows("data/nfl/nflverse/stats-team-week", twManifest, season)) {
    const key = `${String(row.game_id).trim()}|${canonTeam(String(row.team))}`;
    teamWeekByTeamGame.set(key, { teamPassAttempts: n(row.attempts), sacks: n(row.sacks_suffered), teamTargets: n(row.targets) });
  }
  allGames.push(...readSeasonGames(season));
  if (rosterManifest.files?.some((c) => c.season === season)) {
    for (const row of verifiedRows("data/nfl/nflverse/weekly-rosters", rosterManifest, season)) {
      const gsis = String(row.gsis_id ?? "").trim();
      rosterEntries.push({
        season,
        week: n(row.week),
        team: canonTeam(String(row.team ?? "")),
        playerId: gsis ? `gsis:${gsis}` : "",
        position: String(row.position ?? "").trim(),
        status: String(row.status ?? "").trim(),
      });
    }
  }
}

const gameJoinIndex = buildGameJoinIndex(allGames);

// --- roster indexes --------------------------------------------------------
const rosterTeamBySeasonWeekPlayer = new Map<string, string>();
const rosterByTeamWeek = new Map<string, NflWeeklyRosterEntry[]>();
for (const e of rosterEntries) {
  if (e.playerId) rosterTeamBySeasonWeekPlayer.set(`${e.season}|${e.week}|${e.playerId}`, e.team);
  const k = `${e.season}|${e.week}|${e.team}`;
  const list = rosterByTeamWeek.get(k) ?? [];
  list.push(e);
  rosterByTeamWeek.set(k, list);
}

// --- top-target concentration proxy --------------------------------------
const teamTopTargetShareByGameTeam = new Map<string, number>();
for (const o of receivingOutcomes) {
  if (!o.gameId || o.position !== "WR" || o.targetShare == null) continue;
  const k = `${o.gameId}|${o.team}`;
  teamTopTargetShareByGameTeam.set(k, Math.max(teamTopTargetShareByGameTeam.get(k) ?? 0, o.targetShare));
}
const teamTopRbCarryShareByGameTeam = buildTeamTopRbCarryShareByGameTeam(rushingOutcomes);

// --- build ---------------------------------------------------------------
const pools = buildTeamPositionalPools({ rushingOutcomes, playVolumeByTeamGame, teamWeekByTeamGame, gameJoinIndex });
const rushShares = buildRushShareRows({
  rushingOutcomes,
  pools,
  gameJoinIndex,
  rosterTeamBySeasonWeekPlayer,
  rosterByTeamWeek,
  teamTopRbCarryShareByGameTeam,
});
const receivingShares = buildReceivingShareRows({
  receivingOutcomes,
  pools,
  gameJoinIndex,
  rosterTeamBySeasonWeekPlayer,
  rosterByTeamWeek,
  teamTopTargetShareByGameTeam,
});

// gameJoinIndex is REG-season only (postseason has no player-week / play-volume rows), so
// expected team-games is its size, not the raw schedule which also carries playoffs.
const teamGamesExpected = gameJoinIndex.size;
const dataset = assembleDataset({
  generatedAt: new Date().toISOString(),
  seasons: SEASONS,
  pools,
  rushShares,
  receivingShares,
  teamGamesExpected,
});

const outPath = join(PROPS_DIR, "role-allocation-dataset-2022-2025.json");
writeAtomic(outPath, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
console.log("QA:", JSON.stringify(dataset.qa, null, 2));
