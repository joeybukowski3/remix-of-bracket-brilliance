import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const RAW_OUTPUT_PATH = path.join(DATA_DIR, "hr-props-raw.json");
const BEST_BETS_OUTPUT_PATH = path.join(DATA_DIR, "hr-props-best-bets.json");
const MLB_ODDS_PATH = path.join(DATA_DIR, "mlb-odds.json");
const PITCHER_REGRESSION_PATH = path.join(DATA_DIR, "pitcher-regression.json");
const FORCE = process.argv.includes("--force");
const MIN_GENERATION_HOUR_ET = 10;
const GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-1-fast-non-reasoning";
const SEASON = new Date().getFullYear();
const PICK_LIMITS = {
  bestBets: 5,
  valueBets: 3,
  longshots: 2,
};

const DEFAULT_PARK_FACTORS = {
  "American Family Field": 1.1,
  "Angel Stadium": 1.02,
  "Busch Stadium": 0.92,
  "Chase Field": 1.01,
  "Citi Field": 1.06,
  "Citizens Bank Park": 1.17,
  "Comerica Park": 0.95,
  "Coors Field": 1.4,
  "Daikin Park": 1.04,
  "Dodger Stadium": 1.1,
  "Fenway Park": 0.95,
  "George M. Steinbrenner Field": 0.98,
  "Globe Life Field": 0.99,
  "Great American Ball Park": 1.25,
  "Guaranteed Rate Field": 1.07,
  "Kauffman Stadium": 0.96,
  "loanDepot park": 0.88,
  "Nationals Park": 0.98,
  "Oracle Park": 0.85,
  "Oriole Park at Camden Yards": 1.1,
  "Petco Park": 0.89,
  "PNC Park": 0.9,
  "Progressive Field": 0.91,
  "Rate Field": 1.07,
  "Rogers Centre": 1.08,
  "Sutter Health Park": 0.96,
  "T-Mobile Park": 0.93,
  "Target Field": 0.97,
  "Truist Park": 1.03,
  "Wrigley Field": 1,
  "Yankee Stadium": 1.18,
};

const PARK_FACTOR_ALIASES = {
  "American Family Field": "American Family Field",
  "Angel Stadium of Anaheim": "Angel Stadium",
  "Camden Yards": "Oriole Park at Camden Yards",
  "Guaranteed Rate Field": "Rate Field",
  "Marlins Park": "loanDepot park",
  "Minute Maid Park": "Daikin Park",
  "Oakland Coliseum": "Sutter Health Park",
  "Oriole Park": "Oriole Park at Camden Yards",
  "Oriole Park at Camden Yards": "Oriole Park at Camden Yards",
  "Rate Field": "Rate Field",
  "Rogers Center": "Rogers Centre",
  "The Ballpark of the Palm Beaches": "George M. Steinbrenner Field",
  "Tropicana Field": "George M. Steinbrenner Field",
  "U.S. Cellular Field": "Rate Field",
  "US Cellular Field": "Rate Field",
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getTodayEt() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getCurrentEtHour() {
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number(hourText);
}

function getNextRunAt() {
  const etHour = getCurrentEtHour();
  const tz = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "ET";
  const offset = tz === "EDT" ? "-04:00" : "-05:00";
  const today = getTodayEt();
  if (etHour < 10) return { time: `${today}T10:00:00${offset}`, label: "10:00 AM ET" };
  if (etHour < 13) return { time: `${today}T13:00:00${offset}`, label: "1:00 PM ET" };
  return null; // No more scheduled runs today
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeTeamCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pickKey(value) {
  return `${normalizeName(value.player)}|${normalizeTeamCode(value.team)}|${normalizeTeamCode(value.opponent)}`;
}

function parseInningsPitched(value) {
  if (value == null) return null;
  const [whole, partial = "0"] = String(value).split(".");
  const outs = Number(whole) * 3 + Number(partial);
  return Number.isFinite(outs) ? outs / 3 : null;
}

function computeHr9(homeRuns, inningsPitched) {
  const innings = parseInningsPitched(inningsPitched);
  const hr = Number(homeRuns);
  if (!Number.isFinite(innings) || innings <= 0 || !Number.isFinite(hr)) return null;
  return (hr * 9) / innings;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const filtered = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null;
}

function logValidationWarning(message, context) {
  console.warn(`[hr-props] ${message}${context ? ` ${JSON.stringify(context)}` : ""}`);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

export function sanitizePercentStat(value, label, context) {
  const parsed = toFiniteNumber(value);
  if (parsed == null) return null;
  if (parsed < 0 || parsed > 100) {
    logValidationWarning(`Invalid ${label} percentage from source; dropping stat value.`, { ...context, value: parsed });
    return null;
  }
  return parsed;
}

function sanitizeRatioStat(value, label, context) {
  const parsed = toFiniteNumber(value);
  if (parsed == null) return null;
  if (parsed < 0 || parsed > 1) {
    logValidationWarning(`Invalid ${label} ratio from source; dropping stat value.`, { ...context, value: parsed });
    return null;
  }
  return parsed;
}

function sanitizeMetric(value, label, context) {
  const parsed = toFiniteNumber(value);
  if (parsed == null) return null;
  if (parsed < 0) {
    logValidationWarning(`Invalid ${label} metric from source; dropping stat value.`, { ...context, value: parsed });
    return null;
  }
  return parsed;
}

function normalizeVenueKey(venue) {
  return normalizeText(venue).replace(/\s+/g, " ");
}

export function parkFactorForVenue(...venues) {
  for (const venue of venues) {
    const key = normalizeVenueKey(venue);
    if (!key) continue;
    const canonical = PARK_FACTOR_ALIASES[key] ?? key;
    const factor = DEFAULT_PARK_FACTORS[canonical];
    if (Number.isFinite(factor)) return factor;
  }
  return 1;
}

function percentileRank(values, value, { invert = false } = {}) {
  const filtered = values.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry)).sort((left, right) => left - right);
  if (!filtered.length || !Number.isFinite(value)) return null;
  const lessThanOrEqual = filtered.filter((entry) => entry <= value).length;
  const rank = filtered.length === 1 ? 0.5 : (lessThanOrEqual - 1) / (filtered.length - 1);
  const scaled = clampNumber(rank * 100, 0, 100);
  return invert ? 100 - scaled : scaled;
}

function scaleToRange(value, min, max, { invert = false } = {}) {
  if (!Number.isFinite(value)) return null;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 50;
  const scaled = clampNumber(((value - min) / (max - min)) * 100, 0, 100);
  return invert ? 100 - scaled : scaled;
}

function blendRawAndPercentile(value, values, min, max, options) {
  const rawScore = scaleToRange(value, min, max, options);
  const percentileScore = percentileRank(values, value, options);
  const components = [
    Number.isFinite(rawScore) ? { value: rawScore, weight: 0.6 } : null,
    Number.isFinite(percentileScore) ? { value: percentileScore, weight: 0.4 } : null,
  ].filter(Boolean);
  return computeWeightedScore(components);
}

function computeWeightedScore(components) {
  let total = 0;
  let weightTotal = 0;
  for (const component of components) {
    if (!component || !Number.isFinite(component.value) || !Number.isFinite(component.weight) || component.weight <= 0) continue;
    total += component.value * component.weight;
    weightTotal += component.weight;
  }
  return weightTotal ? total / weightTotal : null;
}

function roundNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function deriveRatePercent(numerator, denominator) {
  const top = toFiniteNumber(numerator);
  const bottom = toFiniteNumber(denominator);
  if (top == null || bottom == null || bottom <= 0) return null;
  return (top / bottom) * 100;
}

function deriveFlyBallRate(seasonStats) {
  const airOuts = toFiniteNumber(seasonStats?.airOuts);
  const groundOuts = toFiniteNumber(seasonStats?.groundOuts);
  if (airOuts == null || groundOuts == null || airOuts + groundOuts <= 0) return null;
  return (airOuts / (airOuts + groundOuts)) * 100;
}

function directionToCompass(degrees) {
  const value = toFiniteNumber(degrees);
  if (value == null) return "—";
  const normalized = ((value % 360) + 360) % 360;
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return directions[Math.round(normalized / 22.5) % directions.length];
}

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/html, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.mlb.com/",
  "Origin": "https://www.mlb.com",
};

async function fetchJson(url) {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) throw new Error(`Request failed ${response.status} for ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) throw new Error(`Request failed ${response.status} for ${url}`);
  return response.text();
}

async function loadSchedule() {
  const date = getTodayEt();
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,linescore,probablePitcher`;
  const json = await fetchJson(url);
  const games = json?.dates?.[0]?.games ?? [];
  return games.map((game) => ({
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    venue: game.venue?.name ?? "Unknown Venue",
    away: {
      id: game?.teams?.away?.team?.id ?? null,
      abbreviation: game?.teams?.away?.team?.abbreviation ?? "AWY",
      name: game?.teams?.away?.team?.name ?? "Away",
      probablePitcher: game?.teams?.away?.probablePitcher ?? null,
    },
    home: {
      id: game?.teams?.home?.team?.id ?? null,
      abbreviation: game?.teams?.home?.team?.abbreviation ?? "HME",
      name: game?.teams?.home?.team?.name ?? "Home",
      probablePitcher: game?.teams?.home?.probablePitcher ?? null,
    },
  }));
}

