/** Generates immutable historical player-week outcomes from committed caches. */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { historicalSnapJoinKey, normalizeHistoricalPlayerWeek, PLAYER_WEEK_HISTORY_SCHEMA_VERSION } from "../src/lib/fantasy/weekly/history.ts";
import { FANTASY_SCORING_FORMAT, FANTASY_SCORING_VERSION } from "../src/lib/fantasy/weekly/scoring.ts";
import { normalizeNflTeamAbbr } from "../src/lib/fantasy/weekly/identity.ts";
import { auditPprOutcomes, type PprAuditRow } from "../src/lib/fantasy/weekly/backtest/outcomeAudit.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SEASONS = [2023, 2024, 2025];
const DEFAULT_OUTPUT = join(ROOT, "data", "fantasy", "weekly", "player-week-history-2023-2025.json");

type CsvRow = Record<string, string>;
type CacheEntry = {
  season: number | null;
  filename: string;
  retrievedDateUtc: string;
  [key: string]: unknown;
};
type CacheManifest = { files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args = { seasons: DEFAULT_SEASONS, output: DEFAULT_OUTPUT, generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--seasons=")) args.seasons = raw.slice(10).split(",").map(Number).filter(Number.isInteger);
    else if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!args.seasons.length) throw new Error("No valid seasons requested.");
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be an ISO timestamp.");
  return args;
}

function readManifest(relativeDir: string) {
  const path = join(ROOT, relativeDir, "manifest.json");
  if (!existsSync(path)) throw new Error(`Missing source manifest ${path}`);
  return { path, value: JSON.parse(readFileSync(path, "utf8")) };
}

function verifiedRows(relativeDir: string, manifest: CacheManifest, season: number | null) {
  const entry = manifest.files?.find((candidate) => candidate.season === season);
  if (!entry) return { entry: null, rows: [] };
  const path = join(ROOT, relativeDir, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { entry, rows: parseCsv(text) as CsvRow[] };
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

const { seasons, output, generatedAt } = parseArgs(process.argv);
const statsManifest = readManifest("data/nfl/nflverse/stats-player-week").value;
const playerManifest = readManifest("data/nfl/nflverse/players").value;
const snapManifest = readManifest("data/nfl/nflverse/snap-counts").value;
const playersSource = verifiedRows("data/nfl/nflverse/players", playerManifest, null);
const crosswalk = new Map(playersSource.rows.map((row) => [String(row.gsis_id), {
  pfrId: String(row.pfr_id || "") || null,
  espnId: String(row.espn_id || "") || null,
}]));

const rows = [];
const sourceFiles = [];
let rowsWithoutSnapShare = 0;
const pprAuditRows: PprAuditRow[] = [];

for (const season of seasons) {
  const stats = verifiedRows("data/nfl/nflverse/stats-player-week", statsManifest, season);
  if (!stats.entry) throw new Error(`Player-week source for ${season} is not cached. Run npm run fantasy:player-week-cache.`);
  const snaps = verifiedRows("data/nfl/nflverse/snap-counts", snapManifest, season);
  const snapByKey = new Map<string, { offensiveSnaps: number; snapShare: number }>();
  for (const snap of snaps.rows) {
    if (String(snap.game_type).toUpperCase() !== "REG") continue;
    const pfrId = String(snap.pfr_player_id || "");
    const team = normalizeNflTeamAbbr(String(snap.team || ""));
    const offenseSnaps = Number(snap.offense_snaps);
    const snapShare = Number(snap.offense_pct);
    if (pfrId && team && Number.isFinite(offenseSnaps) && Number.isFinite(snapShare)) {
      snapByKey.set(historicalSnapJoinKey(season, Number(snap.week), pfrId, team), { offensiveSnaps: offenseSnaps, snapShare });
    }
  }

  for (const source of stats.rows) {
    const ids = crosswalk.get(String(source.player_id));
    const team = normalizeNflTeamAbbr(String(source.recent_team || ""));
    const snap = ids?.pfrId && team
      ? snapByKey.get(historicalSnapJoinKey(season, Number(source.week), ids.pfrId, team)) ?? null
      : null;
    const normalized = normalizeHistoricalPlayerWeek(source, ids, snap);
    if (!normalized) continue;
    if (!snap) rowsWithoutSnapShare += 1;
    const upstreamPpr = Number(source.fantasy_points_ppr);
    pprAuditRows.push({
      season, week: normalized.week, playerId: normalized.playerId,
      calculated: normalized.actualFantasyPoints,
      upstream: source.fantasy_points_ppr === "" || !Number.isFinite(upstreamPpr) ? null : upstreamPpr,
    });
    rows.push(normalized);
  }
  sourceFiles.push({ playerStats: stats.entry, snapCounts: snaps.entry });
}

rows.sort((a, b) => a.season - b.season || a.week - b.week || a.playerId.localeCompare(b.playerId));
const keys = new Set<string>();
for (const row of rows) {
  const key = `${row.season}|${row.week}|${row.playerId}`;
  if (keys.has(key)) throw new Error(`Duplicate historical player-week key ${key}`);
  keys.add(key);
}
if (!rows.length) throw new Error("Historical generation produced zero rows.");

const coverage = seasons.flatMap((season) => ["QB", "RB", "WR", "TE"].flatMap((position) => {
  const positionRows = rows.filter((row) => row.season === season && row.position === position);
  return [...new Set(positionRows.map((row) => row.week))].sort((a, b) => a - b).map((week) => {
    const weekRows = positionRows.filter((row) => row.week === week);
    return {
      season, week, position, rows: weekRows.length,
      players: new Set(weekRows.map((row) => row.playerId)).size,
    };
  });
}));
for (const season of seasons) {
  for (const position of ["QB", "RB", "WR", "TE"]) {
    const weeks = coverage.filter((row) => row.season === season && row.position === position).map((row) => row.week);
    if (weeks.length !== 18 || weeks.some((week, index) => week !== index + 1)) {
      throw new Error(`${season} ${position}: incomplete regular-season coverage (${weeks.join(",") || "none"}).`);
    }
  }
}

const artifact = {
  _meta: {
    schemaVersion: PLAYER_WEEK_HISTORY_SCHEMA_VERSION,
    generatedAt,
    source: "nflverse stats_player weekly; optional nflverse/PFR snap_counts exact-week join",
    sourceAsOf: sourceFiles.map((file) => file.playerStats.retrievedDateUtc).sort().at(-1) ?? null,
    scoringFormat: FANTASY_SCORING_FORMAT,
    scoringVersion: FANTASY_SCORING_VERSION,
    seasons,
    minimumWeek: Math.min(...rows.map((row) => row.week)),
    maximumWeek: Math.max(...rows.map((row) => row.week)),
    rowCount: rows.length,
    coverage,
    missing: {
      rowsWithoutSnapShare,
      unavailableFields: ["routes", "routeParticipation", "redZoneTouches", "goalLineTouches", "redZoneTargets"],
    },
    scoringAudit: auditPprOutcomes(pprAuditRows),
    leakagePolicy: [
      "Every stat, team, opponent and optional snap join uses the row's exact season/week.",
      "No end-of-season roster, injury, matchup, market or rolling metric enters this artifact.",
      "Historical pregame market snapshots are not available and are therefore absent.",
    ],
    sourceFiles,
  },
  rows,
};
writeAtomic(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Generated ${rows.length} player-week rows at ${output}`);
