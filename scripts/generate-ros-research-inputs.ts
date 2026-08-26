/**
 * ROS projection authority -- Phase 2 shadow research input generator.
 *
 * Produces five versioned, deterministic research artifacts under
 * `data/fantasy/ros-research/2026/`. Every artifact reuses already-approved
 * production modules (historical scoring/identity normalization, implied
 * team totals, points-allowed-by-position) and is read-only against live
 * rank/PAR/projection outputs -- nothing here writes to
 * `data/fantasy/2026-par-consensus.json`, `src/data/fantasyRankings2026.ts`,
 * or `public/data/fantasy/weekly`.
 *
 * No final ROS-projected PPG, new PAR/G, Model Rank, or rank change is
 * computed anywhere in this script -- that is explicitly out of Phase 2
 * scope (Phase 3).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeHistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";
import { normalizeNflTeamAbbr } from "../src/lib/fantasy/weekly/identity.ts";
import {
  buildHistoricalBaseline,
  ROS_HISTORICAL_BASELINE_SCHEMA_VERSION,
  type HistoricalBaselineSourceRow,
} from "../src/lib/fantasy/rosResearch/historicalBaseline.ts";
import {
  buildUsageRoleContext,
  ROS_USAGE_ROLE_CONTEXT_SCHEMA_VERSION,
  type UsageRoleSourceRow,
} from "../src/lib/fantasy/rosResearch/usageRoleContext.ts";
import {
  buildTeamMarketContext,
  ROS_TEAM_MARKET_CONTEXT_SCHEMA_VERSION,
  type TeamMarketSourceGame,
} from "../src/lib/fantasy/rosResearch/teamMarketContext.ts";
import {
  buildScheduleFpaContext,
  ROS_SCHEDULE_FPA_CONTEXT_SCHEMA_VERSION,
  type FpaLookup,
  type RemainingScheduleGame,
} from "../src/lib/fantasy/rosResearch/scheduleFpaContext.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = join(ROOT, "data", "fantasy", "ros-research", "2026");
const HISTORY_SEASONS = [2023, 2024, 2025];
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;

type CsvRow = Record<string, string>;
type ManifestEntry = { season: number | null; filename: string; retrievedDateUtc: string; rowCount: number; byteSize: number; sha256: string; headerColumns?: string[] };

function sha(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }

function parseArgs(argv: string[]) {
  const args = { generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be an ISO timestamp.");
  return args;
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

/**
 * Reads a committed nflverse CSV cache and byte/sha256-verifies it against
 * its manifest entry (`scripts/lib/nfl-source-cache.mjs` `verifyCacheEntry`
 * -- the same check the identity crosswalk generator and the weekly
 * production pipeline use). Requires `data/nfl/nflverse/**\/*.csv text
 * eol=lf` in `.gitattributes` so a Windows checkout with core.autocrlf=true
 * does not smudge CRLF into these files and break byte-identity with the
 * manifest's recorded hash (see .gitattributes for the full explanation).
 */