async function fetchBoxscore(gamePk) {
  return fetchJson(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
}

function extractLineupFromTeamBox(boxTeam) {
  if (!boxTeam) return [];
  const order = Array.isArray(boxTeam.battingOrder) ? boxTeam.battingOrder : [];
  const players = boxTeam.players || {};
  const lineup = [];

  if (order.length) {
    for (const playerRef of order) {
      const id = Number(String(playerRef).replace(/..$/, ""));
      const player = players[`ID${id}`];
      if (player) lineup.push(player.person);
      if (lineup.length === 9) break;
    }
  }

  if (lineup.length < 9) {
    const fallback = Object.values(players)
      .filter((player) => player?.battingOrder)
      .sort((a, b) => String(a.battingOrder).localeCompare(String(b.battingOrder)))
      .map((player) => player.person);

    for (const person of fallback) {
      if (!lineup.some((item) => item.id === person.id)) lineup.push(person);
      if (lineup.length === 9) break;
    }
  }

  return lineup.slice(0, 9);
}

async function fetchTeamSeasonSchedule(teamId) {
  if (!teamId) return [];
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${SEASON}&teamId=${teamId}&hydrate=linescore`);
  return (json?.dates || []).flatMap((dateBlock) => dateBlock.games || []);
}

async function fetchLastKnownLineup(teamId) {
  if (!teamId) return [];
  const games = await fetchTeamSeasonSchedule(teamId);
  const latestComplete = games
    .filter((game) => game?.status?.codedGameState === "F" || game?.status?.detailedState === "Final")
    .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())[0];

  if (!latestComplete?.gamePk) return [];
  const boxscore = await fetchBoxscore(latestComplete.gamePk);
  const teamSide = boxscore?.teams?.home?.team?.id === teamId ? boxscore?.teams?.home : boxscore?.teams?.away;
  return extractLineupFromTeamBox(teamSide);
}

const personCache = new Map();
async function fetchPerson(id) {
  if (!id) return null;
  if (personCache.has(id)) return personCache.get(id);
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}`);
  const person = json?.people?.[0] ?? null;
  personCache.set(id, person);
  return person;
}

const pitcherSeasonCache = new Map();
async function fetchPitcherSeasonStats(id) {
  if (!id) return null;
  if (pitcherSeasonCache.has(id)) return pitcherSeasonCache.get(id);
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&season=${SEASON}&group=pitching`);
  const stats = json?.stats?.[0]?.splits?.[0]?.stat ?? null;
  pitcherSeasonCache.set(id, stats);
  return stats;
}

const batterSeasonCache = new Map();
async function fetchBatterSeasonStats(id) {
  if (!id) return null;
  if (batterSeasonCache.has(id)) return batterSeasonCache.get(id);
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&season=${SEASON}&group=hitting`);
  const stats = json?.stats?.[0]?.splits?.[0]?.stat ?? null;
  batterSeasonCache.set(id, stats);
  return stats;
}

const gameLogCache = new Map();
async function fetchBatterHrGameLog(id) {
  if (!id) return [];
  if (gameLogCache.has(id)) return gameLogCache.get(id);
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=${SEASON}&group=hitting`);
  const splits = json?.stats?.[0]?.splits ?? [];
  const rows = splits.map((split) => ({
    date: split.date,
    homeRuns: safeNumber(split.stat?.homeRuns, 0),
  }));
  gameLogCache.set(id, rows);
  return rows;
}

function sumRecentHomeRuns(gameLogs, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return gameLogs.reduce((sum, row) => {
    const date = new Date(row.date);
    if (Number.isNaN(date.getTime()) || date < cutoff) return sum;
    return sum + safeNumber(row.homeRuns, 0);
  }, 0);
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((value) => value.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function fetchStatcastBatterMap() {
  const url = `https://baseballsavant.mlb.com/leaderboard/custom?year=${SEASON}&type=batter&filter=&min=1&selections=player_id,player_name,barrel_batted_rate,hard_hit_percent,exit_velocity_avg,isolated_power,pull_percent,xba,whiff_percent,k_percent,bb_percent&sort=barrel_batted_rate&sortDir=desc&chart=false&csv=true`;
  try {
    const text = await fetchText(url);
    if (!text || text.startsWith("<!DOCTYPE")) return { rowsByPlayerId: new Map(), averages: {} };
    const rows = parseCsv(text);
    const rowsByPlayerId = new Map(rows.map((row) => [String(row.player_id), row]));
    return {
      rowsByPlayerId,
      averages: {
        barrelRate: average(rows.map((row) => sanitizePercentStat(row.barrel_batted_rate, "Barrel%", { playerId: row.player_id }))),
        hardHitRate: average(rows.map((row) => sanitizePercentStat(row.hard_hit_percent, "Hard Hit%", { playerId: row.player_id }))),
        exitVelo: average(rows.map((row) => sanitizeMetric(row.exit_velocity_avg, "Exit Velo", { playerId: row.player_id }))),
        pullRate: average(rows.map((row) => sanitizePercentStat(row.pull_percent, "Pull%", { playerId: row.player_id }))),
        xba: average(rows.map((row) => sanitizeRatioStat(row.xba, "xBA", { playerId: row.player_id }))),
        whiffRate: average(rows.map((row) => sanitizePercentStat(row.whiff_percent, "Whiff%", { playerId: row.player_id }))),
        kRate: average(rows.map((row) => sanitizePercentStat(row.k_percent, "K%", { playerId: row.player_id }))),
        bbRate: average(rows.map((row) => sanitizePercentStat(row.bb_percent, "BB%", { playerId: row.player_id }))),
      },
    };
  } catch {
    return { rowsByPlayerId: new Map(), averages: {} };
  }
}


// FanGraphs pitcher leaderboard — FB% (flyball rate), HR, GS
// Used as a more reliable flyball% source than Statcast's fb_rate which often returns 0
async function fetchFanGraphsPitcherMap() {
  const url = `https://www.fangraphs.com/api/leaders/major-league/data?age=0&pos=all&stats=pit&lg=all&qual=0&season=${SEASON}&season1=${SEASON}&ind=0&team=0&rost=0&players=0&type=0&sortcol=7&sortdir=default&pageitems=300&pagenum=1`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.fangraphs.com/leaders/major-league",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const byMlbamId = new Map();
    for (const row of rows) {
      const mlbamId = String(row.xMLBAMID ?? "").trim();
      if (!mlbamId || mlbamId === "0") continue;
      const fbPct = typeof row["FB%"] === "number" ? Math.round(row["FB%"] * 1000) / 10 : null;
      const hrTotal = typeof row.HR === "number" ? row.HR : null;
      const gs = typeof row.GS === "number" ? row.GS : null;
      const hrPerStart = (hrTotal != null && gs != null && gs > 0)
        ? Math.round((hrTotal / gs) * 100) / 100
        : null;
      byMlbamId.set(mlbamId, { flyBallRate: fbPct, hrTotal, gs, hrPerStart });
    }
    console.log(`FanGraphs: loaded ${byMlbamId.size} pitcher entries.`);
    return byMlbamId;
  } catch (err) {
    console.warn("FanGraphs pitcher fetch failed:", err.message);
    return new Map();
  }
}

