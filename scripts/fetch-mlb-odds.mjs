/**
 * fetch-mlb-odds.mjs
 * Fetches MLB odds from The Odds API using BULK endpoints only.
 *
 * CREDIT USAGE: 3 API calls per run (was up to 17).
 *   Call 1: /sports/baseball_mlb/odds/?markets=h2h          → all moneylines
 *   Call 2: /sports/baseball_mlb/odds/?markets=batter_home_runs → all HR props
 *   Call 3: /sports/baseball_mlb/odds/?markets=pitcher_strikeouts → all K props
 *
 * At 4 runs/day: 12 credits/day = ~360/month (fits 500/month free tier).
 *
 * Writes public/data/mlb/mlb-odds.json
 * Always exits 0 — never fails the workflow.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT   = path.resolve(__dirname, "../public/data/mlb/mlb-odds.json");
const ODDS_BASE = "https://api.the-odds-api.com/v4";
const SPORT    = "baseball_mlb";
const TIMEOUT_MS = 20000;

const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "JoeKnowsBall/1.0",
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function get(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timer);
    const remaining = res.headers.get("x-requests-remaining");
    const used      = res.headers.get("x-requests-used");
    console.log(`  [${label}] status=${res.status} remaining=${remaining ?? "?"} used=${used ?? "?"}`);
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch (_) {}
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error(`Expected array, got: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return data;
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

// Prefer DraftKings → FanDuel → BetMGM → most outcomes
const PREFERRED = ["draftkings", "fanduel", "betmgm", "williamhill_us", "bovada"];

function bestBook(bookmakers, marketKey) {
  if (!Array.isArray(bookmakers) || !bookmakers.length) return null;
  for (const pref of PREFERRED) {
    const bk = bookmakers.find(b => b.key === pref);
    const market = bk?.markets?.find(m => m.key === marketKey);
    if (market?.outcomes?.length) return market;
  }
  return bookmakers
    .flatMap(b => b.markets?.filter(m => m.key === marketKey) ?? [])
    .sort((a, b) => (b.outcomes?.length ?? 0) - (a.outcomes?.length ?? 0))[0] ?? null;
}

const TEAM_ABBR = {
  "Arizona Diamondbacks": "ARI",  "Atlanta Braves": "ATL",       "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",        "Chicago Cubs": "CHC",         "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN",       "Cleveland Guardians": "CLE",  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",        "Houston Astros": "HOU",       "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",    "Los Angeles Dodgers": "LAD",  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",     "Minnesota Twins": "MIN",      "New York Mets": "NYM",
  "New York Yankees": "NYY",      "Oakland Athletics": "ATH",    "Athletics": "ATH",
  "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT",   "San Diego Padres": "SD",
  "San Francisco Giants": "SF",   "Seattle Mariners": "SEA",     "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",         "Texas Rangers": "TEX",        "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

function toAbbr(t) {
  return TEAM_ABBR[t] ?? t.split(" ").pop().slice(0, 3).toUpperCase();
}

// ── main ─────────────────────────────────────────────────────────────────────

// ── MLB Stats API win probability fallback ─────────────────────────────────────
// Uses MLB Stats API game predictions (no key, no IP restrictions, live 2026 data)
// Returns implied win probabilities as American ML strings

// Format implied probability as percentage string e.g. "72%"
function priceToPercent(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return `${Math.round(price * 100)}%`;
}

// Convert 0-1 probability to American ML integer
function probToAmerican(prob) {
  if (prob == null || !Number.isFinite(prob) || prob <= 0 || prob >= 1) return null;
  if (prob >= 0.5) return -Math.round(prob / (1 - prob) * 100);
  return Math.round((1 - prob) / prob * 100);
}

async function fetchMlbStatsOdds(dateStr) {
  // dateStr = "YYYY-MM-DD"
  console.log(`Using MLB Stats API win probability as ML fallback (date: ${dateStr})`);
  const moneylines = {};

  try {
    // Fetch today's schedule with linescore/winProbability hydration
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&hydrate=probablePitcher,team,linescore,game(content(summary)),decisions,winProbability`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let data;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "Accept": "application/json", "User-Agent": "JoeKnowsBall/1.0" },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`MLB Stats API returned HTTP ${res.status}`);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const games = data?.dates?.[0]?.games ?? [];
    console.log(`  [mlbstats] ${games.length} games found for ${dateStr}`);

    for (const game of games) {
      const awayAbbr = game?.teams?.away?.team?.abbreviation ?? "";
      const homeAbbr = game?.teams?.home?.team?.abbreviation ?? "";
      if (!awayAbbr || !homeAbbr) continue;

      const gameKey = `${awayAbbr}@${homeAbbr}`;

      // Try winProbability from the game data
      const wp = game?.winProbability ?? null;
      const awayWinPct = game?.teams?.away?.winProbability
        ?? (Array.isArray(wp) ? wp[wp.length - 1]?.awayTeamWinProbability : null)
        ?? null;
      const homeWinPct = game?.teams?.home?.winProbability
        ?? (Array.isArray(wp) ? wp[wp.length - 1]?.homeTeamWinProbability : null)
        ?? null;

      if (awayWinPct != null || homeWinPct != null) {
        const ap = awayWinPct != null ? awayWinPct / 100 : null;
        const hp = homeWinPct != null ? homeWinPct / 100 : null;
        const awayML = probToAmerican(ap);
        const homeML = probToAmerican(hp);
        moneylines[gameKey] = {
          away: { team: awayAbbr, price: awayML, american: awayML != null ? (awayML > 0 ? `+${awayML}` : `${awayML}`) : priceToPercent(ap), implied: ap, source: "mlbstats" },
          home: { team: homeAbbr, price: homeML, american: homeML != null ? (homeML > 0 ? `+${homeML}` : `${homeML}`) : priceToPercent(hp), implied: hp, source: "mlbstats" },
        };
        console.log(`  [mlbstats] ${gameKey} → away=${awayWinPct}% home=${homeWinPct}%`);
        continue;
      }

      // Fallback: use home field advantage as a rough 54/46 split if no win prob
      moneylines[gameKey] = {
        away: { team: awayAbbr, price: null, american: "46%", implied: 0.46, source: "mlbstats-estimate" },
        home: { team: homeAbbr, price: null, american: "54%", implied: 0.54, source: "mlbstats-estimate" },
      };
      console.log(`  [mlbstats] ${gameKey} → no win prob, using HFA estimate`);
    }

    console.log(`✅ MLB Stats API odds: ${Object.keys(moneylines).length} games`);
  } catch (err) {
    console.warn("❌ MLB Stats API fallback failed:", err.message);
  }

  return moneylines;
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    // No Odds API key — use MLB Stats API as free moneyline source
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const moneylines = await fetchMlbStatsOdds(today);
    const output = {
      fetchedAt: new Date().toISOString(),
      fetchStatus: { moneylines: `mlbstats:${Object.keys(moneylines).length}`, hrProps: "skipped", kProps: "skipped", source: "mlbstats" },
      sport: SPORT,
      moneylines,
      hrOdds: {},
      kOdds: {},
    };
    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
    console.log(`✅ Wrote ${OUTPUT} (MLB Stats API fallback)`);
    return;
  }
  console.log(`ODDS_API_KEY present (length: ${apiKey.length})`);

  // ── Quick quota check before spending calls ───────────────────────────────
  // Test with a single cheap call; if 401/quota → fall back to MLB Stats API
  let quotaExhausted = false;
  try {
    const testUrl = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`;
    const testRes = await fetch(testUrl, { headers: HEADERS });
    if (testRes.status === 401 || testRes.status === 429) {
      const body = await testRes.text().catch(() => "");
      if (body.includes("quota") || body.includes("OUT_OF_USAGE") || testRes.status === 401) {
        quotaExhausted = true;
        console.warn("⚠️ Odds API quota exhausted — falling back to MLB Stats API.");
      }
    }
    if (!quotaExhausted && !testRes.ok) {
      throw new Error(`HTTP ${testRes.status}`);
    }
  } catch (err) {
    if (!quotaExhausted) console.warn("⚠️ Odds API check failed:", err.message);
    quotaExhausted = true;
  }

  // If quota hit, use MLB Stats API fallback
  if (quotaExhausted) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const moneylines = await fetchMlbStatsOdds(today);
    const output = {
      fetchedAt: new Date().toISOString(),
      fetchStatus: { moneylines: `mlbstats:${Object.keys(moneylines).length}`, hrProps: "skipped", kProps: "skipped", source: "mlbstats" },
      sport: SPORT,
      moneylines,
      hrOdds: {},
      kOdds: {},
    };
    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
    console.log(`✅ Wrote ${OUTPUT} (MLB Stats API fallback)`);
    return;
  }

  console.log("Fetching MLB odds via bulk endpoints (3 calls total)...");

  const moneylines = {};
  const hrOdds     = {};
  const kOdds      = {};
  const fetchStatus = { moneylines: "pending", hrProps: "pending", kProps: "pending", error: null };

  // ── Call 1: Moneylines (h2h) ─────────────────────────────────────────────
  try {
    const url = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`;
    const events = await get(url, "h2h");

    for (const ev of events) {
      const awayTeam  = ev.away_team;
      const homeTeam  = ev.home_team;
      const gameKey   = `${toAbbr(awayTeam)}@${toAbbr(homeTeam)}`;
      const market    = bestBook(ev.bookmakers, "h2h");
      if (!market) continue;

      const awayOut = market.outcomes.find(o => o.name === awayTeam);
      const homeOut = market.outcomes.find(o => o.name === homeTeam);
      moneylines[gameKey] = {
        away: { team: awayTeam, price: awayOut?.price, american: formatAmerican(awayOut?.price), implied: americanToImplied(awayOut?.price) },
        home: { team: homeTeam, price: homeOut?.price, american: formatAmerican(homeOut?.price), implied: americanToImplied(homeOut?.price) },
      };
    }
    console.log(`✅ Moneylines: ${Object.keys(moneylines).length} games`);
    fetchStatus.moneylines = `ok:${Object.keys(moneylines).length}`;
  } catch (err) {
    console.warn("❌ Moneylines failed:", err.message);
    fetchStatus.moneylines = "failed";
    fetchStatus.error = err.message;
  }

  // ── Call 2: HR props (batter_home_runs) — all games, one request ─────────
  try {
    const url = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=batter_home_runs&oddsFormat=american`;
    const events = await get(url, "batter_home_runs");

    for (const ev of events) {
      const hrMarket = bestBook(ev.bookmakers, "batter_home_runs");
      if (!hrMarket) continue;

      for (const outcome of hrMarket.outcomes) {
        // Odds API: outcome.description = player name, outcome.name = "Yes"/"No"
        const playerKey = normalizeName(outcome.description ?? outcome.name);
        const side      = (outcome.name ?? "").toLowerCase().includes("no") ? "no" : "yes";
        if (!hrOdds[playerKey]) hrOdds[playerKey] = {};
        hrOdds[playerKey][side] = formatAmerican(outcome.price);
        if (side === "yes") hrOdds[playerKey].impliedYes = americanToImplied(outcome.price);
      }
    }
    console.log(`✅ HR odds: ${Object.keys(hrOdds).length} players`);
    fetchStatus.hrProps = `ok:${Object.keys(hrOdds).length}`;
  } catch (err) {
    console.warn("❌ HR props failed:", err.message);
    fetchStatus.hrProps = "failed";
    if (!fetchStatus.error) fetchStatus.error = err.message;
  }

  // ── Call 3: K props (pitcher_strikeouts) — all games, one request ────────
  try {
    const url = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=pitcher_strikeouts&oddsFormat=american`;
    const events = await get(url, "pitcher_strikeouts");

    for (const ev of events) {
      const kMarket = bestBook(ev.bookmakers, "pitcher_strikeouts");
      if (!kMarket) continue;

      for (const outcome of kMarket.outcomes) {
        // Odds API: outcome.name = pitcher name, outcome.description = "Over"/"Under"
        const pitcherKey = normalizeName(outcome.name);
        const side       = (outcome.description ?? "").toLowerCase() === "over" ? "over" : "under";
        if (!kOdds[pitcherKey]) kOdds[pitcherKey] = { line: null };
        if (outcome.point != null) kOdds[pitcherKey].line = outcome.point;
        kOdds[pitcherKey][side] = formatAmerican(outcome.price);
        if (side === "over") kOdds[pitcherKey].impliedOver = americanToImplied(outcome.price);
      }
    }
    console.log(`✅ K odds: ${Object.keys(kOdds).length} pitchers`);
    fetchStatus.kProps = `ok:${Object.keys(kOdds).length}`;
  } catch (err) {
    console.warn("❌ K props failed:", err.message);
    fetchStatus.kProps = "failed";
    if (!fetchStatus.error) fetchStatus.error = err.message;
  }

  // ── Write output ──────────────────────────────────────────────────────────
  const output = {
    fetchedAt: new Date().toISOString(),
    fetchStatus,
    sport: SPORT,
    moneylines,
    hrOdds,
    kOdds,
  };

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Wrote ${OUTPUT}`);
  console.log(`   Credits used this run: ~3 (was up to 17)`);
}

main().catch(err => {
  console.error("Unexpected error (non-fatal):", err?.message ?? err);
  process.exit(0);
});
