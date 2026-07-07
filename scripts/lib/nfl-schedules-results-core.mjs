/**
 * Core transform logic for the nflverse schedules/results pipeline (PR-2).
 *
 * Input: nflverse nfldata games.csv (free, no API key)
 *   https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv
 * Output: public/data/nfl/<season>/games.json and results.json.
 *
 * Pure-ish and dependency-free so src/lib/nfl tests can exercise it with
 * fixture CSV text. File writes happen only in runPipeline (dryRun-guarded).
 * The source file also carries historical betting-line columns; they are
 * intentionally never read here (free-first mandate: schedules/scores only).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildNflMeta, toNflJsonFileString } from "./nfl-data-meta.mjs";

export const NFL_GAMES_SOURCE_LABEL = "nflverse (nfldata games.csv)";
export const NFL_GAMES_SOURCE_URL =
  "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
export const DEFAULT_START_SEASON = 2022;
export const DEFAULT_END_SEASON = 2026;

const SEASON_TYPES = new Set(["REG", "WC", "DIV", "CON", "SB"]);
const ET_ZONE = "America/New_York";

/** Minimal CSV parser handling quoted fields (games.csv quotes empty roof values). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const record = {};
    header.forEach((name, idx) => {
      record[name] = cells[idx] ?? "";
    });
    return record;
  });
}

function etOffsetMs(date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

/**
 * Convert nflverse gameday ("YYYY-MM-DD") + gametime ("HH:MM", US Eastern)
 * to a UTC ISO timestamp. Returns null when either part is missing/invalid.
 */
export function etToUtcIso(gameday, gametime) {
  if (!gameday || !gametime) return null;
  const [y, m, d] = gameday.split("-").map(Number);
  const [hh, mm] = gametime.split(":").map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  const wallClockAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes: the offset depends on the instant (EST vs EDT around DST edges).
  let ts = wallClockAsUtc - etOffsetMs(new Date(wallClockAsUtc));
  ts = wallClockAsUtc - etOffsetMs(new Date(ts));
  return new Date(ts).toISOString();
}

/** Map nflverse team codes (BUF, LA, WAS) to canonical teams from teams.json. */
export function buildNflverseTeamMap(teamsJson) {
  const teams = teamsJson?.teams;
  if (!Array.isArray(teams) || teams.length !== 32) {
    throw new Error("teams.json is malformed: expected a teams array with 32 canonical teams");
  }
  return new Map(teams.map((team) => [team.nflverseAbbr, team]));
}

