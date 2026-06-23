/**
 * fetch-polymarket-snapshots.mjs
 *
 * Runs hourly (11am–11pm ET). For each MLB game today:
 *  - Fetches current YES price from Polymarket (home team wins)
 *  - Falls back to MLB Stats API moneyline implied prob if Polymarket unavailable
 *  - Appends a timestamped snapshot to public/data/polymarket/snapshots-YYYY-MM-DD.json
 *  - First snapshot of the day sets the "openPrice" (never overwritten)
 *
 * Always exits 0 — never fails the workflow.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/data/polymarket");
const TIMEOUT = 12000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

async function fetchJson(url, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseOutcomePrices(outcomePrices, outcomes) {
  try {
    const prices = typeof outcomePrices === "string"
      ? JSON.parse(outcomePrices) : outcomePrices;
    const names = typeof outcomes === "string"
      ? JSON.parse(outcomes) : outcomes;
    if (!Array.isArray(prices) || !Array.isArray(names)) return null;
    // Find "Yes" index
    const yesIdx = names.findIndex(n => String(n).toLowerCase() === "yes");
    if (yesIdx >= 0) return parseFloat(prices[yesIdx]) || null;
    // Fallback: first price
    return parseFloat(prices[0]) || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Polymarket fetch
// ---------------------------------------------------------------------------

async function fetchPolymarketGames(date) {
  const url = `https://gamma-api.polymarket.com/events?series_slug=mlb&active=true&closed=false&limit=50&event_date=${date}`;
  const data = await fetchJson(url);
  if (!Array.isArray(data)) return [];

  const seen = new Set();
  const results = [];

  for (const event of data) {
    const gameId = String(event.gameId || "");
    if (!gameId || seen.has(gameId)) continue;

    const teams = event.teams || [];
    const away = teams.find(t => t.ordering === "away");
    const home = teams.find(t => t.ordering === "home");
    if (!away || !home) continue;

    // Find the moneyline market (highest volume, not a spread/total)
    const markets = (event.markets || []).filter(m =>
      m.sportsMarketType === "moneyline" ||
      (!m.line && (m.question || "").toLowerCase().includes("win"))
    );
    const market = markets.sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0))[0];
    if (!market) continue;

    // Price represents home team YES probability
    const homeYesPrice = parseOutcomePrices(market.outcomePrices, market.outcomes);
    if (homeYesPrice == null) continue;

    seen.add(gameId);
    results.push({
      eventId: String(event.id || ""),
      gameId,
      awayAbbr: (away.abbreviation || "").toUpperCase(),
      homeAbbr: (home.abbreviation || "").toUpperCase(),
      awayName: away.name || "",
      homeName: home.name || "",
      gameTime: event.startTime || null,
      homePrice: homeYesPrice,
      awayPrice: Math.round((1 - homeYesPrice) * 1000) / 1000,
      volume24hr: event.volume24hr || 0,
      liquidity: event.liquidity || 0,
      source: "polymarket",
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// MLB Stats API fallback — get implied probabilities from moneylines
// ---------------------------------------------------------------------------

async function fetchMlbFallback(date) {
  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=odds`;
    const data = await fetchJson(url);
    const games = data?.dates?.[0]?.games || [];
    return games.map(g => {
      const odds = g.odds || {};
      // Convert American odds to implied prob
      const toImplied = (ml) => {
        if (!ml) return null;
        const n = parseFloat(ml);
        if (!isFinite(n)) return null;
        return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100);
      };
      const homeImpl = toImplied(odds.homeOdds);
      const awayImpl = toImplied(odds.awayOdds);
      // Normalize to remove vig
      const total = (homeImpl || 0) + (awayImpl || 0);
      const homePrice = total > 0 && homeImpl ? Math.round((homeImpl / total) * 1000) / 1000 : null;
      const awayPrice = homePrice ? Math.round((1 - homePrice) * 1000) / 1000 : null;
      return {
        eventId: null,
        gameId: String(g.gamePk),
        awayAbbr: g.teams?.away?.team?.abbreviation || "",
        homeAbbr: g.teams?.home?.team?.abbreviation || "",
        awayName: g.teams?.away?.team?.name || "",
        homeName: g.teams?.home?.team?.name || "",
        gameTime: g.gameDate || null,
        homePrice,
        awayPrice,
        volume24hr: 0,
        liquidity: 0,
        source: "mlb-api",
      };
    }).filter(g => g.homePrice != null);
  } catch (err) {
    console.warn("MLB API fallback failed:", err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const date = getEtDate();
  const outFile = path.join(OUT_DIR, `snapshots-${date}.json`);
  const now = new Date().toISOString();

  mkdirSync(OUT_DIR, { recursive: true });

  // Load existing snapshot file or create fresh
  let existing = { date, fetchedCount: 0, games: [] };
  if (existsSync(outFile)) {
    try {
      existing = JSON.parse(readFileSync(outFile, "utf8"));
    } catch {
      console.warn("Could not parse existing snapshot file, starting fresh.");
    }
  }

  // Build a map of existing games by gameId
  const gameMap = {};
  for (const g of existing.games || []) {
    gameMap[g.gameId] = g;
  }

  // Fetch current prices
  console.log(`Fetching Polymarket prices for ${date}...`);
  let liveGames = [];
  try {
    liveGames = await fetchPolymarketGames(date);
    console.log(`Got ${liveGames.length} games from Polymarket`);
  } catch (err) {
    console.warn("Polymarket fetch failed:", err.message);
  }

  // Fall back to MLB API for any games not found on Polymarket
  const foundGameIds = new Set(liveGames.map(g => g.gameId));
  if (liveGames.length < 5) {
    console.log("Fetching MLB Stats API as fallback...");
    const fallback = await fetchMlbFallback(date);
    for (const g of fallback) {
      if (!foundGameIds.has(g.gameId)) {
        liveGames.push(g);
      }
    }
    console.log(`Total after fallback: ${liveGames.length} games`);
  }

  if (liveGames.length === 0) {
    console.log("No games found, nothing to write.");
    return;
  }

  // Append snapshot to each game
  const snapshotTime = now;
  let newSnapshots = 0;

  for (const live of liveGames) {
    const id = live.gameId;
    if (!gameMap[id]) {
      // New game — initialize with openPrice
      gameMap[id] = {
        gameId: id,
        eventId: live.eventId,
        awayAbbr: live.awayAbbr,
        homeAbbr: live.homeAbbr,
        awayName: live.awayName,
        homeName: live.homeName,
        gameTime: live.gameTime,
        openPrice: { away: live.awayPrice, home: live.homePrice },
        openTime: snapshotTime,
        snapshots: [],
        graded: false,
        result: null,
      };
    }

    const game = gameMap[id];

    // Update eventId if we now have one from Polymarket
    if (live.eventId && !game.eventId) {
      game.eventId = live.eventId;
    }

    // Append snapshot
    game.snapshots.push({
      time: snapshotTime,
      awayPrice: live.awayPrice,
      homePrice: live.homePrice,
      volume24hr: live.volume24hr,
      liquidity: live.liquidity,
      source: live.source,
    });
    newSnapshots++;
  }

  // Write updated file
  const output = {
    date,
    updatedAt: now,
    fetchedCount: existing.fetchedCount + 1,
    games: Object.values(gameMap),
  };

  writeFileSync(outFile, JSON.stringify(output, null, 2) + "\n");
  console.log(`✓ Wrote ${Object.keys(gameMap).length} games, ${newSnapshots} new snapshots → ${outFile}`);
}

main().catch(err => {
  console.error("Fatal error in fetch-polymarket-snapshots:", err.message);
  // Always exit 0 — never fail the workflow
  process.exitCode = 0;
});
