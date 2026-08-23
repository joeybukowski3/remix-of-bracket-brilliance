/**
 * DATASET FOUNDATION generator (Phase 1, research-only). Builds a canonical,
 * leakage-safe historical player-week modeling dataset for QB/RB/WR/TE weekly
 * fantasy point projections. This script does NOT train or select a model.
 *
 * Output lives under data/fantasy/projections/ (gitignored generated research
 * output), never under public/data/fantasy/weekly (production authority).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FantasyPosition } from "../src/lib/fantasy/rankings.ts";
import { buildTrainingDataset, type HistoricalTeamGameRow, type ScheduleTeamWeek, type UniverseCandidate } from "../src/lib/fantasy/weekly/projections/build.ts";
import { WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION } from "../src/lib/fantasy/weekly/projections/contract.ts";
import { buildProjectionCoverageReport } from "../src/lib/fantasy/weekly/projections/coverage.ts";
import {
  buildHistoricalRankingUniverse,
  type HistoricalInjuryWeek,
  type HistoricalRosterWeek,
  type HistoricalScheduleTeamWeek,
} from "../src/lib/fantasy/weekly/backtest/universe.ts";
import { auditPprOutcomes, type PprAuditRow } from "../src/lib/fantasy/weekly/backtest/outcomeAudit.ts";
import { historicalSnapJoinKey, normalizeHistoricalPlayerWeek, PLAYER_WEEK_HISTORY_SCHEMA_VERSION, type HistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";
import { normalizeNflTeamAbbr } from "../src/lib/fantasy/weekly/identity.ts";
import { FANTASY_SCORING_VERSION } from "../src/lib/fantasy/weekly/scoring.ts";
import { parseCsv, NFL_GAMES_SOURCE_URL } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH_DIR = join(ROOT, "data", "fantasy", "projections");
const HISTORY_PATH = join(ROOT, "data", "fantasy", "weekly", "player-week-history-2023-2025.json");
const PRIOR_SEASON = 2022;
const MODELED_SEASONS = [2023, 2024, 2025];
const POSITIONS: FantasyPosition[] = ["QB", "RB", "WR", "TE"];
const USER_AGENT = "JoeKnowsBall-fantasy-weekly-projections/1.0 (+https://www.joeknowsball.com)";

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; retrievedDateUtc: string; sha256: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args = { generatedAt: new Date().toISOString(), offlineSchedule: null as string | null };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else if (raw.startsWith("--offline-schedule=")) args.offlineSchedule = resolve(ROOT, raw.slice(19));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be an ISO timestamp.");
  return args;
}

function writeAtomic(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function readManifest(relativeDir: string): CacheManifest {
  const path = join(ROOT, relativeDir, "manifest.json");
  if (!existsSync(path)) throw new Error(`Missing source manifest ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as CacheManifest;
}

/**
 * Windows checkouts of this repo apply core.autocrlf=true, which rewrites the
 * committed LF line endings to CRLF on disk. That changes byte size/sha256
 * without changing logical content, so manifest verification normalizes CRLF
 * to LF before hashing/parsing (never before: this only reads local disk
 * state, it never rewrites the committed cache files themselves).
 */
function verifiedRows(relativeDir: string, season: number | null, requiredHeaders: readonly string[] = []) {
  const manifest = readManifest(relativeDir);
  const entry = manifest.files?.find((candidate) => candidate.season === season);
  if (!entry) throw new Error(`${relativeDir}: missing season ${season} manifest entry`);
  const path = join(ROOT, relativeDir, entry.filename);
  const rawText = readFileSync(path, "utf8");
  const text = rawText.includes("\r\n") ? rawText.replace(/\r\n/g, "\n") : rawText;
  const problems = verifyCacheEntry(entry, text, { requiredHeaders: [...requiredHeaders] });
  if (problems.length) throw new Error(`${relativeDir} ${season}: ${problems.join("; ")}`);
  return { rows: parseCsv(text) as CsvRow[], entry };
}

