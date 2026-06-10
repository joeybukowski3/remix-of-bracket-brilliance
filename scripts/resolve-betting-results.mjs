/**
 * resolve-betting-results.mjs
 *
 * Reads today.json, resolves W/L/Push for completed games,
 * appends resolved sides to history.json.
 *
 * Uses MLB Stats API for MLB results.
 * ESPN API for NBA, NFL, and soccer.
 *
 * Always exits 0.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR    = path.resolve(__dirname, "../public/data/betting-splits");
const TODAY_PATH = path.join(OUT_DIR, "today.json");
const HIST_PATH  = path.join(OUT_DIR, "history.json");
const TIMEOUT    = 15000;

const MLB_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Referer":    "https://www.mlb.com/",
  "Origin":     "https://www.mlb.com",
};

// ---------- helpers ----------------------------------------------------------

function getTodayEt() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", ...headers }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Calculate P/L for a winning/losing/push result.
 * Spread bets assumed at -110 juice.
 * ML bets use actual line (e.g. "-150" → risk 150 to win 100 → +0.67 on win).
 * Returns in units where 1 unit = 1 standard bet.
 */
function calcPnl(result, betType, line) {
  if (result === "push") return 0;

  if (betType === "Spread") {
    // Standard -110 juice
    return result === "win" ? +(100 / 110).toFixed(3) : -1;
  }

  // ML: parse the line
  if (line) {
    const n = parseInt(line.replace("+", ""), 10);
    if (isFinite(n)) {
      if (result === "win") {
        return n > 0 ? +(n / 100).toFixed(3) : +(100 / Math.abs(n)).toFixed(3);
      } else {
        return -1;
      }
    }
  }

  return result === "win" ? 0.909 : -1;
}

// ---------- MLB result resolver ----------------------------------------------

async function getMlbResults(date) {
  // Returns Map of gameKey ("SEA@BAL") → { awayScore, homeScore, final }
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore`;
  const results = new Map();
  try {
    const data = await fetchJson(url, MLB_HEADERS);
    const games = data?.dates?.[0]?.games ?? [];
    for (const g of games) {
      const awayAbbr = g.teams?.away?.team?.abbreviation ?? "";
      const homeAbbr = g.teams?.home?.team?.abbreviation ?? "";
      const key = `${awayAbbr}@${homeAbbr}`;
      const isFinal = g.status?.codedGameState === "F" || g.status?.detailedState === "Final";
      if (isFinal) {
        results.set(key, {
          awayScore: g.teams?.away?.score ?? null,
          homeScore: g.teams?.home?.score ?? null,
          final: true,
          gamePk: g.gamePk,
        });
      }
    }
    console.log(`  [MLB] ${results.size} final games found for ${date}`);
  } catch (err) {
    console.warn(`  [MLB] results fetch failed: ${err.message}`);
  }
  return results;
}

// ---------- ESPN result resolver (NBA, NFL, Soccer) --------------------------

const ESPN_SPORT_MAP = {
  nba:    { path: "basketball/nba" },
  nfl:    { path: "football/nfl" },
  soccer: { path: "soccer/fifa.world" },
};

async function getEspnResults(sportKey, date) {
  const results = new Map();
  const espnSport = ESPN_SPORT_MAP[sportKey];
  if (!espnSport) return results;

  const dateStr = date.replace(/-/g, "");
  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnSport.path}/scoreboard?dates=${dateStr}`;

  try {
    const data = await fetchJson(url);
    const events = data?.events ?? [];
    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      const isFinal = comp.status?.type?.completed === true;
      if (!isFinal) continue;

      const comps = comp.competitors ?? [];
      const away = comps.find(c => c.homeAway === "away");
      const home = comps.find(c => c.homeAway === "home");

      if (!away || !home) continue;

      const awayAbbr = away.team?.abbreviation ?? "";
      const homeAbbr = home.team?.abbreviation ?? "";
      const key = `${awayAbbr}@${homeAbbr}`;

      results.set(key, {
        awayScore: parseFloat(away.score ?? 0),
        homeScore: parseFloat(home.score ?? 0),
        final: true,
      });

      // Also try home@away key variant
      results.set(`${homeAbbr}@${awayAbbr}`, {
        awayScore: parseFloat(home.score ?? 0),
        homeScore: parseFloat(away.score ?? 0),
        final: true,
        swapped: true,
      });
    }
    console.log(`  [${sportKey.toUpperCase()}] ${results.size / 2} final games found for ${date}`);
  } catch (err) {
    console.warn(`  [${sportKey.toUpperCase()}] results fetch failed: ${err.message}`);
  }
  return results;
}