function readNflverseCsv(relativeDir: string, entry: ManifestEntry) {
  const path = join(ROOT, relativeDir, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { rows: parseCsv(text) as CsvRow[], path, observedHash: sha(readFileSync(path)) };
}

function main() {
  const options = parseArgs(process.argv);

  // ---- Identity universe: only Phase 1 resolved canonical players. ----
  const identityPath = join(OUTPUT_DIR, "identity-crosswalk.json");
  if (!existsSync(identityPath)) {
    throw new Error("Run scripts/generate-ros-identity-crosswalk.ts first; Phase 2 reuses its resolved universe.");
  }
  const identity = readJson<{ rows: Array<{ identity: { playerId: string | null }; player: string; position: string }> }>(identityPath);
  const universe = identity.rows
    .filter((row) => row.identity.playerId)
    .map((row) => ({ playerId: row.identity.playerId as string, playerName: row.player, position: row.position as typeof POSITIONS[number] }));

  // ---- Shared source: players crosswalk (gsis -> pfr/espn) ----
  const playersManifest = readJson<{ files: ManifestEntry[] }>(
    join(ROOT, "data/nfl/nflverse/players/manifest.json"),
  );
  const playersEntry = playersManifest.files.find((entry) => entry.season === null)!;
  const players = readNflverseCsv("data/nfl/nflverse/players", playersEntry);
  const crosswalk = new Map(players.rows.map((row) => [String(row.gsis_id), { pfrId: String(row.pfr_id || "") || null, espnId: String(row.espn_id || "") || null }]));

  // ---- 2.1 + 2.2: historical player-week rows from committed nflverse caches ----
  const statsManifest = readJson<{ files: ManifestEntry[] }>(
    join(ROOT, "data/nfl/nflverse/stats-player-week/manifest.json"),
  );
  const historyRows: Array<{ season: number; playerId: string; playerName: string; position: string; actualFantasyPoints: number; usage: ReturnType<typeof normalizeHistoricalPlayerWeek> extends infer R ? (R extends null ? never : NonNullable<R>["usage"]) : never }> = [];
  const historySourceFiles: Array<{ season: number; filename: string; retrievedDateUtc: string; observedHash: string; manifestRowCount: number }> = [];
  for (const season of HISTORY_SEASONS) {
    const entry = statsManifest.files.find((candidate) => candidate.season === season);
    if (!entry) throw new Error(`Player-week source for ${season} is not cached.`);
    const stats = readNflverseCsv("data/nfl/nflverse/stats-player-week", entry);
    for (const source of stats.rows) {
      const ids = crosswalk.get(String(source.player_id));
      const normalized = normalizeHistoricalPlayerWeek(source, ids, null);
      if (!normalized) continue;
      historyRows.push({
        season: normalized.season, playerId: normalized.playerId, playerName: normalized.playerName,
        position: normalized.position, actualFantasyPoints: normalized.actualFantasyPoints, usage: normalized.usage,
      });
    }
    historySourceFiles.push({ season, filename: entry.filename, retrievedDateUtc: entry.retrievedDateUtc, observedHash: stats.observedHash, manifestRowCount: entry.rowCount });
  }

  const baselineRows: HistoricalBaselineSourceRow[] = historyRows.map((row) => ({
    season: row.season, playerId: row.playerId, playerName: row.playerName,
    position: row.position as typeof POSITIONS[number], actualFantasyPoints: row.actualFantasyPoints,
  }));
  const baseline = buildHistoricalBaseline(baselineRows, universe);

  const usageRows: UsageRoleSourceRow[] = historyRows.map((row) => ({
    season: row.season, playerId: row.playerId, playerName: row.playerName,
    position: row.position as typeof POSITIONS[number],
    usage: {
      offensiveSnaps: row.usage.offensiveSnaps, snapShare: row.usage.snapShare, targets: row.usage.targets,
      receptions: row.usage.receptions, rushAttempts: row.usage.rushAttempts, targetShare: row.usage.targetShare,
      airYardsShare: row.usage.airYardsShare,
    },
  }));
  const usage = buildUsageRoleContext(usageRows, universe);

  // ---- 2.3 + 2.5: team / remaining-schedule market environment ----
  const schedule = readJson<{ _meta: { generatedAt: string }; games: Array<{ gameId: string; season: number; week: number; seasonType: string; homeAbbr: string; awayAbbr: string; neutralSite: boolean; status: string }> }>(
    join(ROOT, "public/data/nfl/2026/games.json"),
  );
  const reg2026 = schedule.games.filter((game) => game.season === 2026 && game.seasonType === "REG");
  const remaining2026 = reg2026.filter((game) => game.status !== "final");
  const allTeams = [...new Set(reg2026.flatMap((game) => [game.homeAbbr, game.awayAbbr]))];

  const marketText = readFileSync(join(ROOT, "public/data/nfl/matchup-market.json"), "utf8");
  const market = JSON.parse(marketText) as { _meta: { generatedAt: string }; currentMarket: Record<string, { gameId: string; week: number; homeAbbr: string; awayAbbr: string; neutralSite: boolean; spread: { home: number | null; away: number | null }; total: number | null }> };
  const marketByGameId = new Map(Object.values(market.currentMarket).map((game) => [game.gameId, game]));

  function toMarketGames(games: typeof reg2026): TeamMarketSourceGame[] {
    return games.map((game) => {
      const marketGame = marketByGameId.get(game.gameId);
      return {
        gameId: game.gameId, week: game.week, homeAbbr: game.homeAbbr, awayAbbr: game.awayAbbr, neutralSite: game.neutralSite,
        spread: marketGame?.spread ?? { home: null, away: null }, total: marketGame?.total ?? null,
      };
    });
  }

  const teamEnvironment = buildTeamMarketContext(toMarketGames(reg2026), allTeams, { source: "public/data/nfl/matchup-market.json", generatedAt: market._meta.generatedAt });
  const scheduleScoringEnvironment = buildTeamMarketContext(toMarketGames(remaining2026), allTeams, { source: "public/data/nfl/matchup-market.json", generatedAt: market._meta.generatedAt });

  // ---- 2.4: remaining-schedule opponent FPA ----
  const fpaCsvPath = join(ROOT, "data/fantasy/points-allowed-2025.csv");
  const fpaCsvText = readFileSync(fpaCsvPath, "utf8");
  const fpaRows = parseCsv(fpaCsvText) as CsvRow[];
  const FPA_TEAM_ABBR: Record<string, string> = {
    "Arizona Cardinals": "ari", "Atlanta Falcons": "atl", "Baltimore Ravens": "bal", "Buffalo Bills": "buf",
    "Carolina Panthers": "car", "Chicago Bears": "chi", "Cincinnati Bengals": "cin", "Cleveland Browns": "cle",
    "Dallas Cowboys": "dal", "Denver Broncos": "den", "Detroit Lions": "det", "Green Bay Packers": "gb",
    "Houston Texans": "hou", "Indianapolis Colts": "ind", "Jacksonville Jaguars": "jax", "Kansas City Chiefs": "kc",
    "Los Angeles Chargers": "lac", "Los Angeles Rams": "lar", "Las Vegas Raiders": "lv", "Miami Dolphins": "mia",
    "Minnesota Vikings": "min", "New England Patriots": "ne", "New Orleans Saints": "no", "New York Giants": "nyg",
    "New York Jets": "nyj", "Philadelphia Eagles": "phi", "Pittsburgh Steelers": "pit", "San Francisco 49ers": "sf",
    "Seattle Seahawks": "sea", "Tampa Bay Buccaneers": "tb", "Tennessee Titans": "ten", "Washington Commanders": "wsh",
  };
  const fpaByTeam: FpaLookup = new Map(fpaRows.flatMap((row) => {
    const abbr = FPA_TEAM_ABBR[row.TEAM];
    if (!abbr) return [];
    const byPosition = Object.fromEntries(POSITIONS.map((position) => [
      position,
      { rank: Number(row[`${position} RK`]), pointsAllowed: Number(row[`${position} PA`]) },
    ])) as Record<typeof POSITIONS[number], { rank: number; pointsAllowed: number }>;
    return [[abbr, byPosition]];
  }));

  const scheduleByTeam = new Map<string, RemainingScheduleGame[]>();
  for (const team of allTeams) {
    const normalizedTeam = normalizeNflTeamAbbr(team) ?? team;
    const games = remaining2026
      .filter((game) => game.homeAbbr === team || game.awayAbbr === team)
      .map((game) => ({ week: game.week, opponent: game.homeAbbr === team ? game.awayAbbr : game.homeAbbr }));
    scheduleByTeam.set(normalizedTeam, games);
  }
  const scheduleFpa = buildScheduleFpaContext(scheduleByTeam, fpaByTeam, 2025);

  // ---- Write artifacts ----
  const commonProvenance = {
    generatedAt: options.generatedAt,
    identityCrosswalk: { path: "data/fantasy/ros-research/2026/identity-crosswalk.json", hash: sha(readFileSync(identityPath)) },
  };

  writeAtomic(join(OUTPUT_DIR, "historical-baseline.json"), `${JSON.stringify({
    schemaVersion: ROS_HISTORICAL_BASELINE_SCHEMA_VERSION,
    season: 2026,
    ...commonProvenance,
    provenance: { seasons: HISTORY_SEASONS, sourceFiles: historySourceFiles, playersCrosswalk: { path: players.path, observedHash: players.observedHash, retrievedDateUtc: playersEntry.retrievedDateUtc },
      notes: ["Committed nflverse CSV caches read directly and byte/sha256-verified against their manifest entries (scripts/lib/nfl-source-cache.mjs verifyCacheEntry), the same check the identity crosswalk generator and weekly production pipeline use. Requires data/nfl/nflverse/**/*.csv text eol=lf in .gitattributes so checkout does not smudge CRLF into these files and break byte-identity with the manifest's recorded hash."] },
    counts: baseline.counts,
    players: baseline.players,
  }, null, 2)}\n`);

  writeAtomic(join(OUTPUT_DIR, "usage-role-context.json"), `${JSON.stringify({
    schemaVersion: ROS_USAGE_ROLE_CONTEXT_SCHEMA_VERSION,
    season: 2026,
    ...commonProvenance,
    provenance: { seasons: HISTORY_SEASONS, sourceFiles: historySourceFiles },
    counts: usage.counts,
    players: usage.players,
  }, null, 2)}\n`);

  writeAtomic(join(OUTPUT_DIR, "team-environment.json"), `${JSON.stringify({
    schemaVersion: ROS_TEAM_MARKET_CONTEXT_SCHEMA_VERSION,
    season: 2026,
    ...commonProvenance,
    provenance: {
      schedule: { path: "public/data/nfl/2026/games.json", generatedAt: schedule._meta.generatedAt },
      market: { path: "public/data/nfl/matchup-market.json", generatedAt: market._meta.generatedAt },
      scope: "all-2026-regular-season-games (not remaining-only; see schedule-scoring-environment.json for the remaining-only view)",
      notes: ["A single weekly implied total is never treated as season-long authority; every team's full available game list and a coverage fraction are reported instead."],
    },
    counts: teamEnvironment.counts,
    teams: teamEnvironment.teams,
  }, null, 2)}\n`);

  writeAtomic(join(OUTPUT_DIR, "schedule-fpa-context.json"), `${JSON.stringify({
    schemaVersion: ROS_SCHEDULE_FPA_CONTEXT_SCHEMA_VERSION,
    season: 2026,
    ...commonProvenance,
    provenance: {
      schedule: { path: "public/data/nfl/2026/games.json" },
      fpaSource: { path: "data/fantasy/points-allowed-2025.csv", season: 2025, hash: sha(fpaCsvText) },
      notes: ["FPA direction: higher average points-allowed across the remaining slate = more favourable remaining schedule for that position (source rank 1 = allowed the most).", "A remaining game whose opponent is missing from the 2025 FPA source is excluded from the average and counted against coverage, never fabricated."],
    },
    counts: scheduleFpa.counts,
    teams: scheduleFpa.teams,
  }, null, 2)}\n`);

  writeAtomic(join(OUTPUT_DIR, "schedule-scoring-environment.json"), `${JSON.stringify({
    schemaVersion: ROS_TEAM_MARKET_CONTEXT_SCHEMA_VERSION,
    season: 2026,
    ...commonProvenance,
    provenance: {
      schedule: { path: "public/data/nfl/2026/games.json", scope: "remaining (non-final) 2026 regular-season games only" },
      market: { path: "public/data/nfl/matchup-market.json", generatedAt: market._meta.generatedAt },
      notes: ["Reuses the same implied-team-total methodology as team-environment.json, restricted to each team's remaining schedule.", "Future lines are frequently unavailable this far out; limited coverage is reported explicitly rather than inventing a value."],
    },
    counts: scheduleScoringEnvironment.counts,
    teams: scheduleScoringEnvironment.teams,
  }, null, 2)}\n`);

  console.log("Identity universe:", universe.length);
  console.log("Historical baseline:", baseline.counts);
  console.log("Usage/role context:", usage.counts);
  console.log("Team environment:", teamEnvironment.counts);
  console.log("Schedule FPA:", scheduleFpa.counts);
  console.log("Schedule scoring environment:", scheduleScoringEnvironment.counts);
}

main();