// MLB Stats API pitcher game log — last N starts with HRs allowed, plus season flyball data
const pitcherGameLogCache = new Map();
async function fetchPitcherGameLog(id) {
  if (!id) return { starts: [], seasonAirOuts: 0, seasonGroundOuts: 0 };
  if (pitcherGameLogCache.has(id)) return pitcherGameLogCache.get(id);
  try {
    const json = await fetchJson(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=${SEASON}&group=pitching`);
    const splits = json?.stats?.[0]?.splits ?? [];
    // Only count starts (not relief appearances)
    const starts = splits
      .filter(s => (s.stat?.gamesStarted ?? 0) >= 1)
      .map(s => ({
        date: s.date,
        homeRuns: s.stat?.homeRuns ?? 0,
        airOuts: s.stat?.airOuts ?? 0,
        groundOuts: s.stat?.groundOuts ?? 0,
      }));
    // Season aggregate for flyball% (airOuts / (airOuts + groundOuts))
    const seasonAirOuts = starts.reduce((sum, g) => sum + g.airOuts, 0);
    const seasonGroundOuts = starts.reduce((sum, g) => sum + g.groundOuts, 0);
    const result = { starts, seasonAirOuts, seasonGroundOuts };
    pitcherGameLogCache.set(id, result);
    return result;
  } catch {
    const empty = { starts: [], seasonAirOuts: 0, seasonGroundOuts: 0 };
    pitcherGameLogCache.set(id, empty);
    return empty;
  }
}

async function fetchStatcastPitcherMap() {
  const url = `https://baseballsavant.mlb.com/leaderboard/custom?year=${SEASON}&type=pitcher&filter=&min=1&selections=player_id,player_name,xera,hard_hit_percent,barrel_batted_rate,whiff_percent,k_percent,bb_percent,fb_rate,exit_velocity_avg&sort=hard_hit_percent&sortDir=desc&chart=false&csv=true`;
  try {
    const text = await fetchText(url);
    if (!text || text.startsWith("<!DOCTYPE")) return { rowsByPlayerId: new Map(), averages: {} };
    const rows = parseCsv(text);
    const rowsByPlayerId = new Map(rows.map((row) => [String(row.player_id), row]));
    return {
      rowsByPlayerId,
      averages: {
        xera: average(rows.map((row) => sanitizeMetric(row.xera, "xERA", { playerId: row.player_id }))),
        hardHitRate: average(rows.map((row) => sanitizePercentStat(row.hard_hit_percent, "Pitcher Hard Hit%", { playerId: row.player_id }))),
        barrelRate: average(rows.map((row) => sanitizePercentStat(row.barrel_batted_rate, "Pitcher Barrel%", { playerId: row.player_id }))),
        flyBallRate: average(rows.map((row) => sanitizePercentStat(row.fb_rate, "Pitcher Fly Ball%", { playerId: row.player_id }))),
        whiffRate: average(rows.map((row) => sanitizePercentStat(row.whiff_percent, "Pitcher Whiff%", { playerId: row.player_id }))),
        kRate: average(rows.map((row) => sanitizePercentStat(row.k_percent, "Pitcher K%", { playerId: row.player_id }))),
        bbRate: average(rows.map((row) => sanitizePercentStat(row.bb_percent, "Pitcher BB%", { playerId: row.player_id }))),
        exitVelo: average(rows.map((row) => sanitizeMetric(row.exit_velocity_avg, "Pitcher Exit Velo", { playerId: row.player_id }))),
      },
    };
  } catch {
    return { rowsByPlayerId: new Map(), averages: {} };
  }
}

export function extractPropFinderWeatherGames(html) {
  const results = [];
  let start = 0;

  while ((start = html.indexOf("{\\\"id\\\":", start)) >= 0) {
    let depth = 0;
    let end = -1;

    for (let index = start; index < html.length; index += 1) {
      const char = html[index];
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    if (end < 0) break;
    const candidate = html.slice(start, end);
    start = end;

    if (!candidate.includes("weatherData\\\":[")) continue;
    if (!candidate.includes("ballpark\\\":{")) continue;
    if (!candidate.includes("homeTeam\\\":{") || !candidate.includes("visitorTeam\\\":{")) continue;

    try {
      results.push(JSON.parse(candidate.replace(/\\"/g, "\"")));
    } catch {
      continue;
    }
  }

  return results;
}

function pickWeatherPoint(weatherData, gameDate) {
  if (!Array.isArray(weatherData) || !weatherData.length) return null;
  const targetEpoch = Math.round(new Date(gameDate).getTime() / 1000);
  if (!Number.isFinite(targetEpoch)) return weatherData[0];

  return weatherData.reduce((closest, entry) => {
    if (!closest) return entry;
    const currentDiff = Math.abs(safeNumber(entry.dateTimeEpoch, targetEpoch) - targetEpoch);
    const closestDiff = Math.abs(safeNumber(closest.dateTimeEpoch, targetEpoch) - targetEpoch);
    return currentDiff < closestDiff ? entry : closest;
  }, null);
}

async function fetchPropFinderWeatherMap() {
  try {
    const html = await fetchText("https://propfinder.app/weather");
    const games = extractPropFinderWeatherGames(html);
    const byGameKey = new Map();

    for (const game of games) {
      const awayCode = normalizeTeamCode(game?.visitorTeam?.code);
      const homeCode = normalizeTeamCode(game?.homeTeam?.code);
      if (!awayCode || !homeCode) continue;

      const weatherPoint = pickWeatherPoint(game.weatherData, game.gameDate);
      const roofType = normalizeText(game?.ballpark?.roofType) || "Unknown";
      const precipitation = toFiniteNumber(weatherPoint?.precipProb ?? weatherPoint?.precip, null);

      byGameKey.set(`${awayCode}@${homeCode}`, {
        stadium: normalizeText(game?.ballpark?.name) || "Unknown Venue",
        roofType,
        temperature: toFiniteNumber(weatherPoint?.temp, null),
        precipitation,
        windSpeed: toFiniteNumber(weatherPoint?.windSpeed, null),
        windDirection: directionToCompass(weatherPoint?.windDir),
        conditions: normalizeText(weatherPoint?.conditions) || "—",
      });
    }

    return byGameKey;
  } catch (error) {
    console.warn(`PropFinder weather data unavailable. Proceeding without weather context. ${error instanceof Error ? error.message : error}`);
    return new Map();
  }
}

function normalizeMetric(values, value) {
  const filtered = values.filter((entry) => Number.isFinite(entry));
  if (!filtered.length || !Number.isFinite(value)) return 50;
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

export function computePitcherMatchupRatings(pitcher, contexts) {
  const hrVs = computeWeightedScore([
    { value: scaleToRange(pitcher.xera, 2.5, 6.5), weight: 0.3 },
    { value: blendRawAndPercentile(pitcher.hardHitRate, contexts.hardHitValues, 28, 55), weight: 0.25 },
    { value: blendRawAndPercentile(pitcher.flyBallRate, contexts.flyBallValues, 25, 50), weight: 0.2 },
    { value: blendRawAndPercentile(pitcher.barrelRate, contexts.barrelValues, 4, 14), weight: 0.25 },
  ]);

  const hitsVs = computeWeightedScore([
    { value: scaleToRange(pitcher.xera, 2.5, 6.5), weight: 0.25 },
    { value: blendRawAndPercentile(pitcher.hardHitRate, contexts.hardHitValues, 28, 55), weight: 0.15 },
    { value: blendRawAndPercentile(pitcher.flyBallRate, contexts.flyBallValues, 25, 50), weight: 0.1 },
    { value: blendRawAndPercentile(pitcher.barrelRate, contexts.barrelValues, 4, 14), weight: 0.1 },
    { value: scaleToRange(pitcher.bbRate, 3, 12), weight: 0.15 },
    { value: scaleToRange(pitcher.kRate, 15, 32, { invert: true }), weight: 0.15 },
    { value: scaleToRange(pitcher.whiffRate, 18, 35, { invert: true }), weight: 0.1 },
  ]);

  const kVs = computeWeightedScore([
    { value: blendRawAndPercentile(pitcher.kRate, contexts.kValues, 15, 32), weight: 0.45 },
    { value: blendRawAndPercentile(pitcher.whiffRate, contexts.whiffValues, 18, 35), weight: 0.35 },
    { value: blendRawAndPercentile(pitcher.bbRate, contexts.bbValues, 3, 12, { invert: true }), weight: 0.2 },
  ]);

  return {
    hrVs: roundNumber(hrVs, 1),
    hitsVs: roundNumber(hitsVs, 1),
    kVs: roundNumber(kVs, 1),
  };
}

// Classify pitcher as starter or reliever based on typical IP patterns
function classifyPitcherRole(pitcher) {
  // All probable pitchers are starters; only flag reliever if no GS on record
  if (pitcher.seasonGS != null && pitcher.seasonGS === 0) return "reliever";
  return "starter";
}

// Get average IP for pitcher role
function getAverageIPForRole(role) {
  return role === "starter" ? 5.5 : 1.5;
}

// Calculate average IP per game started from real season stats
function calculateProjectedInnings(pitcher) {
  const role = classifyPitcherRole(pitcher);
  // Use real season IP / GS if available
  if (pitcher.seasonIP != null && pitcher.seasonGS != null && pitcher.seasonGS > 0) {
    const avgIP = pitcher.seasonIP / pitcher.seasonGS;
    const minIP = role === "starter" ? 3.0 : 0.5;
    const maxIP = role === "starter" ? 8.0 : 3.0;
    return Math.max(minIP, Math.min(maxIP, roundNumber(avgIP, 1)));
  }
  // Fallback: role-based default
  return getAverageIPForRole(role);
}

// Calculate real K/9 from season strikeouts and innings pitched
function calculateProjectedK9(pitcher) {
  // Use real season SO and IP if available
  if (pitcher.seasonStrikeOuts != null && pitcher.seasonIP != null && pitcher.seasonIP > 0) {
    const k9 = (pitcher.seasonStrikeOuts / pitcher.seasonIP) * 9;
    return roundNumber(Math.max(1, Math.min(15, k9)), 1);
  }
  // Fallback: estimate from kRate%
  const baseK9 = (pitcher.kRate ?? 20) / 100 * 27;
  const skillMult = (pitcher.whiffRate ?? 25) / 25;
  return roundNumber(Math.max(3, Math.min(15, baseK9 * skillMult)), 1);
}

// Calculate projected Ks for the game
function calculateProjectedKs(projectedIP, projectedK9) {
  return roundNumber((projectedIP * projectedK9) / 9, 1);
}

function computeWeatherBoost(gameContext) {
  if (!gameContext || gameContext.roofType !== "Open") return 0;
  let boost = 0;

  if (Number.isFinite(gameContext.temperature)) {
    boost += clampNumber((gameContext.temperature - 68) * 0.35, -6, 6);
  }
  if (Number.isFinite(gameContext.precipitation)) {
    boost += clampNumber((12 - gameContext.precipitation) * 0.2, -4, 2.4);
  }

  return roundNumber(clampNumber(boost, -10, 10), 1) ?? 0;
}

export function computeBatterHrScore(batter, contexts) {
  return roundNumber(computeWeightedScore([
    { value: blendRawAndPercentile(batter.barrelRate, contexts.barrelValues, 3, 20), weight: 0.22 },
    { value: blendRawAndPercentile(batter.hardHitRate, contexts.hardHitValues, 25, 60), weight: 0.18 },
    { value: blendRawAndPercentile(batter.xba, contexts.xbaValues, 0.18, 0.34), weight: 0.12 },
    { value: blendRawAndPercentile(batter.whiffRate, contexts.whiffValues, 15, 38, { invert: true }), weight: 0.08 },
    { value: normalizeMetric(contexts.last7Values, batter.last7HR), weight: 0.1 },
    { value: normalizeMetric(contexts.last30Values, batter.last30HR), weight: 0.1 },
    { value: batter.opposingPitcherHrVs, weight: 0.15 },
    { value: normalizeMetric(contexts.parkValues, batter.parkFactor), weight: 0.03 },
    { value: scaleToRange((batter.weatherBoost ?? 0) + 10, 0, 20), weight: 0.02 },
  ]), 1);
}

export function deriveAngleTags(batter, gameContext) {
  const tags = [];
  if (normalizeText(batter.opposingPitcher).toUpperCase() === "TBD") return tags;

  const powerBase = computeWeightedScore([
    { value: blendRawAndPercentile(batter.barrelRate, [batter.barrelRate], 3, 20), weight: 0.5 },
    { value: blendRawAndPercentile(batter.hardHitRate, [batter.hardHitRate], 25, 60), weight: 0.5 },
  ]);
  const hrScore = toFiniteNumber(batter.hrScore);

  if (Number.isFinite(powerBase) && powerBase >= 68 && safeNumber(batter.opposingPitcherHrVs, 0) >= 60) {
    tags.push("HR damage edge");
  }
  if (toFiniteNumber(batter.kRate) != null && batter.kRate <= 18 && safeNumber(batter.opposingPitcherHitsVs, 0) >= 60 && safeNumber(hrScore, 0) >= 45) {
    tags.push("Contact edge");
  }
  if (toFiniteNumber(batter.whiffRate) != null && batter.whiffRate <= 24 && safeNumber(batter.opposingPitcherKVs, 100) <= 40 && safeNumber(hrScore, 0) >= 45) {
    tags.push("Low-K matchup");
  }
  if (safeNumber(gameContext?.parkFactor, 1) >= 1.15 || safeNumber(batter.weatherBoost, 0) >= 4.5) {
    tags.push("Park boost");
  }

  return tags.slice(0, 2);
}

function formatTopStats(player) {
  const stats = [
    { label: "Barrel%", value: player.barrelRate },
    { label: "Hard Hit%", value: player.hardHitRate },
    { label: "xBA", value: player.xba },
    { label: "Pitcher HR VS", value: player.opposingPitcherHrVs },
    { label: "Last 7 HR", value: player.last7HR },
  ];
  return stats
    .sort((left, right) => safeNumber(right.value) - safeNumber(left.value))
    .slice(0, 2)
    .map((entry) => `${entry.label}=${Number(entry.value).toFixed(entry.label === "xBA" ? 3 : 1)}`);
}

function validateBatterRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Generated zero HR prop rows. Existing files were preserved.");
  }

  const validated = rows.map((row) => {
    if (!isPlainObject(row)) {
      throw new Error("Generated HR prop payload contains a non-object row.");
    }

    const normalized = {
      player: normalizeText(row.player),
      position: normalizeText(row.position) || "UTIL",
      team: normalizeTeamCode(row.team),
      opponent: normalizeTeamCode(row.opponent),
      opposingPitcher: normalizeText(row.opposingPitcher) || "TBD",
      opposingPitcherId: toFiniteNumber(row.opposingPitcherId),
      gameKey: normalizeText(row.gameKey),
      pitcherHand: normalizeText(row.pitcherHand) || "R",
      ballpark: normalizeText(row.ballpark) || "Unknown Venue",
      parkFactor: toFiniteNumber(row.parkFactor),
      barrelRate: toFiniteNumber(row.barrelRate),
      hardHitRate: toFiniteNumber(row.hardHitRate),
      exitVelo: toFiniteNumber(row.exitVelo),
      iso: toFiniteNumber(row.iso),
      hrFBRatio: toFiniteNumber(row.hrFBRatio),
      pullRate: toFiniteNumber(row.pullRate),
      xba: toFiniteNumber(row.xba),
      kRate: toFiniteNumber(row.kRate),
      bbRate: toFiniteNumber(row.bbRate),
      whiffRate: toFiniteNumber(row.whiffRate),
      last7HR: toFiniteNumber(row.last7HR),
      last30HR: toFiniteNumber(row.last30HR),
      opposingPitcherHrVs: toFiniteNumber(row.opposingPitcherHrVs),
      opposingPitcherHitsVs: toFiniteNumber(row.opposingPitcherHitsVs),
      opposingPitcherKVs: toFiniteNumber(row.opposingPitcherKVs),
      weatherBoost: toFiniteNumber(row.weatherBoost, 0),
      hrScore: toFiniteNumber(row.hrScore),
      hrScoreRank: toFiniteNumber(row.hrScoreRank),
      angleTags: Array.isArray(row.angleTags) ? row.angleTags.map((entry) => normalizeText(entry)).filter(Boolean).slice(0, 3) : [],
      pitcherXera: toFiniteNumber(row.pitcherXera) ?? null,
      pitcherRegressionScore: toFiniteNumber(row.pitcherRegressionScore) ?? null,
      pitcherFlyBallRate: toFiniteNumber(row.pitcherFlyBallRate) ?? null,
    };

    if (!normalized.player || !normalized.team || !normalized.opponent) {
      throw new Error(`Generated HR prop row is missing identity fields: ${JSON.stringify(row)}`);
    }

    const requiredNumbers = [
      normalized.parkFactor,
      normalized.last7HR,
      normalized.last30HR,
      normalized.opposingPitcherHrVs,
      normalized.opposingPitcherHitsVs,
      normalized.opposingPitcherKVs,
      normalized.hrScore,
      normalized.hrScoreRank,
    ];

    if (requiredNumbers.some((value) => value == null)) {
      throw new Error(`Generated HR prop row has invalid numeric fields for ${normalized.player}.`);
    }

    return normalized;
  });

  return validated;
}

// Pitcher xERA multiplier — same scale used across all pipeline stages
function xeraMult(xera) {
  if (xera == null) return 1.0;
  if (xera <= 2.5) return 0.80;
  if (xera <= 3.0) return 0.85;
  if (xera <= 3.5) return 0.91;
  if (xera <= 4.0) return 0.96;
  if (xera <= 4.5) return 1.00;
  if (xera <= 5.0) return 1.05;
  if (xera <= 5.5) return 1.10;
  return 1.15;
}

function validatePitcherRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Generated zero pitcher matchup rows. Existing files were preserved.");
  }

  return rows.map((row) => {
    const normalized = {
      gameKey: normalizeText(row.gameKey),
      pitcher: normalizeText(row.pitcher),
      pitcherId: toFiniteNumber(row.pitcherId),
      team: normalizeTeamCode(row.team),
      opponent: normalizeTeamCode(row.opponent),
      hand: normalizeText(row.hand) || "R",
      ballpark: normalizeText(row.ballpark) || "Unknown Venue",
      parkFactor: toFiniteNumber(row.parkFactor),
      xera: toFiniteNumber(row.xera),
      hardHitRate: toFiniteNumber(row.hardHitRate),
      flyBallRate: toFiniteNumber(row.flyBallRate),
      barrelRate: toFiniteNumber(row.barrelRate),
      kRate: toFiniteNumber(row.kRate),
      bbRate: toFiniteNumber(row.bbRate),
      whiffRate: toFiniteNumber(row.whiffRate),
      last7HR: toFiniteNumber(row.last7HR) ?? 0,
      hrPerStart: toFiniteNumber(row.hrPerStart) ?? null,
      hrVs: toFiniteNumber(row.hrVs),
      hitsVs: toFiniteNumber(row.hitsVs),
      kVs: toFiniteNumber(row.kVs),
      role: normalizeText(row.role) || "reliever",
      projectedIP: toFiniteNumber(row.projectedIP),
      projectedK9: toFiniteNumber(row.projectedK9),
      projectedKs: toFiniteNumber(row.projectedKs),
      kLine: toFiniteNumber(row.kLine),
      kAdjustment: toFiniteNumber(row.kAdjustment, 0),
      kOddsOver: normalizeText(row.kOddsOver),
      kOddsUnder: normalizeText(row.kOddsUnder),
    };

    if (!normalized.pitcher || !normalized.team || !normalized.opponent) {
      throw new Error(`Generated pitcher row is missing identity fields: ${JSON.stringify(row)}`);
    }

    if ([normalized.hrVs, normalized.hitsVs, normalized.kVs].some((value) => value == null)) {
      throw new Error(`Generated pitcher row has invalid matchup scores for ${normalized.pitcher}.`);
    }

    return normalized;
  });
}

function validateGameRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Generated zero game context rows. Existing files were preserved.");
  }

  return rows.map((row) => ({
    gameKey: normalizeText(row.gameKey),
    matchup: normalizeText(row.matchup),
    awayTeam: normalizeTeamCode(row.awayTeam),
    homeTeam: normalizeTeamCode(row.homeTeam),
    stadium: normalizeText(row.stadium) || "Unknown Venue",
    roofType: normalizeText(row.roofType) || "Unknown",
    temperature: toFiniteNumber(row.temperature),
    precipitation: toFiniteNumber(row.precipitation),
    windSpeed: toFiniteNumber(row.windSpeed),
    windDirection: normalizeText(row.windDirection) || "—",
    conditions: normalizeText(row.conditions) || "—",
    parkFactor: toFiniteNumber(row.parkFactor),
  }));
}

function validateRawPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("Generated raw HR props payload is not an object.");
  }

  return {
    date: normalizeText(payload.date) || getTodayEt(),
    generatedAt: normalizeText(payload.generatedAt) || new Date().toISOString(),
    nextRunAt: payload.nextRunAt ?? null,
    pendingGames: Array.isArray(payload.pendingGames) ? payload.pendingGames : [],
    games: validateGameRows(payload.games),
    pitchers: validatePitcherRows(payload.pitchers),
    batters: validateBatterRows(payload.batters),
  };
}

function toStringList(value, limit = 2) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .slice(0, limit);
}

function buildFallbackBullets(player) {
  return [
    `HR score ${player.hrScore.toFixed(1)} (#${player.hrScoreRank})`,
    `Pitcher HR VS ${safeNumber(player.opposingPitcherHrVs, 0).toFixed(1)} at park ${player.parkFactor.toFixed(2)}`,
  ];
}