function parseScore(raw, label, gameId) {
  if (raw === "" || raw == null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Malformed ${label} score "${raw}" for game ${gameId}`);
  }
  return value;
}

function resolveTeam(teamMap, code, gameId) {
  const team = teamMap.get(code);
  if (!team) {
    throw new Error(
      `Unknown nflverse team abbreviation "${code}" in game ${gameId} — not present in public/data/nfl/teams.json`
    );
  }
  return team;
}

function toIsDome(roof) {
  if (roof === "dome" || roof === "closed") return true;
  if (roof === "outdoors" || roof === "open") return false;
  return null;
}

/**
 * Transform one season's raw CSV rows into game + result records.
 * Hard-fails on unknown teams, duplicate game ids, or malformed scores.
 */
export function transformSeasonRows(rows, season, teamMap) {
  const games = [];
  const results = [];
  const seenIds = new Set();

  for (const row of rows) {
    const gameId = row.game_id;
    if (!gameId) throw new Error(`Row without game_id in season ${season}`);
    if (Number(row.season) !== season) continue;
    if (seenIds.has(gameId)) throw new Error(`Duplicate game_id ${gameId} in season ${season}`);
    seenIds.add(gameId);

    const seasonType = row.game_type;
    if (!SEASON_TYPES.has(seasonType)) {
      throw new Error(`Unknown game_type "${seasonType}" for game ${gameId}`);
    }
    const week = Number(row.week);
    if (!Number.isInteger(week) || week < 1) {
      throw new Error(`Malformed week "${row.week}" for game ${gameId}`);
    }

    const home = resolveTeam(teamMap, row.home_team, gameId);
    const away = resolveTeam(teamMap, row.away_team, gameId);
    const homeScore = parseScore(row.home_score, "home", gameId);
    const awayScore = parseScore(row.away_score, "away", gameId);
    if ((homeScore == null) !== (awayScore == null)) {
      throw new Error(`Game ${gameId} has only one score — malformed source row`);
    }
    const isFinal = homeScore != null && awayScore != null;

    games.push({
      gameId,
      season,
      week,
      seasonType,
      dateUtc: etToUtcIso(row.gameday, row.gametime),
      homeTeam: home.name,
      awayTeam: away.name,
      homeAbbr: home.abbr,
      awayAbbr: away.abbr,
      status: isFinal ? "final" : "scheduled",
      stadium: row.stadium || null,
      isDome: toIsDome(row.roof),
    });

    if (isFinal) {
      results.push({
        gameId,
        season,
        week,
        seasonType,
        homeTeam: home.name,
        awayTeam: away.name,
        homeAbbr: home.abbr,
        awayAbbr: away.abbr,
        homeScore,
        awayScore,
        winner: homeScore === awayScore ? "TIE" : homeScore > awayScore ? home.abbr : away.abbr,
        margin: Math.abs(homeScore - awayScore),
        totalPoints: homeScore + awayScore,
        final: true,
        source: NFL_GAMES_SOURCE_LABEL,
      });
    }
  }

  const byKickoff = (a, b) =>
    a.week - b.week ||
    (a.dateUtc ?? "").localeCompare(b.dateUtc ?? "") ||
    a.gameId.localeCompare(b.gameId);
  games.sort(byKickoff);
  results.sort((a, b) => a.week - b.week || a.gameId.localeCompare(b.gameId));
  return { games, results };
}

function seasonNotes(season, games, results) {
  const notes = [
    `Source: ${NFL_GAMES_SOURCE_URL}`,
    "Kickoff times converted from nflverse US Eastern gameday/gametime to UTC (dateUtc).",
    "seasonType values: REG, WC, DIV, CON, SB. Only REG results should feed standings.",
    "Source file carries historical betting-line columns; they are intentionally not ingested (free-first mandate).",
  ];
  if (season === 2022) {
    notes.push(
      "nflverse excludes the cancelled 2022 Week 17 BUF-CIN game entirely, so 271 of 272 scheduled regular-season games have results. This is expected, not an ingest failure."
    );
  }
  if (games.length > 0 && results.length === 0) {
    notes.push(
      `No ${season} games have been completed yet; results.json stays empty until finals post.`
    );
  }
  return notes;
}

/**
 * Run the pipeline for the requested seasons.
 *
 * @param {object} options
 * @param {string} options.csvText - Raw games.csv content (fetched or fixture).
 * @param {object} options.teamsJson - Parsed public/data/nfl/teams.json.
 * @param {number[]} options.seasons - Seasons to generate.
 * @param {string} options.outputDir - Base dir that holds <season>/games.json.
 * @param {boolean} [options.dryRun] - When true, nothing is written.
 * @param {(msg: string) => void} [options.log]
 * @returns {{ season: number, gameCount: number, resultCount: number, written: string[] }[]}
 */
export function runPipeline({ csvText, teamsJson, seasons, outputDir, dryRun = false, log = () => {} }) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error("games.csv parsed to zero rows — refusing to continue");
  const teamMap = buildNflverseTeamMap(teamsJson);
  const summaries = [];

  for (const season of seasons) {
    const seasonRows = rows.filter((row) => Number(row.season) === season);
    const { games, results } = transformSeasonRows(seasonRows, season, teamMap);
    const notes = seasonNotes(season, games, results);
    const gamesPayload = {
      _meta: buildNflMeta({ source: NFL_GAMES_SOURCE_LABEL, season, notes }),
      games,
    };
    const resultsPayload = {
      _meta: buildNflMeta({ source: NFL_GAMES_SOURCE_LABEL, season, notes }),
      results,
    };

    const written = [];
    if (!dryRun) {
      const seasonDir = join(outputDir, String(season));
      mkdirSync(seasonDir, { recursive: true });
      const gamesPath = join(seasonDir, "games.json");
      const resultsPath = join(seasonDir, "results.json");
      writeFileSync(gamesPath, toNflJsonFileString(gamesPayload));
      writeFileSync(resultsPath, toNflJsonFileString(resultsPayload));
      written.push(gamesPath, resultsPath);
    }

    log(
      `[nfl:schedules] season ${season}: ${games.length} games, ${results.length} results${dryRun ? " (dry-run, not written)" : ""}`
    );
    summaries.push({ season, gameCount: games.length, resultCount: results.length, written });
  }
  return summaries;
}
