/**
 * fetch-public-betting.mjs
 *
 * Fetches public betting splits from Action Network's internal API.
 * Covers MLB (daily), NBA (in-season), NFL (in-season), and World Cup (when active).
 *
 * Writes public/data/betting-splits/today.json with all sides for today.
 * Sides at ≥75% public are flagged as highPublic.
 *
 * Always exits 0 — never fails the workflow.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.resolve(__dirname, "../public/data/betting-splits");
const TODAY_OUT = path.join(OUT_DIR, "today.json");
const TIMEOUT   = 15000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Referer": "https://www.actionnetwork.com/",
  "Origin": "https://www.actionnetwork.com",
};

// ---------- helpers ----------------------------------------------------------

function getTodayEt() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function getAnDate() {
  // Action Network uses YYYYMMDD
  return getTodayEt().replace(/-/g, "");
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function formatAmerican(price) {
  if (price == null || !isFinite(price)) return null;
  return price > 0 ? `+${price}` : `${price}`;
}

function safePercent(val) {
  if (val == null) return null;
  const n = Number(val);
  return isFinite(n) ? Math.round(n) : null;
}

// ---------- Action Network parser -------------------------------------------

/**
 * Maps AN sport key → our internal sport key.
 * AN uses "4" for MLB, "3" for NBA, "2" for NFL, etc.
 * Their web API uses string slugs.
 */
const AN_SPORT_MAP = {
  mlb:       { label: "MLB",       betTypes: ["moneyline", "spread"] },
  nba:       { label: "NBA",       betTypes: ["moneyline", "spread"] },
  nfl:       { label: "NFL",       betTypes: ["moneyline", "spread"] },
  ncaaf:     { label: "NCAAF",     betTypes: ["moneyline", "spread"] },
  ncaab:     { label: "NCAAB",     betTypes: ["spread"] },
  soccer:    { label: "World Cup", betTypes: ["moneyline"] },
};

// Determine which sports are currently active by season
function getActiveSports() {
  const today = new Date(getTodayEt());
  const month = today.getMonth() + 1; // 1-12

  const sports = [];

  // MLB: April–October
  if (month >= 4 && month <= 10) sports.push("mlb");

  // NBA: October–June
  if (month >= 10 || month <= 6) sports.push("nba");

  // NFL: September–February
  if (month >= 9 || month <= 2) sports.push("nfl");

  // World Cup 2026: June 11 – July 19, 2026
  const wc2026Start = new Date("2026-06-11");
  const wc2026End   = new Date("2026-07-19");
  if (today >= wc2026Start && today <= wc2026End) sports.push("soccer");

  return sports;
}

/**
 * Fetch splits from Action Network for a given sport.
 * AN's internal web API: GET /web/v1/games?sport=MLB&date=20260610
 * Returns game objects with betting percentages on markets.
 */