function buildFallbackPick(player) {
  return {
    player: player.player,
    team: player.team,
    opponent: player.opponent,
    opposingPitcher: player.opposingPitcher,
    hrScoreRank: player.hrScoreRank,
    topStats: formatTopStats(player),
    bullets: buildFallbackBullets(player),
  };
}

function createRowLookups(rows) {
  const byExact = new Map();
  const byPlayerTeam = new Map();

  for (const row of rows) {
    byExact.set(pickKey(row), row);
    const playerTeamKey = `${normalizeName(row.player)}|${row.team}`;
    const existing = byPlayerTeam.get(playerTeamKey);
    if (!existing) {
      byPlayerTeam.set(playerTeamKey, row);
    } else {
      byPlayerTeam.set(playerTeamKey, null);
    }
  }

  return { byExact, byPlayerTeam };
}

function normalizePickCandidate(candidate, lookups) {
  if (!isPlainObject(candidate)) return null;

  const player = normalizeText(candidate.player);
  const team = normalizeTeamCode(candidate.team);
  const candidateOpponent = normalizeTeamCode(candidate.opponent ?? candidate.opp);
  const exactKey = `${normalizeName(player)}|${team}|${candidateOpponent}`;
  const playerTeamKey = `${normalizeName(player)}|${team}`;
  const matchedRow = lookups.byExact.get(exactKey) ?? lookups.byPlayerTeam.get(playerTeamKey) ?? null;

  if (!matchedRow) return null;

  return {
    player: matchedRow.player,
    team: matchedRow.team,
    opponent: matchedRow.opponent,
    opposingPitcher: matchedRow.opposingPitcher,
    hrScoreRank: matchedRow.hrScoreRank,
    topStats: toStringList(candidate.topStats).length ? toStringList(candidate.topStats) : formatTopStats(matchedRow),
    bullets: toStringList(candidate.bullets).length ? toStringList(candidate.bullets) : buildFallbackBullets(matchedRow),
  };
}

function buildFallbackSections(rows) {
  return {
    bestBets: rows.slice(0, PICK_LIMITS.bestBets).map(buildFallbackPick),
    valueBets: rows.slice(PICK_LIMITS.bestBets, PICK_LIMITS.bestBets + PICK_LIMITS.valueBets).map(buildFallbackPick),
    longshots: rows
      .slice(PICK_LIMITS.bestBets + PICK_LIMITS.valueBets, PICK_LIMITS.bestBets + PICK_LIMITS.valueBets + PICK_LIMITS.longshots)
      .map(buildFallbackPick),
  };
}

function mergePickSection(sectionName, sourceValue, fallbackPicks, lookups) {
  const limit = PICK_LIMITS[sectionName];
  const picks = Array.isArray(sourceValue)
    ? sourceValue.map((entry) => normalizePickCandidate(entry, lookups)).filter(Boolean)
    : [];
  const merged = [];
  const seen = new Set();

  for (const pick of picks) {
    const key = pickKey(pick);
    if (seen.has(key)) continue;
    merged.push(pick);
    seen.add(key);
    if (merged.length === limit) break;
  }

  for (const pick of fallbackPicks) {
    const key = pickKey(pick);
    if (seen.has(key)) continue;
    merged.push(pick);
    seen.add(key);
    if (merged.length === limit) break;
  }

  if (merged.length < limit) {
    console.warn(`MLB HR props ${sectionName} only produced ${merged.length}/${limit} validated picks.`);
  }

  return merged;
}

function buildFallbackSlatePreview(rows) {
  const featuredParks = Array.from(new Set(rows.slice(0, 8).map((row) => row.ballpark))).slice(0, 3);
  return {
    slateOverview: rows.length
      ? `Model ranked ${rows.length} hitters for today's slate. The strongest park environments in the top of the board are ${featuredParks.join(", ")}.`
      : "No validated HR prop rows were available for today's slate.",
    modelNote: "When AI commentary is unavailable, picks fall back to the model's top-ranked hitters using barrel rate, hard-hit rate, exit velocity, park factor, pitcher HR/9, and recent HR form.",
  };
}

function normalizeSlatePreview(value, fallbackPreview) {
  if (!isPlainObject(value)) return fallbackPreview;
  const slateOverview = normalizeText(value.slateOverview);
  const modelNote = normalizeText(value.modelNote);
  if (!slateOverview || !modelNote) return fallbackPreview;
  return { slateOverview, modelNote };
}

function buildBestBetsPayload(rows, picksResult, previewResult) {
  const fallbackSections = buildFallbackSections(rows);
  const lookups = createRowLookups(rows);
  return {
    date: getTodayEt(),
    generatedAt: new Date().toISOString(),
    slatePreview: normalizeSlatePreview(previewResult, buildFallbackSlatePreview(rows)),
    bestBets: mergePickSection("bestBets", picksResult?.bestBets, fallbackSections.bestBets, lookups),
    valueBets: mergePickSection("valueBets", picksResult?.valueBets, fallbackSections.valueBets, lookups),
    longshots: mergePickSection("longshots", picksResult?.longshots, fallbackSections.longshots, lookups),
  };
}

function extractMessageContent(rawContent) {
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent.map((item) => (typeof item === "string" ? item : item?.text ?? "")).join("").trim();
  }
  return "";
}

function cleanJsonText(rawText) {
  return rawText.replace(/```json\n?/gi, "").replace(/```\n?/gi, "").trim();
}

function extractJsonSnippet(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const firstArray = trimmed.indexOf("[");
  const firstObject = trimmed.indexOf("{");
  const firstIndex = [firstArray, firstObject].filter((value) => value >= 0).sort((left, right) => left - right)[0];
  if (firstIndex === undefined) throw new Error("No JSON opening bracket found in Grok response.");
  const opening = trimmed[firstIndex];
  const closing = opening === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = firstIndex; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === opening) depth += 1;
    if (char === closing) {
      depth -= 1;
      if (depth === 0) return trimmed.slice(firstIndex, index + 1);
    }
  }
  throw new Error("Could not find a complete JSON block in Grok response.");
}

async function callGrokWithRetry(prompt, maxRetries = 3, validate) {
  for (let index = 0; index < maxRetries; index += 1) {
    try {
      const response = await fetch(GROK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROK_API_KEY || process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          max_tokens: 8000,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const content = extractMessageContent(data?.choices?.[0]?.message?.content);
      console.log("RAW RESPONSE:", content.slice(0, 300), "...");
      const parsed = JSON.parse(extractJsonSnippet(cleanJsonText(content)));
      if (validate) validate(parsed, content);
      return parsed;
    } catch (error) {
      console.log(`Attempt ${index + 1} failed: ${error instanceof Error ? error.message : error}`);
      if (index < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, index) * 1500));
      } else {
        throw error;
      }
    }
  }
}

function shouldSkip(force) {
  if (force || !existsSync(BEST_BETS_OUTPUT_PATH)) return false;
  try {
    const existing = JSON.parse(readFileSync(BEST_BETS_OUTPUT_PATH, "utf8"));
    return existing?.date === getTodayEt();
  } catch {
    return false;
  }
}

function buildSummary(players, limit) {
  return players.slice(0, limit).map((player) => [
    `player=${player.player}`,
    `team=${player.team}`,
    `opp=${player.opponent}`,
    `pitcher=${player.opposingPitcher}`,
    `pitcherHand=${player.pitcherHand}`,
    `park=${player.ballpark}`,
    `parkFactor=${player.parkFactor}`,
    `barrelRate=${player.barrelRate}`,
    `hardHitRate=${player.hardHitRate}`,
    `xba=${player.xba}`,
    `kRate=${player.kRate}`,
    `bbRate=${player.bbRate}`,
    `whiffRate=${player.whiffRate}`,
    `exitVelo=${player.exitVelo}`,
    `iso=${player.iso}`,
    `hrFBRatio=${player.hrFBRatio}`,
    `pullRate=${player.pullRate}`,
    `last7HR=${player.last7HR}`,
    `last30HR=${player.last30HR}`,
    `opposingPitcherHrVs=${player.opposingPitcherHrVs}`,
    `hrScore=${player.hrScore}`,
    `hrScoreRank=${player.hrScoreRank}`,
  ].join(" | ")).join("\n");
}

