/**
 * Phase 5.5: generates the canonical NFL player-game projection universe.
 * Two membership tiers -- see src/lib/nfl/props/playerGameUniverse.ts and
 * docs/nfl-player-game-universe.md:
 *   1. statsTable: every Phase 1 outcome row (already unfiltered by stat
 *      value) for QB/RB/WR/TE.
 *   2. activeRosterConfirmed: a skill-position player confirmed ACT in
 *      weekly_rosters for an exact team-week with no stats-table row
 *      (2023-2025 only).
 * Market-specific pregame eligibility (rushing/receiving/passing) is
 * computed from each row's own prior-game activity only.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, normalizeYardageOutcomeRow, type NflPropRawGameRecord, type NflYardageOutcomeRow } from "../src/lib/nfl/props/historicalOutcomes";
import { buildPlayerGameUniverse, type NflRosterStatusRow } from "../src/lib/nfl/props/playerGameUniverse";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
const ROSTER_CACHE_DIR = "data/nfl/nflverse/weekly-rosters";
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args: { seasons: number[] | null; output: string | null; generatedAt: string } = { seasons: null, output: null, generatedAt: new Date().toISOString() };
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

function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try { writeFileSync(tmp, text, "utf8"); renameSync(tmp, path); } catch (error) { if (existsSync(tmp)) unlinkSync(tmp); throw error; }
}

const { seasons: requestedSeasons, output: outputOverride, generatedAt } = parseArgs(process.argv);

const statsManifest = readManifest(STATS_CACHE_DIR);
const availableSeasons = (statsManifest.files ?? []).map((e) => e.season).filter((s): s is number => Number.isInteger(s)).sort((a, b) => a - b);
const seasons = requestedSeasons ?? availableSeasons;

const rosterManifest = readManifest(ROSTER_CACHE_DIR);
const rosterAvailableSeasons = new Set((rosterManifest.files ?? []).map((e) => e.season).filter((s): s is number => Number.isInteger(s) && seasons.includes(s)));

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

const rosterRows: NflRosterStatusRow[] = [];
for (const season of rosterAvailableSeasons) {
  const cache = verifiedCsvRows(ROSTER_CACHE_DIR, rosterManifest, season);
  if (!cache) continue;
  for (const row of cache.rows) {
    if (String(row.game_type ?? "").toUpperCase() !== "REG") continue;
    const week = Number(row.week);
    if (!Number.isInteger(week)) continue;
    if (!row.gsis_id) continue;
    rosterRows.push({
      season, week, team: String(row.team ?? ""), playerId: `gsis:${String(row.gsis_id).trim()}`,
      playerName: String(row.full_name ?? ""), position: String(row.position ?? ""), status: String(row.status ?? ""),
    });
  }
}

const universe = buildPlayerGameUniverse(yardageOutcomeRows, rosterRows, gameJoinIndex, allGames, rosterAvailableSeasons);
if (!universe.length) throw new Error("Player-game universe generation produced zero rows.");

// --- QA -------------------------------------------------------------------

const duplicateKeys = new Set<string>();
{
  const seen = new Set<string>();
  for (const row of universe) {
    const key = `${row.season}|${row.week}|${row.gameId ?? "?"}|${row.playerId}`;
    if (seen.has(key)) duplicateKeys.add(key);
    seen.add(key);
  }
}

function count(pred: (r: (typeof universe)[number]) => boolean): number {
  return universe.filter(pred).length;
}

const bySeason = seasons.map((season) => {
  const seasonRows = universe.filter((r) => r.season === season);
  return {
    season,
    totalRows: seasonRows.length,
    byPosition: ["QB", "RB", "WR", "TE"].map((position) => ({ position, rows: seasonRows.filter((r) => r.position === position).length })),
    rushingEligible: seasonRows.filter((r) => r.eligibility.rushingEligiblePregame).length,
    receivingEligible: seasonRows.filter((r) => r.eligibility.receivingEligiblePregame).length,
    passingEligible: seasonRows.filter((r) => r.eligibility.passingEligiblePregame).length,
    zeroCarries: seasonRows.filter((r) => r.outcomes.carries === 0).length,
    zeroTargets: seasonRows.filter((r) => r.outcomes.targets === 0).length,
    zeroReceptions: seasonRows.filter((r) => r.outcomes.receptions === 0).length,
    zeroReceivingYards: seasonRows.filter((r) => r.outcomes.receivingYards === 0).length,
    zeroRushingYards: seasonRows.filter((r) => r.outcomes.rushingYards === 0).length,
    activeRosterConfirmedRows: seasonRows.filter((r) => r.membershipSource === "activeRosterConfirmed").length,
    unresolvedGameContext: seasonRows.filter((r) => r.gameId == null).length,
  };
});

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `player-game-universe-${seasons[0]}-${seasons.at(-1)}.json`);
const artifact = {
  _meta: {
    schemaVersion: "nfl-player-game-universe-artifact-v1",
    generatedAt,
    source: "nflverse stats_player weekly (statsTable tier); nflverse weekly_rosters ACT status (activeRosterConfirmed tier, 2023-2025 only)",
    seasons,
    rosterCoverageSeasons: [...rosterAvailableSeasons].sort(),
    rowCount: universe.length,
    duplicateKeysDetected: duplicateKeys.size,
    membershipCounts: {
      statsTable: count((r) => r.membershipSource === "statsTable"),
      activeRosterConfirmed: count((r) => r.membershipSource === "activeRosterConfirmed"),
    },
    bySeason,
    zeroVsMissingPolicy: [
      "membershipSource=statsTable: every outcome field is the source's own recorded value, including a true zero in any single category (the player definitely played that week).",
      "membershipSource=activeRosterConfirmed: every outcome field is set to 0 (the player was confirmed ACT -- distinct from the source's own explicit INA status -- for that exact team-week with no stats-table row).",
      "A player absent from both the stats table and (for 2023-2025) confirmed as anything other than ACT (e.g. INA, RES, CUT) is NOT represented as a universe row at all -- never coerced to a zero.",
      "2022 has no weekly_rosters cache; universe rows for 2022 come from the statsTable tier only, so a 2022 zero-everything inactive week is not recoverable and is a documented gap.",
    ],
  },
  rows: universe,
};
writeAtomic(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Generated ${universe.length} player-game universe rows at ${output}`);
console.log("By season:", JSON.stringify(bySeason, null, 2));