// ---------- result determination --------------------------------------------

/**
 * Given a side entry and the final score, determine W/L/Push.
 * For ML: simple win/loss based on which team won.
 * For Spread: check if covered.
 */
function determineResult(side, gameResult) {
  if (!gameResult?.final) return null;

  const { awayScore, homeScore } = gameResult;
  if (awayScore == null || homeScore == null) return null;

  const isAwayWin = awayScore > homeScore;
  const isHomeWin = homeScore > awayScore;
  const isTie     = awayScore === homeScore;

  if (side.betType === "ML") {
    if (isTie && side.sport === "World Cup") return "push"; // Soccer can draw
    if (side.side === "away") return isAwayWin ? "win" : "loss";
    return isHomeWin ? "win" : "loss";
  }

  if (side.betType === "Spread") {
    // Parse the spread line from the side
    const lineStr = side.line ?? "";
    const lineNum = parseFloat(lineStr.replace("+", ""));
    if (!isFinite(lineNum)) return null;

    // The line on the side is from that team's perspective
    // e.g. home team -3.5 means home must win by >3.5
    const margin = side.side === "away"
      ? awayScore - homeScore
      : homeScore - awayScore;

    const adjustedMargin = margin + lineNum; // lineNum is negative for favorite
    if (adjustedMargin > 0) return "win";
    if (adjustedMargin < 0) return "loss";
    return "push";
  }

  return null;
}

// ---------- main -------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const todayData = readJson(TODAY_PATH, { sides: [], date: null });
  const histData  = readJson(HIST_PATH,  { sides: [] });

  const todaySides = todayData.sides ?? [];
  const histSides  = histData.sides  ?? [];

  if (todaySides.length === 0) {
    console.log("No sides to resolve today.");
    return;
  }

  // Build a set of already-resolved side IDs in history
  const resolvedIds = new Set(histSides.map(s => s.id));

  // Fetch results for each sport that has sides today
  const sports = [...new Set(todaySides.map(s => s.sportKey))];
  const resultsByKey = {};

  for (const sport of sports) {
    const date = todayData.date ?? getTodayEt();
    if (sport === "mlb") {
      resultsByKey[sport] = await getMlbResults(date);
    } else {
      resultsByKey[sport] = await getEspnResults(sport, date);
    }
  }

  // Resolve each unresolved side
  let resolvedCount = 0;
  const updatedToday = todaySides.map(side => {
    if (side.result) return side; // already resolved

    const gameResult = resultsByKey[side.sportKey]?.get(side.gameKey);
    if (!gameResult) return side;

    const result = determineResult(side, gameResult);
    if (!result) return side;

    const pnl = calcPnl(result, side.betType, side.line);
    resolvedCount++;

    return { ...side, result, pnl, resolvedAt: new Date().toISOString() };
  });

  // Add newly resolved sides to history (avoid duplicates)
  for (const side of updatedToday) {
    if (side.result && !resolvedIds.has(side.id)) {
      histSides.push(side);
    }
  }

  // Sort history newest first
  histSides.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Write today.json with resolved results
  writeFileSync(TODAY_PATH, JSON.stringify({
    ...todayData,
    sides: updatedToday,
  }, null, 2), "utf8");

  // Write history.json
  writeFileSync(HIST_PATH, JSON.stringify({
    updatedAt: new Date().toISOString(),
    sides: histSides,
  }, null, 2), "utf8");

  console.log(`✅ Resolved ${resolvedCount} new results. History: ${histSides.length} total sides.`);
}

main().catch(err => {
  console.error("resolve-betting-results failed (non-fatal):", err?.message ?? err);
  process.exit(0);
});
