/**
 * Generate public/data/nfl/<season>/yardage-history.json -- the Last-10
 * player game log and Last-10 opponent-defense game log powering the
 * Yardage Props Review player-detail panel's history tables.
 *
 * Presentation/history ONLY. Reads already-committed canonical authorities
 * (schedules/results, nflverse player-week stats, nflverse EPA-per-game,
 * the yardage market archive) and reshapes them -- never touches
 * projectedYards, Matchup Score, EPA/Success artifacts, or sportsbook
 * ingestion. See scripts/lib/nfl-yardage-history-core.mjs for the full
 * source map and leakage-safety rules.
 *
 * Scoped to the players/opponents that actually appear in the current-week
 * projection artifact (not the full multi-thousand-player universe), so
 * the output stays a compact, single-fetch artifact rather than a raw
 * historical dump -- see AGENTS performance guidance for this page.
 *
 * Usage:
 *   node scripts/generate-nfl-yardage-history.mjs [--season 2026] [--dry-run]
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, buildNflverseTeamMap } from "./lib/nfl-schedules-results-core.mjs";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { normalizeEpaTeamGameRows, TRAILING_GAMES } from "./lib/nfl-epa-week-rank-core.mjs";
import { parseMarketArchiveJsonl, indexArchiveByTarget } from "./lib/nfl-yardage-historical-line-core.mjs";
import {
  normalizeHistoryStatRows,
  buildGameLookup,
  buildHistoryRollingIndexes,
  buildPlayerLast10,
  buildOpponentLast10,
  HISTORY_MARKET_POSITIONS,
} from "./lib/nfl-yardage-history-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const STATS_DIR = join(ROOT, "data", "nfl", "nflverse", "stats-player-week");
const EPA_DIR = join(ROOT, "data", "nfl", "nflverse", "epa-team-game");
const ARCHIVE_FILE = join(ROOT, "data", "nfl", "props", "market-archive", "nfl-yardage-market-archive.jsonl");

const STAT_SEASONS = [2022, 2023, 2024, 2025];
const EPA_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];

export const YARDAGE_HISTORY_SCHEMA_VERSION = "nfl-yardage-history-v1";

const MARKET_TO_CANONICAL = { passing: "passingYards", rushing: "rushingYards", receiving: "receivingYards" };
const MARKET_TO_POSITION_SLICE = (market, playerPosition) => {
  if (market === "passing") return "QB";
  if (market === "rushing") return playerPosition === "RB" ? "RB" : "ALL";
  return playerPosition;
};

function parseArgs(argv) {
  const args = { season: 2026, dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season")) args.season = Number(raw.split("=")[1] ?? argv[argv.indexOf(raw) + 1]);
    else if (raw === "--season") continue;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));
const readCsvIfExists = (path) => (existsSync(path) ? parseCsv(readFileSync(path, "utf-8")) : []);

function stripGsisPrefix(playerId) {
  return String(playerId ?? "").replace(/^gsis:/, "");
}

function loadAllStatRows() {
  const out = [];
  for (const season of STAT_SEASONS) {
    const path = join(STATS_DIR, `stats_player_week_${season}.csv`);
    if (!existsSync(path)) continue;
    const rows = parseCsv(readFileSync(path, "utf-8"));
    out.push(...normalizeHistoryStatRows(rows, season));
  }
  return out;
}

function loadAllEpaRows() {
  const out = [];
  for (const season of EPA_SEASONS) {
    const rows = readCsvIfExists(join(EPA_DIR, `epa_team_game_${season}.csv`));
    out.push(...normalizeEpaTeamGameRows(rows));
  }
  return out;
}

function loadGamesAndResults(seasons) {
  const games = [];
  const results = [];
  for (const season of seasons) {
    const gamesPath = join(DATA_DIR, String(season), "games.json");
    const resultsPath = join(DATA_DIR, String(season), "results.json");
    if (existsSync(gamesPath)) games.push(...readJson(gamesPath).games);
    if (existsSync(resultsPath)) results.push(...readJson(resultsPath).results);
  }
  return { games, results };
}

function main() {
  const args = parseArgs(process.argv);
  const season = args.season;

  const teamsJson = readJson(join(DATA_DIR, "teams.json"));
  const nflverseToTeam = buildNflverseTeamMap(teamsJson);
  const canonicalToNflverseAbbr = new Map([...nflverseToTeam.entries()].map(([nflverseAbbr, team]) => [team.abbr, nflverseAbbr]));

  const projectionPath = join(DATA_DIR, String(season), "yardage-projections.json");
  if (!existsSync(projectionPath)) throw new Error(`yardage-projections.json missing for season ${season} at ${projectionPath}`);
  const projections = readJson(projectionPath);
  const week = projections.week;
  const rows = projections.rows.filter((r) => r.week === week);
  if (rows.length === 0) throw new Error(`no projection rows for season ${season} week ${week} -- refusing to write an empty artifact`);

  const { games, results } = loadGamesAndResults([...STAT_SEASONS, season]);
  const gameLookup = buildGameLookup(games, results, canonicalToNflverseAbbr);

  const allStatRows = loadAllStatRows();
  const epaRows = loadAllEpaRows();
  const rollingIndexes = buildHistoryRollingIndexes(allStatRows, epaRows);

  const archiveText = existsSync(ARCHIVE_FILE) ? readFileSync(ARCHIVE_FILE, "utf-8") : "";
  const archiveObservations = parseMarketArchiveJsonl(archiveText);
  const archiveIndex = indexArchiveByTarget(archiveObservations);

  const players = {};
  const teamDefense = {};
  const teamDefenseCache = new Set();
  let playersBuilt = 0;
  let opponentLogsBuilt = 0;
  const missingPregameRank = [];

  for (const row of rows) {
    const playerId = stripGsisPrefix(row.playerId);
    const market = row.market;
    const canonicalMarketKey = MARKET_TO_CANONICAL[market];
    const playersKey = `${row.playerId}:${market}`;

    if (!players[playersKey]) {
      const playerRows = buildPlayerLast10({
        playerId,
        market,
        playerPosition: row.position,
        playerStatRows: allStatRows,
        gameLookup,
        rollingIndexes,
        archiveIndex,
        canonicalMarketKey,
      });
      players[playersKey] = {
        playerId: row.playerId,
        playerName: row.playerName,
        market,
        position: row.position,
        games: playerRows,
      };
      playersBuilt += 1;
      if (playerRows.length > 0 && playerRows[0].oppDefRank == null) {
        missingPregameRank.push(`${row.playerName} (${market})`);
      }
    }

    const opponentNflverseAbbr = canonicalToNflverseAbbr.get(row.opponent);
    const position = MARKET_TO_POSITION_SLICE(market, row.position);
    const teamDefenseKey = `${row.opponent}:${market}:${position}`;
    if (opponentNflverseAbbr && !teamDefenseCache.has(teamDefenseKey)) {
      teamDefenseCache.add(teamDefenseKey);
      const opponentRows = buildOpponentLast10({
        defenseTeamNflverseAbbr: opponentNflverseAbbr,
        market,
        position,
        allStatRows,
        gameLookup,
        rollingIndexes,
        archiveIndex,
        canonicalMarketKey,
      });
      teamDefense[teamDefenseKey] = {
        team: row.opponent,
        market,
        position,
        games: opponentRows,
      };
      opponentLogsBuilt += 1;
    }
  }

  const artifact = {
    _meta: buildNflMeta({
      source: "nflverse stats_player_week + epa_team_game + nfldata games.csv + yardage market archive",
      season,
      week,
      notes: [
        `Player/opponent game logs are capped at ${TRAILING_GAMES} most-recent completed REG-season games, chronological across seasons (2022-2025 source data) -- Week 1 has zero current-season games, so every Last-10 game here is from a prior season.`,
        "Opp Def Rank / Opp Off Rank is a pregame trailing-10-game rolling EPA/play rank (see nfl-epa-week-rank-core.mjs) -- a distinct, per-game-windowed derivation of the same canonical nflverse EPA data the frozen Season/Last-5 matchup-epa.json artifact uses, not that artifact itself.",
        "Opp Yds Allow Avg is a pregame trailing-10-game rolling yards-allowed average (see nfl-yardage-rolling-core.mjs) over the same nflverse stats_player_week cache the frozen Season/Last-5 production-allowed artifact uses.",
        "Vegas Line resolves only from an approved-sportsbook, final pre-kickoff observation in the yardage market archive; the archive only began collecting 2026-08-26, so every historical (pre-2026) game resolves to null -- never backfilled/estimated.",
        "Opponent Last-10 tables identify the 'opposing player' per historical game as that game's leader at the requested position by primary volume stat (attempts/carries/targets) -- a documented deterministic choice, not a random or fuzzy match.",
        missingPregameRank.length > 0
          ? `${missingPregameRank.length} player market(s) had no pregame EPA rank for their most recent Last-10 game (first tracked game in the 2020-2025 EPA window) -- rendered as null, never fabricated.`
          : "Every built player's most recent Last-10 game had a resolvable pregame EPA rank.",
      ],
    }),
    schemaVersion: YARDAGE_HISTORY_SCHEMA_VERSION,
    season,
    week,
    players,
    teamDefense,
    provenance: {
      generatedAt: new Date().toISOString(),
      playersBuilt,
      opponentLogsBuilt,
      archiveObservations: archiveObservations.length,
      statSeasons: STAT_SEASONS,
      epaSeasons: EPA_SEASONS,
    },
  };

  console.log(`[nfl:yardage-history] season ${season} week ${week}: ${playersBuilt} player logs, ${opponentLogsBuilt} opponent-defense logs`);

  if (args.dryRun) {
    console.log("[nfl:yardage-history] dry run; nothing written");
    return;
  }

  const outFile = join(DATA_DIR, String(season), "yardage-history.json");
  mkdirSync(dirname(outFile), { recursive: true });
  const tmp = `${outFile}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, outFile);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best effort */ }
    }
    throw err;
  }
  console.log(`[nfl:yardage-history] wrote ${outFile}`);
}

try {
  main();
} catch (err) {
  console.error(`[nfl:yardage-history] FAILED: ${err.message}`);
  console.error("[nfl:yardage-history] existing artifact left untouched");
  process.exit(1);
}

export { HISTORY_MARKET_POSITIONS };