function numberField(row: CsvRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${key} in historical source.`);
  return value;
}

function practiceStatus(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === "NOTE") return null;
  if (normalized === "DID NOT PARTICIPATE IN PRACTICE") return "DID_NOT_PARTICIPATE";
  if (normalized === "LIMITED PARTICIPATION IN PRACTICE") return "LIMITED";
  if (normalized === "FULL PARTICIPATION IN PRACTICE") return "FULL";
  throw new Error(`Unknown historical practice status: ${value}`);
}

/** Builds normalized 2022 HistoricalPlayerWeek rows purely as a prior-season input source. No 2022 universe/eligibility is modeled. */
function build2022PriorSeasonRows(crosswalk: Map<string, { pfrId: string | null; espnId: string | null }>) {
  const stats = verifiedRows("data/nfl/nflverse/stats-player-week", PRIOR_SEASON);
  const rows: HistoricalPlayerWeek[] = [];
  const pprAuditRows: PprAuditRow[] = [];
  for (const source of stats.rows) {
    const ids = crosswalk.get(String(source.player_id));
    const normalized = normalizeHistoricalPlayerWeek(source, ids, null);
    if (!normalized) continue;
    rows.push(normalized);
    const upstreamPpr = Number(source.fantasy_points_ppr);
    pprAuditRows.push({
      season: PRIOR_SEASON, week: normalized.week, playerId: normalized.playerId,
      calculated: normalized.actualFantasyPoints,
      upstream: source.fantasy_points_ppr === "" || !Number.isFinite(upstreamPpr) ? null : upstreamPpr,
    });
  }
  return { rows, entry: stats.entry, pprAudit: auditPprOutcomes(pprAuditRows) };
}

function loadModeledSeasonInputs() {
  const rosters: HistoricalRosterWeek[] = [];
  const injuries: HistoricalInjuryWeek[] = [];
  const schedule: HistoricalScheduleTeamWeek[] = [];
  const teamHistory: HistoricalTeamGameRow[] = [];
  const snapRows: CsvRow[] = [];
  const sourceFiles: unknown[] = [];
  for (const season of MODELED_SEASONS) {
    const roster = verifiedRows("data/nfl/nflverse/weekly-rosters", season, [
      "season", "week", "team", "gsis_id", "full_name", "position", "status",
    ]);
    const injury = verifiedRows("data/nfl/nflverse/injuries", season, [
      "season", "week", "gsis_id", "report_status", "practice_status",
    ]);
    const teamStats = verifiedRows("data/nfl/nflverse/stats-team-week", season, [
      "season", "week", "team", "opponent_team", "season_type",
    ]);
    const epa = verifiedRows("data/nfl/nflverse/epa-team-game", season, [
      "season", "week", "team", "opponent", "off_epa", "off_plays", "pass_epa", "pass_plays", "rush_epa", "rush_plays",
    ]);
    const snaps = verifiedRows("data/nfl/nflverse/snap-counts", season, [
      "season", "week", "team", "pfr_player_id", "game_type", "offense_snaps", "offense_pct",
    ]);
    rosters.push(...roster.rows.filter((row) => row.game_type.toUpperCase() === "REG").map((row) => ({
      season: numberField(row, "season"), week: numberField(row, "week"), team: row.team,
      gsisId: row.gsis_id || null, pfrId: row.pfr_id || null, espnId: row.espn_id || null,
      playerName: row.full_name, position: row.position, rosterStatus: row.status || null,
    })));
    injuries.push(...injury.rows.filter((row) => String(row.season_type || row.game_type).toUpperCase() === "REG").map((row) => ({
      season: numberField(row, "season"), week: numberField(row, "week"), gsisId: row.gsis_id,
      reportStatus: row.report_status || null, practiceStatus: practiceStatus(row.practice_status),
    })));
    schedule.push(...teamStats.rows.filter((row) => row.season_type.toUpperCase() === "REG").map((row) => ({
      season: numberField(row, "season"), week: numberField(row, "week"), team: row.team, opponent: row.opponent_team,
    })));
    teamHistory.push(...epa.rows.map((row) => ({
      season: numberField(row, "season"), week: numberField(row, "week"),
      team: normalizeNflTeamAbbr(row.team) ?? row.team, opponent: normalizeNflTeamAbbr(row.opponent) ?? row.opponent,
      offEpa: numberField(row, "off_epa"), offPlays: numberField(row, "off_plays"),
      passEpa: numberField(row, "pass_epa"), passPlays: numberField(row, "pass_plays"),
      rushEpa: numberField(row, "rush_epa"), rushPlays: numberField(row, "rush_plays"),
    })));
    snapRows.push(...snaps.rows.filter((row) => String(row.game_type).toUpperCase() === "REG"));
    sourceFiles.push({ season, roster: roster.entry, injury: injury.entry, teamStats: teamStats.entry, epa: epa.entry, snaps: snaps.entry });
  }
  return { rosters, injuries, schedule, teamHistory, snapRows, sourceFiles };
}

async function fetchScheduleText(offlinePath: string | null): Promise<string> {
  if (offlinePath) return readFileSync(offlinePath, "utf8");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(NFL_GAMES_SOURCE_URL, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    if (!response.ok) throw new Error(`${NFL_GAMES_SOURCE_URL}: HTTP ${response.status}`);
    const text = await response.text();
    if (!text.trim()) throw new Error(`${NFL_GAMES_SOURCE_URL}: empty response`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Builds team-week schedule context (home/away, kickoff date, rest days) for the modeled seasons. */
function buildScheduleTeamWeeks(gamesText: string): ScheduleTeamWeek[] {
  const rows = parseCsv(gamesText) as CsvRow[];
  const out: ScheduleTeamWeek[] = [];
  for (const row of rows) {
    const season = Number(row.season);
    if (!MODELED_SEASONS.includes(season)) continue;
    if (String(row.game_type).toUpperCase() !== "REG") continue;
    const week = Number(row.week);
    const home = normalizeNflTeamAbbr(row.home_team);
    const away = normalizeNflTeamAbbr(row.away_team);
    if (!home || !away || !Number.isInteger(week)) continue;
    const homeRest = row.home_rest === "" ? null : Number(row.home_rest);
    const awayRest = row.away_rest === "" ? null : Number(row.away_rest);
    const kickoff = row.gameday || null;
    out.push({ season, week, team: home, opponent: away, homeAway: "home", kickoff, restDays: Number.isFinite(homeRest as number) ? homeRest : null });
    out.push({ season, week, team: away, opponent: home, homeAway: "away", kickoff, restDays: Number.isFinite(awayRest as number) ? awayRest : null });
  }
  return out;
}

async function main() {
  const { generatedAt, offlineSchedule } = parseArgs(process.argv);

  const playerManifest = readManifest("data/nfl/nflverse/players");
  const playersEntry = verifiedRows("data/nfl/nflverse/players", null);
  const crosswalk = new Map(playersEntry.rows.map((row) => [String(row.gsis_id), {
    pfrId: String(row.pfr_id || "") || null,
    espnId: String(row.espn_id || "") || null,
  }]));

  if (!existsSync(HISTORY_PATH)) {
    throw new Error(`Missing ${HISTORY_PATH}. Run: npm run fantasy:player-week-history`);
  }
  const historyArtifact = JSON.parse(readFileSync(HISTORY_PATH, "utf8")) as {
    _meta: { scoringVersion: string; scoringAudit: unknown; sourceFiles: unknown };
    rows: HistoricalPlayerWeek[];
  };
  if (historyArtifact._meta.scoringVersion !== FANTASY_SCORING_VERSION) {
    throw new Error(`History scoring version mismatch: ${historyArtifact._meta.scoringVersion}`);
  }

  const prior = build2022PriorSeasonRows(crosswalk);
  const allHistory: HistoricalPlayerWeek[] = [...prior.rows, ...historyArtifact.rows];

  const inputs = loadModeledSeasonInputs();
  // context-only: the nflverse weekly injury report's `date_modified` cannot
  // be proven to precede kickoff (Phase 1B audit found values reaching into
  // the target week's game day itself), so injury status must not determine
  // training-row existence. It is still resolved for context/audit purposes.
  const universe = buildHistoricalRankingUniverse({
    outcomes: historyArtifact.rows, rosters: inputs.rosters, injuries: inputs.injuries, schedule: inputs.schedule,
    injuryExclusionMode: "context-only",
  });

  const snapByKey = new Map<string, number>();
  for (const snap of inputs.snapRows) {
    const pfrId = String(snap.pfr_player_id || "");
    const team = normalizeNflTeamAbbr(String(snap.team || ""));
    const snapShare = Number(snap.offense_pct);
    const season = Number(snap.season);
    const week = Number(snap.week);
    if (pfrId && team && Number.isFinite(snapShare) && Number.isInteger(season) && Number.isInteger(week)) {
      snapByKey.set(historicalSnapJoinKey(season, week, pfrId, team), snapShare);
    }
  }
  const gsisToPfr = new Map(playersEntry.rows.map((row) => [String(row.gsis_id), String(row.pfr_id || "") || null]));
  const snapSharePerPlayerWeek = new Map<string, number>();
  for (const row of allHistory) {
    const gsis = row.playerId.startsWith("gsis:") ? row.playerId.slice(5) : null;
    const pfrId = gsis ? gsisToPfr.get(gsis) : null;
    if (!pfrId) continue;
    const value = snapByKey.get(historicalSnapJoinKey(row.season, row.week, pfrId, row.team));
    if (value != null) snapSharePerPlayerWeek.set(`${row.playerId}|${row.season}|${row.week}`, value);
  }
  const snapShareFor = (playerId: string, season: number, week: number): number | null =>
    snapSharePerPlayerWeek.get(`${playerId}|${season}|${week}`) ?? null;

  const gamesText = await fetchScheduleText(offlineSchedule);
  const gamesSha256 = createHash("sha256").update(gamesText, "utf8").digest("hex");
  const scheduleTeamWeeks = buildScheduleTeamWeeks(gamesText);

  const candidates: UniverseCandidate[] = universe.rows.map((row) => ({
    season: row.season, week: row.week, playerId: row.playerId, playerName: row.playerName,
    position: row.position, team: row.team, opponent: row.opponent, eligible: true,
  }));

  const provenance = {
    generatedAt,
    sourceManifests: [
      { cache: "stats-player-week", season: PRIOR_SEASON, filename: prior.entry.filename, retrievedDateUtc: prior.entry.retrievedDateUtc, sha256: prior.entry.sha256 },
      { cache: "players", season: null, filename: playersEntry.entry.filename, retrievedDateUtc: playersEntry.entry.retrievedDateUtc, sha256: playersEntry.entry.sha256 },
    ],
    scheduleSource: { url: NFL_GAMES_SOURCE_URL, retrievedAtUtc: generatedAt, sha256: gamesSha256 },
  };

  const rows = buildTrainingDataset(candidates, allHistory, inputs.teamHistory, scheduleTeamWeeks, snapShareFor, generatedAt, provenance);

  // Data-quality invariants (fail closed rather than write a bad artifact)
  const seenKeys = new Set<string>();
  for (const row of rows) {
    if (!POSITIONS.includes(row.position)) throw new Error(`Unsupported position in dataset: ${row.position}`);
    const key = `${row.season}|${row.week}|${row.playerId}`;
    if (seenKeys.has(key)) throw new Error(`Duplicate dataset row for ${key}`);
    seenKeys.add(key);
    if (!Number.isFinite(row.actualFantasyPoints)) throw new Error(`Non-finite target for ${key}`);
    if (row.gamesPlayedPrior < 0) throw new Error(`Negative gamesPlayedPrior for ${key}`);
    if (row.week === 1 && row.opponentPositionFpaPrior != null) {
      throw new Error(`Week 1 row ${key} has a non-null current-season FPA (should be null pre-any games).`);
    }
  }

  const coverage = buildProjectionCoverageReport(rows);

  writeAtomic(join(RESEARCH_DIR, "weekly-fantasy-projection-training-dataset-v1.json"), {
    _meta: {
      schemaVersion: WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION,
      generatedAt,
      seasons: MODELED_SEASONS,
      priorSeasonSource: PRIOR_SEASON,
      scoringVersion: FANTASY_SCORING_VERSION,
      rowCount: rows.length,
      universeAudit: universe.audit,
      leakagePolicy: [
        "SeasonPrior/Last3/Last5 features use only current-season weeks strictly before the target week.",
        "priorSeason* fields use only the previous NFL season, entirely before the modeled season.",
        "Opponent FPA uses only weeks strictly before the target week within the same season.",
        "Team/opponent EPA uses only team games strictly before the target week.",
        "No 2026 roster, injury, market, or usage data enters this artifact.",
        "starterStatus is always 'unknown'; injury designation is never used as a predictive feature.",
      ],
      provenance,
      priorSeasonPprAudit: prior.pprAudit,
      currentSeasonPprAudit: historyArtifact._meta.scoringAudit,
      sourceFiles: { modeledSeasons: inputs.sourceFiles, priorSeason: prior.entry, players: playersEntry.entry, playersManifest: playerManifest.files?.length ?? 0 },
    },
    rows,
  });

  writeAtomic(join(RESEARCH_DIR, "weekly-fantasy-projection-coverage-v1.json"), {
    _meta: { schemaVersion: "weekly-fantasy-projection-coverage-v1", generatedAt, rowCount: rows.length },
    coverage,
  });

  const bySeason = MODELED_SEASONS.map((season) => ({ season, rows: rows.filter((row) => row.season === season).length }));
  console.log(`[fantasy:projection-dataset] generated ${rows.length} rows: ${bySeason.map((r) => `${r.season}=${r.rows}`).join(", ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
