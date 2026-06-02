/**
 * fetch-mlb-odds.mjs
 * Fetches MLB odds from The Odds API:
 *   - h2h (moneylines) for every today's game
 *   - batter_home_runs (anytime HR scorer)
 *   - pitcher_strikeouts (over/under)
 *
 * Writes public/data/mlb/mlb-odds.json
 * Always exits 0 — never fails the workflow.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, "../public/data/mlb/mlb-odds.json");
const ODDS_BASE = "https://api.the-odds-api.com/v4";
const SPORT = "baseball_mlb";
const TIMEOUT_MS = 15000;

const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "JoeKnowsBall/1.0",
};

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timer);
    const remaining = res.headers.get("x-requests-remaining");
    if (remaining) console.log(`  Odds API requests remaining: ${remaining}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function americanToImplied(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return price > 0 ? 100 / (price + 100) : Math.abs(price) / (Math.abs(price) + 100);
}

function formatAmerican(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return price > 0 ? `+${price}` : `${price}`;
}

function normalizeName(name) {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Pick the bookmaker with the most outcomes (most liquid market)
function bestBook(bookmakers, marketKey) {
  if (!Array.isArray(bookmakers) || !bookmakers.length) return null;
  // Prefer DraftKings, FanDuel, BetMGM; fall back to whoever has most outcomes
  const preferred = ["draftkings", "fanduel", "betmgm", "williamhill_us", "bovada"];
  for (const pref of preferred) {
    const bk = bookmakers.find(b => b.key === pref);
    const market = bk?.markets?.find(m => m.key === marketKey);
    if (market?.outcomes?.length) return market;
  }
  return bookmakers
    .flatMap(b => b.markets?.filter(m => m.key === marketKey) ?? [])
    .sort((a, b) => (b.outcomes?.length ?? 0) - (a.outcomes?.length ?? 0))[0] ?? null;
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.warn("ODDS_API_KEY not set — skipping MLB odds fetch.");
    process.exit(0);
  }

  console.log("Fetching MLB odds...");

  // ── Step 1: Get today's games + moneylines ──────────────────────────────────
  const moneylines = {};    // gameKey → { away, home }
  const mlbEvents = [];     // [{id, awayTeam, homeTeam, gameKey}]

  try {
    const url = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`;
    const events = await get(url);

    for (const ev of (events ?? [])) {
      const awayTeam = ev.away_team;
      const homeTeam = ev.home_team;
      const gameKey = `${awayTeam}@${homeTeam}`;
      mlbEvents.push({ id: ev.id, awayTeam, homeTeam, gameKey });

      const market = bestBook(ev.bookmakers, "h2h");
      if (!market) continue;

      const awayOut = market.outcomes.find(o => o.name === awayTeam);
      const homeOut = market.outcomes.find(o => o.name === homeTeam);
      moneylines[gameKey] = {
        away: { team: awayTeam, price: awayOut?.price, american: formatAmerican(awayOut?.price), implied: americanToImplied(awayOut?.price) },
        home: { team: homeTeam, price: homeOut?.price, american: formatAmerican(homeOut?.price), implied: americanToImplied(homeOut?.price) },
      };
    }
    console.log(`✅ Moneylines: ${Object.keys(moneylines).length} games`);
  } catch (err) {
    console.warn("❌ Moneylines fetch failed:", err.message);
  }

  // ── Step 2: Player props (HR + Strikeouts) per event ───────────────────────
  const hrOdds = {};       // normalizedPlayerName → { yes, no, implied }
  const kOdds = {};        // normalizedPitcherName → { line, over, under, impliedOver }

  const PROP_MARKETS = "batter_home_runs,pitcher_strikeouts";

  for (const ev of mlbEvents.slice(0, 16)) {  // cap at 16 games to save API calls
    await new Promise(r => setTimeout(r, 300)); // small delay between requests
    try {
      const url = `${ODDS_BASE}/sports/${SPORT}/events/${ev.id}/odds?apiKey=${apiKey}&regions=us&markets=${PROP_MARKETS}&oddsFormat=american`;
      const data = await get(url);

      // HR props
      const hrMarket = bestBook(data.bookmakers, "batter_home_runs");
      if (hrMarket) {
        for (const outcome of hrMarket.outcomes) {
          const key = normalizeName(outcome.name);
          if (!hrOdds[key]) hrOdds[key] = {};
          const side = outcome.description?.toLowerCase().includes("no") ? "no" : "yes";
          hrOdds[key][side] = formatAmerican(outcome.price);
          if (side === "yes") hrOdds[key].impliedYes = americanToImplied(outcome.price);
        }
      }

      // Strikeout props (over/under format)
      const kMarket = bestBook(data.bookmakers, "pitcher_strikeouts");
      if (kMarket) {
        // Group by player name
        const playerMap = {};
        for (const outcome of kMarket.outcomes) {
          const key = normalizeName(outcome.name);
          if (!playerMap[key]) playerMap[key] = { line: outcome.point };
          const side = outcome.name.toLowerCase().includes("over") || outcome.description?.toLowerCase() === "over" ? "over" : "under";
          // For strikeout props, the player name is in outcome.description sometimes
          const pitcherKey = normalizeName(outcome.description ?? outcome.name);
          if (!kOdds[pitcherKey]) kOdds[pitcherKey] = { line: outcome.point };
          kOdds[pitcherKey][side] = formatAmerican(outcome.price);
          if (side === "over") kOdds[pitcherKey].impliedOver = americanToImplied(outcome.price);
        }
      }
    } catch (err) {
      console.warn(`  ❌ Props for ${ev.gameKey}: ${err.message}`);
    }
  }

  console.log(`✅ HR odds: ${Object.keys(hrOdds).length} players`);
  console.log(`✅ K odds: ${Object.keys(kOdds).length} pitchers`);

  // ── Write output ────────────────────────────────────────────────────────────
  const output = {
    fetchedAt: new Date().toISOString(),
    sport: SPORT,
    moneylines,
    hrOdds,
    kOdds,
  };

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Wrote ${OUTPUT}`);
}

main().catch(err => {
  console.error("Unexpected error (non-fatal):", err?.message ?? err);
  process.exit(0);
});