async function fetchAnSport(sportKey) {
  const date  = getAnDate();
  const label = AN_SPORT_MAP[sportKey]?.label ?? sportKey.toUpperCase();

  // Try Action Network API - attempt both v1 with odds and v2
  const urls = [
    `https://api.actionnetwork.com/web/v1/games?sport=${sportKey.toUpperCase()}&date=${date}&include=odds`,
    `https://api.actionnetwork.com/web/v1/games?sport=${sportKey.toUpperCase()}&date=${date}`,
  ];

  let data = null;
  for (const url of urls) {
    try {
      const result = await fetchJson(url);
      if (result && (result.games?.length > 0 || result.data?.length > 0)) {
        data = result;
        console.log(`  [${label}] Successful fetch from: ${url.split('?')[0]}`);
        break;
      }
    } catch (err) {
      console.warn(`  [${label}] fetch failed for ${url}: ${err.message}`);
    }
  }
  if (!data) return [];

  const games = data?.games ?? data?.data ?? [];
  if (!Array.isArray(games) || games.length === 0) {
    console.log(`  [${label}] no games found for ${date}. Response keys: ${Object.keys(data || {}).join(", ")}`);
    return [];
  }

  // Debug: log first game structure to diagnose API changes
  if (games.length > 0) {
    const sample = games[0];
    const odds = sample?.odds ?? [];
    const consensus = odds.find(o => o.type === "consensus" || o.book_id === 15) ?? odds[0];
    console.log(`  [${label}] ${games.length} games found. Sample game keys: ${Object.keys(sample).join(", ")}`);
    console.log(`  [${label}] Sample odds count: ${odds.length}. Consensus keys: ${Object.keys(consensus ?? {}).join(", ")}`);
    if (consensus) {
      const pctKeys = Object.keys(consensus).filter(k => k.includes("pct") || k.includes("bet") || k.includes("ml") || k.includes("spread"));
      console.log(`  [${label}] Consensus pct/bet keys: ${pctKeys.join(", ")}`);
    }
  }

  const sides = [];

  for (const game of games) {
    const teams = game.teams ?? [];
    if (teams.length < 2) continue;

    const awayTeam = teams.find(t => t.is_home === false) ?? teams[0];
    const homeTeam = teams.find(t => t.is_home === true)  ?? teams[1];

    const awayName  = awayTeam?.full_name ?? awayTeam?.abbreviation ?? "Away";
    const homeName  = homeTeam?.full_name ?? homeTeam?.abbreviation ?? "Home";
    const awayAbbr  = awayTeam?.abbreviation ?? awayName.substring(0, 3).toUpperCase();
    const homeAbbr  = homeTeam?.abbreviation ?? homeName.substring(0, 3).toUpperCase();
    const gameTime  = game.start_time ?? game.scheduled ?? null;
    const gameId    = String(game.id ?? "");
    const status    = game.status ?? "scheduled";

    // Grab moneyline + spread odds/percentages
    const odds = game.odds ?? game.markets ?? [];
    // Try consensus book (id=15), then "consensus" type, then "public" type, then first available
    const consensus = odds.find(o => o.book_id === 15)
      ?? odds.find(o => o.type === "consensus")
      ?? odds.find(o => o.type === "public")
      ?? odds[0]
      ?? {};

    // Extract spread — support multiple field name variants
    const spreadLine     = consensus?.spread ?? consensus?.spread_line ?? consensus?.point_spread ?? null;
    const awaySpreadPct  = safePercent(consensus?.away_spread_bets ?? consensus?.a_bets_pct ?? consensus?.away_spread_pct ?? consensus?.away_spread_tickets_pct);
    const homeSpreadPct  = safePercent(consensus?.home_spread_bets ?? consensus?.h_bets_pct ?? consensus?.home_spread_pct ?? consensus?.home_spread_tickets_pct);
    const awaySpreadMoney = safePercent(consensus?.away_spread_money_pct ?? consensus?.a_money_pct ?? consensus?.away_spread_money);
    const homeSpreadMoney = safePercent(consensus?.home_spread_money_pct ?? consensus?.h_money_pct ?? consensus?.home_spread_money);

    // Extract moneyline — support multiple field name variants
    const awayMlPct   = safePercent(consensus?.away_ml_bets ?? consensus?.away_bets_pct ?? consensus?.away_ml_pct ?? consensus?.away_tickets_pct ?? game?.away_bets_pct);
    const homeMlPct   = safePercent(consensus?.home_ml_bets ?? consensus?.home_bets_pct ?? consensus?.home_ml_pct ?? consensus?.home_tickets_pct ?? game?.home_bets_pct);
    const awayMlMoney = safePercent(consensus?.away_ml_money_pct ?? consensus?.away_money_pct ?? consensus?.away_ml_money ?? game?.away_money_pct);
    const homeMlMoney = safePercent(consensus?.home_ml_money_pct ?? consensus?.home_money_pct ?? consensus?.home_ml_money ?? game?.home_money_pct);
    const awayMlLine  = consensus?.away_ml ?? consensus?.away_odds ?? consensus?.away_price ?? null;
    const homeMlLine  = consensus?.home_ml ?? consensus?.home_odds ?? consensus?.home_price ?? null;

    // Push moneyline sides if pct available
    if (awayMlPct != null || homeMlPct != null) {
      const highSide = (awayMlPct ?? 0) >= (homeMlPct ?? 0) ? "away" : "home";
      const highPct  = highSide === "away" ? awayMlPct : homeMlPct;
      const highMoney = highSide === "away" ? awayMlMoney : homeMlMoney;
      const highLine  = highSide === "away" ? awayMlLine : homeMlLine;
      const highName  = highSide === "away" ? awayName : homeName;
      const highAbbr  = highSide === "away" ? awayAbbr : homeAbbr;

      sides.push({
        id:           `${gameId}-ml-${highSide}`,
        sport:        label,
        sportKey,
        gameId,
        awayTeam:     awayName,
        homeTeam:     homeName,
        awayAbbr,
        homeAbbr,
        betType:      "ML",
        side:         highSide,
        teamName:     highName,
        teamAbbr:     highAbbr,
        publicBetPct: highPct,
        publicMoneyPct: highMoney,
        line:         formatAmerican(highLine),
        gameTime,
        status,
        highPublic:   (highPct ?? 0) >= 75,
        result:       null,
        pnl:          null,
        gameKey:      `${awayAbbr}@${homeAbbr}`,
        date:         getTodayEt(),
      });
    }

    // Push spread sides if pct available
    if (awaySpreadPct != null || homeSpreadPct != null) {
      const highSide  = (awaySpreadPct ?? 0) >= (homeSpreadPct ?? 0) ? "away" : "home";
      const highPct   = highSide === "away" ? awaySpreadPct : homeSpreadPct;
      const highMoney = highSide === "away" ? awaySpreadMoney : homeSpreadMoney;
      const highName  = highSide === "away" ? awayName : homeName;
      const highAbbr  = highSide === "away" ? awayAbbr : homeAbbr;
      const spreadStr = spreadLine != null
        ? (highSide === "away"
            ? formatAmerican(-spreadLine)
            : formatAmerican(spreadLine))
        : null;

      sides.push({
        id:           `${gameId}-spread-${highSide}`,
        sport:        label,
        sportKey,
        gameId,
        awayTeam:     awayName,
        homeTeam:     homeName,
        awayAbbr,
        homeAbbr,
        betType:      "Spread",
        side:         highSide,
        teamName:     highName,
        teamAbbr:     highAbbr,
        publicBetPct: highPct,
        publicMoneyPct: highMoney,
        line:         spreadStr,
        gameTime,
        status,
        highPublic:   (highPct ?? 0) >= 75,
        result:       null,
        pnl:          null,
        gameKey:      `${awayAbbr}@${homeAbbr}`,
        date:         getTodayEt(),
      });
    }
  }

  console.log(`  [${label}] ${games.length} games → ${sides.length} sides`);
  return sides;
}

// ---------- main -------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const activeSports = getActiveSports();
  console.log(`Active sports for ${getTodayEt()}: ${activeSports.join(", ") || "none"}`);

  const allSides = [];
  for (const sport of activeSports) {
    const sides = await fetchAnSport(sport);
    allSides.push(...sides);
  }

  // Sort by publicBetPct descending
  allSides.sort((a, b) => (b.publicBetPct ?? 0) - (a.publicBetPct ?? 0));

  const output = {
    fetchedAt: new Date().toISOString(),
    date: getTodayEt(),
    sportsChecked: activeSports,
    totalSides: allSides.length,
    highPublicCount: allSides.filter(s => s.highPublic).length,
    sides: allSides,
  };

  writeFileSync(TODAY_OUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Wrote ${allSides.length} sides (${output.highPublicCount} at ≥75%) → ${TODAY_OUT}`);
}

main().catch(err => {
  console.error("fetch-public-betting failed (non-fatal):", err?.message ?? err);
  process.exit(0);
});