async function main() {
  ensureDataDir();
  if (!FORCE && getCurrentEtHour() < MIN_GENERATION_HOUR_ET) {
    console.log(`Skipping MLB HR props generation before ${MIN_GENERATION_HOUR_ET}:00 AM ET. Pass --force to override.`);
    return;
  }

  if (shouldSkip(FORCE)) {
    console.log("MLB HR props already generated today. Pass --force to regenerate.");
    return;
  }

  const schedule = await loadSchedule();
  if (!schedule.length) {
    throw new Error("MLB schedule returned zero games for today. Existing HR props files were preserved.");
  }

  const statcastBatters = await fetchStatcastBatterMap();
  const statcastPitchers = await fetchStatcastPitcherMap();
  const fangraphsPitchers = await fetchFanGraphsPitcherMap();
  const weatherByGameKey = await fetchPropFinderWeatherMap();
  const batterPool = [];
  const pitcherPool = [];
  const gamePool = [];
  const pendingGames = []; // games excluded because a pitcher hasn't been announced yet

  for (const game of schedule) {
    const gameKey = `${game.away.abbreviation}@${game.home.abbreviation}`;

    // Skip the entire game if BOTH pitchers are unannounced — nothing to score.
    // If only one side is TBD we still skip the whole game since cross-scoring
    // (scoring team A's batters vs team B's pitcher when team A's pitcher is TBD)
    // produces misleading half-matchups.
    const awayPitcherKnown = Boolean(game.away.probablePitcher?.id);
    const homePitcherKnown = Boolean(game.home.probablePitcher?.id);

    if (!awayPitcherKnown || !homePitcherKnown) {
      const missing = [
        !awayPitcherKnown ? game.away.abbreviation : null,
        !homePitcherKnown ? game.home.abbreviation : null,
      ].filter(Boolean);

      pendingGames.push({
        gameKey,
        matchup: `${game.away.abbreviation} @ ${game.home.abbreviation}`,
        venue: game.venue,
        missingPitcherSide: missing,
      });
      console.log(`[skip] ${gameKey} — pitcher TBD for: ${missing.join(", ")}`);
      continue;
    }
    const boxscore = await fetchBoxscore(game.gamePk).catch(() => null);
    const currentAwayLineup = extractLineupFromTeamBox(boxscore?.teams?.away);
    const currentHomeLineup = extractLineupFromTeamBox(boxscore?.teams?.home);
    const awayLineup = currentAwayLineup.length ? currentAwayLineup : await fetchLastKnownLineup(game.away.id);
    const homeLineup = currentHomeLineup.length ? currentHomeLineup : await fetchLastKnownLineup(game.home.id);

    const awayPitcherPerson = await fetchPerson(game.away.probablePitcher?.id ?? null);
    const homePitcherPerson = await fetchPerson(game.home.probablePitcher?.id ?? null);
    const awayPitcherStats = await fetchPitcherSeasonStats(game.away.probablePitcher?.id ?? null);
    const homePitcherStats = await fetchPitcherSeasonStats(game.home.probablePitcher?.id ?? null);
    const awayPitcherStatcast = statcastPitchers.rowsByPlayerId.get(String(game.away.probablePitcher?.id ?? ""));
    const homePitcherStatcast = statcastPitchers.rowsByPlayerId.get(String(game.home.probablePitcher?.id ?? ""));
    const awayFanGraphs = fangraphsPitchers.get(String(game.away.probablePitcher?.id ?? ""));
    const homeFanGraphs = fangraphsPitchers.get(String(game.home.probablePitcher?.id ?? ""));
    const awayGameLog = await fetchPitcherGameLog(game.away.probablePitcher?.id ?? null);
    const homeGameLog = await fetchPitcherGameLog(game.home.probablePitcher?.id ?? null);
    const weatherContext = weatherByGameKey.get(gameKey) ?? {
      stadium: game.venue,
      roofType: "Unknown",
      temperature: null,
      precipitation: null,
      windSpeed: null,
      windDirection: "—",
      conditions: "—",
    };
    const parkFactor = parkFactorForVenue(game.venue, weatherContext.stadium);
    const gameContext = {
      gameKey,
      matchup: `${game.away.abbreviation} @ ${game.home.abbreviation}`,
      awayTeam: game.away.abbreviation,
      homeTeam: game.home.abbreviation,
      stadium: weatherContext.stadium || game.venue,
      roofType: weatherContext.roofType,
      temperature: weatherContext.temperature,
      precipitation: weatherContext.precipitation,
      windSpeed: weatherContext.windSpeed,
      windDirection: weatherContext.windDirection,
      conditions: weatherContext.conditions,
      parkFactor,
    };
    gamePool.push(gameContext);

    const starterContexts = [
      {
        pitcherId: game.away.probablePitcher?.id ?? null,
        pitcherName: game.away.probablePitcher?.fullName ?? "TBD",
        pitcherPerson: awayPitcherPerson,
        seasonStats: awayPitcherStats,
        statcast: awayPitcherStatcast,
        fangraphs: awayFanGraphs,
        gameLog: awayGameLog,
        team: game.away.abbreviation,
        opponent: game.home.abbreviation,
      },
      {
        pitcherId: game.home.probablePitcher?.id ?? null,
        pitcherName: game.home.probablePitcher?.fullName ?? "TBD",
        pitcherPerson: homePitcherPerson,
        seasonStats: homePitcherStats,
        statcast: homePitcherStatcast,
        fangraphs: homeFanGraphs,
        gameLog: homeGameLog,
        team: game.home.abbreviation,
        opponent: game.away.abbreviation,
      },
    ];

    for (const starter of starterContexts) {
      pitcherPool.push({
        gameKey,
        pitcher: starter.pitcherName,
        pitcherId: starter.pitcherId,
        team: starter.team,
        opponent: starter.opponent,
        hand: starter.pitcherPerson?.pitchHand?.code ?? "R",
        ballpark: game.venue,
        parkFactor,
        xera: sanitizeMetric(starter.statcast?.xera, "xERA", { pitcherId: starter.pitcherId }),
        hardHitRate: sanitizePercentStat(starter.statcast?.hard_hit_percent, "Pitcher Hard Hit%", { pitcherId: starter.pitcherId }),
        flyBallRate: (() => {
          // Statcast fb_rate is not populated for 2026; derive from game log airOuts/groundOuts
          const total = starter.gameLog.seasonAirOuts + starter.gameLog.seasonGroundOuts;
          const derived = total > 0
            ? Math.round((starter.gameLog.seasonAirOuts / total) * 1000) / 10
            : null;
          return derived
            ?? sanitizePercentStat(starter.statcast?.fb_rate, "Pitcher Fly Ball%", { pitcherId: starter.pitcherId })
            ?? starter.fangraphs?.flyBallRate
            ?? null;
        })(),
        barrelRate: sanitizePercentStat(starter.statcast?.barrel_batted_rate, "Pitcher Barrel%", { pitcherId: starter.pitcherId }),
        kRate: sanitizePercentStat(starter.statcast?.k_percent, "Pitcher K%", { pitcherId: starter.pitcherId })
          ?? sanitizePercentStat(deriveRatePercent(starter.seasonStats?.strikeOuts, starter.seasonStats?.battersFaced), "Pitcher K%", { pitcherId: starter.pitcherId, source: "season-stats" }),
        bbRate: sanitizePercentStat(starter.statcast?.bb_percent, "Pitcher BB%", { pitcherId: starter.pitcherId })
          ?? sanitizePercentStat(deriveRatePercent(starter.seasonStats?.baseOnBalls, starter.seasonStats?.battersFaced), "Pitcher BB%", { pitcherId: starter.pitcherId, source: "season-stats" }),
        whiffRate: sanitizePercentStat(starter.statcast?.whiff_percent, "Pitcher Whiff%", { pitcherId: starter.pitcherId }),
        seasonStrikeOuts: toFiniteNumber(starter.seasonStats?.strikeOuts) ?? null,
        seasonIP: parseInningsPitched(starter.seasonStats?.inningsPitched) ?? null,
        seasonGS: toFiniteNumber(starter.seasonStats?.gamesStarted) ?? null,
        last7HR: starter.gameLog.starts.slice(-7).reduce((sum, g) => sum + g.homeRuns, 0),
        hrPerStart: starter.fangraphs?.hrPerStart
          ?? (() => {
            const gs = starter.gameLog.starts.length;
            const totalHR = starter.gameLog.starts.reduce((sum, g) => sum + g.homeRuns, 0);
            return gs > 0 ? Math.round((totalHR / gs) * 100) / 100 : null;
          })(),
      });
    }

    const pitcherContexts = [
      {
        lineup: awayLineup,
        battingTeam: game.away,
        opponent: game.home,
        opposingPitcher: game.home.probablePitcher?.fullName ?? "TBD",
        opposingPitcherId: game.home.probablePitcher?.id ?? null,
        pitcherHand: homePitcherPerson?.pitchHand?.code ?? "R",
        pitcherHr9: computeHr9(homePitcherStats?.homeRuns, homePitcherStats?.inningsPitched),
        gameKey,
        gameContext,
      },
      {
        lineup: homeLineup,
        battingTeam: game.home,
        opponent: game.away,
        opposingPitcher: game.away.probablePitcher?.fullName ?? "TBD",
        opposingPitcherId: game.away.probablePitcher?.id ?? null,
        pitcherHand: awayPitcherPerson?.pitchHand?.code ?? "R",
        pitcherHr9: computeHr9(awayPitcherStats?.homeRuns, awayPitcherStats?.inningsPitched),
        gameKey,
        gameContext,
      },
    ];

    for (const context of pitcherContexts) {
      for (const hitter of context.lineup.slice(0, 9)) {
        const person = await fetchPerson(hitter.id);
        const season = await fetchBatterSeasonStats(hitter.id);
        const gameLogs = await fetchBatterHrGameLog(hitter.id);
        const statcast = statcastBatters.rowsByPlayerId.get(String(hitter.id));
        const avg = safeNumber(season?.avg, 0.24);
        const slg = safeNumber(season?.slg, 0.39);
        const iso = Number(Math.max(0, slg - avg).toFixed(3));
        const barrelRate = sanitizePercentStat(statcast?.barrel_batted_rate, "Barrel%", { player: hitter.fullName || hitter.name, playerId: hitter.id });
        const hardHitRate = sanitizePercentStat(statcast?.hard_hit_percent, "Hard Hit%", { player: hitter.fullName || hitter.name, playerId: hitter.id });
        const exitVelo = sanitizeMetric(statcast?.exit_velocity_avg, "Exit Velo", { player: hitter.fullName || hitter.name, playerId: hitter.id });
        const pullRate = sanitizePercentStat(statcast?.pull_percent, "Pull%", { player: hitter.fullName || hitter.name, playerId: hitter.id });
        const xba = sanitizeRatioStat(statcast?.xba, "xBA", { player: hitter.fullName || hitter.name, playerId: hitter.id });
        const kRate = sanitizePercentStat(statcast?.k_percent, "K%", { player: hitter.fullName || hitter.name, playerId: hitter.id })
          ?? sanitizePercentStat(deriveRatePercent(season?.strikeOuts, season?.plateAppearances), "K%", { player: hitter.fullName || hitter.name, playerId: hitter.id, source: "season-stats" });
        const bbRate = sanitizePercentStat(statcast?.bb_percent, "BB%", { player: hitter.fullName || hitter.name, playerId: hitter.id })
          ?? sanitizePercentStat(deriveRatePercent(season?.baseOnBalls, season?.plateAppearances), "BB%", { player: hitter.fullName || hitter.name, playerId: hitter.id, source: "season-stats" });
        const whiffRate = sanitizePercentStat(statcast?.whiff_percent, "Whiff%", { player: hitter.fullName || hitter.name, playerId: hitter.id });
        batterPool.push({
          gameKey: context.gameKey,
          player: hitter.fullName || hitter.name || "Unknown Player",
          position: person?.primaryPosition?.abbreviation ?? person?.primaryPosition?.code ?? "UTIL",
          team: context.battingTeam.abbreviation,
          opponent: context.opponent.abbreviation,
          opposingPitcher: context.opposingPitcher,
          pitcherHand: context.pitcherHand,
          opposingPitcherId: context.opposingPitcherId,
          ballpark: game.venue,
          parkFactor,
          atBats: safeNumber(season?.atBats, null),
          barrelRate,
          hardHitRate,
          exitVelo,
          iso,
          hrFBRatio: safeNumber(season?.homeRuns && season?.atBats ? (season.homeRuns / Math.max(1, season.atBats)) * 100 : iso * 100, 10),
          pullRate,
          xba,
          kRate,
          bbRate,
          whiffRate,
          last7HR: sumRecentHomeRuns(gameLogs, 7),
          last30HR: sumRecentHomeRuns(gameLogs, 30),
          opposingPitcherHr9: safeNumber(context.pitcherHr9, 1.1),
          weatherBoost: computeWeatherBoost(context.gameContext),
          batterHand: person?.batSide?.code ?? "R",
        });
      }
    }
  }

  const dedupedPitchers = Array.from(new Map(pitcherPool.map((pitcher) => [`${pitcher.gameKey}|${pitcher.team}`, pitcher])).values());
  const pitcherContexts = {
    hardHitValues: dedupedPitchers.map((pitcher) => pitcher.hardHitRate),
    flyBallValues: dedupedPitchers.map((pitcher) => pitcher.flyBallRate),
    barrelValues: dedupedPitchers.map((pitcher) => pitcher.barrelRate),
    kValues: dedupedPitchers.map((pitcher) => pitcher.kRate),
    bbValues: dedupedPitchers.map((pitcher) => pitcher.bbRate),
    whiffValues: dedupedPitchers.map((pitcher) => pitcher.whiffRate),
  };
  const scoredPitchers = dedupedPitchers
    .map((pitcher) => ({
      ...pitcher,
      ...computePitcherMatchupRatings(pitcher, pitcherContexts),
    }))
    .sort((left, right) => right.hrVs - left.hrVs || left.pitcher.localeCompare(right.pitcher));
  const pitcherLookup = new Map(scoredPitchers.map((pitcher) => [String(pitcher.pitcherId ?? `${pitcher.gameKey}|${pitcher.team}`), pitcher]));

  const dedupedPool = Array.from(new Map(batterPool.map((player) => [`${normalizeName(player.player)}-${player.team}-${player.opponent}`, player])).values());
  const batterContexts = {
    barrelValues: dedupedPool.map((player) => player.barrelRate),
    hardHitValues: dedupedPool.map((player) => player.hardHitRate),
    xbaValues: dedupedPool.map((player) => player.xba),
    whiffValues: dedupedPool.map((player) => player.whiffRate),
    last7Values: dedupedPool.map((player) => player.last7HR),
    last30Values: dedupedPool.map((player) => player.last30HR),
    parkValues: dedupedPool.map((player) => player.parkFactor),
  };

  // Load pitcher regression data for xERA multiplier
  let pitcherRegressionData = [];
  try {
    if (existsSync(PITCHER_REGRESSION_PATH)) {
      pitcherRegressionData = JSON.parse(readFileSync(PITCHER_REGRESSION_PATH, "utf8"));
      if (!Array.isArray(pitcherRegressionData)) pitcherRegressionData = [];
      console.log(`Loaded ${pitcherRegressionData.length} pitcher regression entries.`);
    }
  } catch (err) {
    console.warn("Could not load pitcher-regression.json — skipping pitcher adjustment:", err.message);
  }

  const scored = dedupedPool.map((player) => {
    const opposingPitcher = pitcherLookup.get(String(player.opposingPitcherId ?? ""));
    const enriched = {
      ...player,
      opposingPitcherHrVs: opposingPitcher?.hrVs ?? normalizeMetric(dedupedPool.map((entry) => entry.opposingPitcherHr9), player.opposingPitcherHr9),
      opposingPitcherHitsVs: opposingPitcher?.hitsVs ?? 50,
      opposingPitcherKVs: opposingPitcher?.kVs ?? 50,
    };
    const baseHrScore = computeBatterHrScore(enriched, batterContexts);

    // Apply pitcher quality adjustment at generation time so hrScore is the final number
    const regrEntry = pitcherRegressionData.find(p => p.name === enriched.opposingPitcher);
    const pitcherXera = opposingPitcher?.xera ?? regrEntry?.xera ?? regrEntry?.xfip ?? null;
    const pitcherRegressionScore = regrEntry?.regressionScore ?? null;
    const pitcherFlyBallRate = opposingPitcher?.flyBallRate ?? null;
    const regrAdj = pitcherRegressionScore != null
      ? Math.max(0.96, Math.min(1.04, 1.0 + pitcherRegressionScore * 0.004))
      : 1.0;
    const hrScore = Math.round(baseHrScore * xeraMult(pitcherXera) * regrAdj * 10) / 10;

    return {
      ...enriched,
      hrScore,
      pitcherXera: pitcherXera != null ? roundNumber(pitcherXera, 2) : null,
      pitcherRegressionScore: pitcherRegressionScore != null ? roundNumber(pitcherRegressionScore, 1) : null,
      pitcherFlyBallRate: pitcherFlyBallRate != null ? roundNumber(pitcherFlyBallRate, 1) : null,
      angleTags: deriveAngleTags({ ...enriched, hrScore }, gamePool.find((game) => game.gameKey === enriched.gameKey)),
    };
  }).sort((left, right) => right.hrScore - left.hrScore || left.player.localeCompare(right.player))
    .map((player, index) => ({
      gameKey: player.gameKey,
      player: player.player,
      position: player.position,
      team: player.team,
      opponent: player.opponent,
      opposingPitcher: player.opposingPitcher,
      opposingPitcherId: player.opposingPitcherId,
      pitcherHand: player.pitcherHand,
      ballpark: player.ballpark,
      parkFactor: roundNumber(player.parkFactor, 2),
      barrelRate: roundNumber(player.barrelRate, 1),
      hardHitRate: roundNumber(player.hardHitRate, 1),
      exitVelo: roundNumber(player.exitVelo, 1),
      iso: roundNumber(player.iso, 3),
      hrFBRatio: roundNumber(player.hrFBRatio, 1),
      pullRate: roundNumber(player.pullRate, 1),
      xba: roundNumber(player.xba, 3),
      kRate: roundNumber(player.kRate, 1),
      bbRate: roundNumber(player.bbRate, 1),
      whiffRate: roundNumber(player.whiffRate, 1),
      last7HR: player.last7HR,
      last30HR: player.last30HR,
      opposingPitcherHrVs: Number(safeNumber(player.opposingPitcherHrVs, 50).toFixed(1)),
      opposingPitcherHitsVs: Number(safeNumber(player.opposingPitcherHitsVs, 50).toFixed(1)),
      opposingPitcherKVs: Number(safeNumber(player.opposingPitcherKVs, 50).toFixed(1)),
      weatherBoost: Number(safeNumber(player.weatherBoost, 0).toFixed(1)),
      angleTags: player.angleTags,
      hrScore: player.hrScore,
      hrScoreRank: index + 1,
      pitcherXera: player.pitcherXera ?? null,
      pitcherRegressionScore: player.pitcherRegressionScore ?? null,
      pitcherFlyBallRate: player.pitcherFlyBallRate ?? null,
    }));

  // ── Load MLB odds (written by fetch-mlb-odds.mjs before this script) ────────
  let mlbOdds = { moneylines: {}, hrOdds: {}, kOdds: {} };
  try {
    if (existsSync(MLB_ODDS_PATH)) {
      mlbOdds = JSON.parse(readFileSync(MLB_ODDS_PATH, "utf8"));
      console.log(`Loaded MLB odds: ${Object.keys(mlbOdds.hrOdds).length} HR, ${Object.keys(mlbOdds.kOdds).length} K, ${Object.keys(mlbOdds.moneylines).length} ML`);
    } else {
      console.warn("mlb-odds.json not found — continuing without odds.");
    }
  } catch (err) {
    console.warn("Could not load mlb-odds.json:", err.message);
  }

  const validatedPitchers = validatePitcherRows(scoredPitchers.map((pitcher) => {
    // Get opposing batters for this pitcher's matchup
    const opponentBatters = dedupedPool.filter(
      (batter) => batter.opponent === pitcher.team && batter.gameKey === pitcher.gameKey
    );
    
    // Calculate innings projection and K stats
    const projectedIP = calculateProjectedInnings(pitcher);
    const projectedK9 = calculateProjectedK9(pitcher);
    const projectedKs = calculateProjectedKs(projectedIP, projectedK9);
    const role = classifyPitcherRole(pitcher);
    
    // Match with K odds data
    const pitcherNameNorm = (pitcher.pitcher ?? "")
      .toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/gi, "").trim();
    const kOddsEntry = mlbOdds?.kOdds?.[pitcherNameNorm] ?? null;
    const kLine = kOddsEntry?.line ?? null;
    
    // Calculate K score adjustment based on projected Ks vs line
    let kAdjustment = 0;
    if (kLine && projectedKs) {
      const kDifference = projectedKs - kLine;
      kAdjustment = kDifference * 5;  // 5 points per K over/under
    }
    
    return {
      ...pitcher,
      xera: roundNumber(pitcher.xera, 2),
      hardHitRate: roundNumber(pitcher.hardHitRate, 1),
      flyBallRate: roundNumber(pitcher.flyBallRate, 1),
      barrelRate: roundNumber(pitcher.barrelRate, 1),
      kRate: roundNumber(pitcher.kRate, 1),
      bbRate: roundNumber(pitcher.bbRate, 1),
      whiffRate: roundNumber(pitcher.whiffRate, 1),
      last7HR: pitcher.last7HR ?? 0,
      hrPerStart: pitcher.hrPerStart != null ? roundNumber(pitcher.hrPerStart, 2) : null,
      role,
      projectedIP,
      projectedK9,
      projectedKs,
      kLine,
      kAdjustment: roundNumber(kAdjustment, 0),
      kOddsOver: kOddsEntry?.over ?? null,
      kOddsUnder: kOddsEntry?.under ?? null,
    };
  }));
  const validatedRows = validateBatterRows(scored);
  const validatedPayload = validateRawPayload({
    date: getTodayEt(),
    generatedAt: new Date().toISOString(),
    nextRunAt: getNextRunAt(),
    pendingGames,
    games: gamePool,
    pitchers: validatedPitchers,
    batters: validatedRows,
  });
  console.log(`Validated ${validatedPayload.batters.length} batters, ${validatedPayload.pitchers.length} pitchers, and ${validatedPayload.games.length} games for the MLB HR dashboard.`);

  // Helper: normalize player name for odds lookup
  function normName(name) {
    return (name ?? "")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\./g, "").replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
      .replace(/[^a-z0-9\s'-]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Attach HR odds to each batter and compute value edge
  function attachOddsAndValue(batters) {
    return batters.map(b => {
      const key = normName(b.player);
      const hrOddsEntry = mlbOdds.hrOdds?.[key] ?? null;
      const hrOddsYes = hrOddsEntry?.yes ?? null;           // e.g. "+350"
      const hrOddsNo  = hrOddsEntry?.no  ?? null;           // e.g. "-450"
      const hrImplied = hrOddsEntry?.impliedYes ?? null;    // e.g. 0.222
      // Model HR probability proxy: hrScore maps roughly to 3-22% HR probability
      const modelHrProb = hrOddsYes
        ? Math.max(0.03, Math.min(0.25, b.hrScore * 0.0022))
        : null;
      const hrValueEdge = (modelHrProb && hrImplied && hrImplied > 0)
        ? Math.round((modelHrProb / hrImplied) * 100) / 100
        : null;
      return { ...b, hrOddsYes, hrOddsNo, hrImplied, hrValueEdge };
    });
  }

  const battersWithOdds = attachOddsAndValue(validatedPayload.batters);

  // Build odds-enriched summary for the AI prompt
  function buildOddsEnrichedSummary(batters, count) {
    return batters.slice(0, count).map(b => {
      const odds = b.hrOddsYes ? ` | HR Odds: ${b.hrOddsYes} (implied ${b.hrImplied ? (b.hrImplied * 100).toFixed(1) + "%" : "N/A"})${b.hrValueEdge ? ` | Model Edge: ${b.hrValueEdge > 1 ? "VALUE" : "fair"}` : ""}` : "";
      return `#${b.hrScoreRank} ${b.player} (${b.team} vs ${b.opposingPitcher}): hrScore=${b.hrScore}${odds}, barrel=${b.barrelRate}%, HH=${b.hardHitRate}%, park=${b.parkFactor}`;
    }).join("\n");
  }

  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  let picksResult = null;
  let previewResult = null;

  if (apiKey && battersWithOdds.length) {
    const hasOdds = battersWithOdds.some(b => b.hrOddsYes);
    const top20Summary = hasOdds
      ? buildOddsEnrichedSummary(battersWithOdds, 20)
      : buildSummary(validatedPayload.batters, 20);
    const top10Summary = buildSummary(validatedPayload.batters, 10);

    const picksPrompt = hasOdds
      ? `You are a sharp MLB prop betting analyst. Based on today's HR prop model data with SPORTSBOOK ODDS:\n${top20Summary}\n\nReturn ONLY a raw JSON object with no markdown. The object has three keys:\nbestBets (array of 5 HR prop picks — prioritize players where hrValueEdge > 1.0, meaning the model sees MORE HR probability than the sportsbook implies. Mix high-score favorites with value plays).\nvalueBets (array of 3 players where hrScore is strong AND hrValueEdge shows model edge over the market — ranks 4-15 priced above +200).\nlongshots (array of 2 high-upside picks from ranks 8-25 with long odds but model signals like barrel rate ≥15% or park factor ≥1.1).\nEach pick: player (string), team (string), opponent (string), opposingPitcher (string), hrScoreRank (number), hrOddsYes (string, the sportsbook HR odds or null), topStats (array of exactly 2 strings), bullets (array of exactly 2 strings referencing specific numbers). Do not include text outside the JSON.`
      : `You are a sharp MLB prop betting analyst. Based on today's HR prop model data:\n${top20Summary}\n\nReturn ONLY a raw JSON object with no markdown. The object has three keys: bestBets (array of 5 top HR prop picks - highest model score players with strong matchup context), valueBets (array of 3 players where HR score is high but they may be underpriced - ranks 4-12 in the model), longshots (array of 2 high upside lower probability picks from ranks 8-20). Each pick has: player (string), team (string), opponent (string), opposingPitcher (string), hrScoreRank (number), topStats (array of exactly 2 strings highlighting their strongest metrics with values), bullets (array of exactly 2 strings referencing specific numbers from the data - barrel rate, exit velo, park factor, pitcher HR/9, or recent form). Do not include any text outside the JSON.`;

    const previewPrompt = `Based on today's MLB HR prop model data:\n${top10Summary}\n\nWrite a short slate preview. Return JSON with two fields: slateOverview (2-3 sentences describing today's slate conditions - parks, pitcher matchups, weather angles that create HR opportunities), modelNote (1-2 sentences explaining how the model is weighting today's picks). Sound like a sharp analyst. No filler. No markdown.`;

    try {
      picksResult = await callGrokWithRetry(picksPrompt, 3, (parsed) => {
        if (!parsed.bestBets || !parsed.valueBets || !parsed.longshots) throw new Error("Missing MLB HR prop sections.");
      });
    } catch (error) {
      console.warn(`Grok HR prop picks were invalid. Falling back to model-ranked picks. ${error instanceof Error ? error.message : error}`);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      previewResult = await callGrokWithRetry(previewPrompt, 3);
    } catch (error) {
      console.warn(`Grok slate preview was invalid. Falling back to model-generated preview. ${error instanceof Error ? error.message : error}`);
    }
  } else if (!apiKey) {
    console.warn("GROK_API_KEY is not set. Falling back to model-generated HR prop sections.");
  }

  // Attach odds to each best bet pick for display
  function attachOddsToPick(picks, battersOdds) {
    const lookup = new Map(battersOdds.map(b => [normName(b.player), b]));
    return (picks ?? []).map(p => {
      const b = lookup.get(normName(p.player));
      return {
        ...p,
        hrOddsYes: p.hrOddsYes ?? b?.hrOddsYes ?? null,
        hrValueEdge: b?.hrValueEdge ?? null,
      };
    });
  }

  const bestBetsPayload = buildBestBetsPayload(battersWithOdds, picksResult, previewResult);
  // Enrich picks with odds data
  if (bestBetsPayload.bestBets) bestBetsPayload.bestBets = attachOddsToPick(bestBetsPayload.bestBets, battersWithOdds);
  if (bestBetsPayload.valueBets) bestBetsPayload.valueBets = attachOddsToPick(bestBetsPayload.valueBets, battersWithOdds);
  if (bestBetsPayload.longshots) bestBetsPayload.longshots = attachOddsToPick(bestBetsPayload.longshots, battersWithOdds);

  // Also enrich raw batters with odds for the HR props table
  validatedPayload.batters = battersWithOdds.map(b => ({
    ...b,
    hrOddsYes: b.hrOddsYes ?? null,
    hrOddsNo: b.hrOddsNo ?? null,
    hrValueEdge: b.hrValueEdge ?? null,
  }));

  // Attach moneyline odds to games
  validatedPayload.games = (validatedPayload.games ?? []).map(g => {
    const key = `${g.awayTeam ?? g.away}@${g.homeTeam ?? g.home}`;
    const ml = mlbOdds.moneylines?.[key] ?? null;
    return { ...g, moneylineOdds: ml };
  });

  writeFileSync(RAW_OUTPUT_PATH, `${JSON.stringify(validatedPayload, null, 2)}\n`, "utf8");
  writeFileSync(BEST_BETS_OUTPUT_PATH, `${JSON.stringify(bestBetsPayload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${RAW_OUTPUT_PATH}`);
  console.log(`Wrote ${BEST_BETS_OUTPUT_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`MLB HR props generation failed before publish. Existing output files were preserved. ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
