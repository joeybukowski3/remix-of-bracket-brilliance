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

// ── Polymarket fallback ──────────────────────────────────────────────────────

const POLYMARKET_BASE = "https://gamma-api.polymarket.com";

// MLB team name fragments used to match Polymarket question text
const MLB_TEAM_FRAGMENTS = {
  ARI: ["diamondbacks", "arizona"],  ATL: ["braves", "atlanta"],
  BAL: ["orioles", "baltimore"],     BOS: ["red sox", "boston"],
  CHC: ["cubs", "chicago cubs"],     CWS: ["white sox", "chicago white"],
  CIN: ["reds", "cincinnati"],       CLE: ["guardians", "cleveland"],
  COL: ["rockies", "colorado"],      DET: ["tigers", "detroit"],
  HOU: ["astros", "houston"],        KC:  ["royals", "kansas city"],
  LAA: ["angels", "los angeles angels", "anaheim"],
  LAD: ["dodgers", "los angeles dodgers"],
  MIA: ["marlins", "miami"],         MIL: ["brewers", "milwaukee"],
  MIN: ["twins", "minnesota"],       NYM: ["mets", "new york mets"],
  NYY: ["yankees", "new york yankees"],
  ATH: ["athletics", "oakland", "las vegas athletics"],
  PHI: ["phillies", "philadelphia"], PIT: ["pirates", "pittsburgh"],
  SD:  ["padres", "san diego"],      SF:  ["giants", "san francisco"],
  SEA: ["mariners", "seattle"],      STL: ["cardinals", "st. louis", "saint louis"],
  TB:  ["rays", "tampa bay"],        TEX: ["rangers", "texas"],
  TOR: ["blue jays", "toronto"],     WSH: ["nationals", "washington"],
};

function teamMatchesQuestion(abbr, question) {
  const q = question.toLowerCase();
  const fragments = MLB_TEAM_FRAGMENTS[abbr] ?? [];
  return fragments.some(f => q.includes(f));
}

// Convert Polymarket price (0–1) to American odds string
function priceToAmerican(price) {
  if (price == null || !Number.isFinite(price) || price <= 0 || price >= 1) return null;
  if (price >= 0.5) {
    return `-${Math.round(price / (1 - price) * 100)}`;
  }
  return `+${Math.round((1 - price) / price * 100)}`;
}

// Format implied probability as percentage string e.g. "72%"
function priceToPercent(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return `${Math.round(price * 100)}%`;
}

async function fetchPolymarketMLB(todayGames) {
  console.log("ODDS_API_KEY not set — using Polymarket as moneyline source.");
  const moneylines = {};

  try {
    // Fetch active MLB game markets ordered by liquidity
    // Polymarket MLB game-winner markets end on the game date
    const url = `${POLYMARKET_BASE}/markets?active=true&limit=100&order=volume24hr&ascending=false`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let markets = [];
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { "Accept": "application/json" } });
      clearTimeout(timer);
      if (res.ok) markets = await res.json();
    } finally {
      clearTimeout(timer);
    }

    // Filter to MLB game-winner markets: question contains team names + "win" or "beat"
    const mlbMarkets = markets.filter(m => {
      const q = (m.question ?? "").toLowerCase();
      const isGameMarket = q.includes(" win") || q.includes(" beat") || q.includes(" vs ");
      // Must mention at least one MLB team
      const hasMlbTeam = Object.values(MLB_TEAM_FRAGMENTS).some(frags => frags.some(f => q.includes(f)));
      return isGameMarket && hasMlbTeam && m.active && !m.closed;
    });

    console.log(`  [polymarket] ${mlbMarkets.length} candidate MLB markets found`);

    // Match each game in today's schedule to a Polymarket market
    for (const game of todayGames) {
      const awayAbbr = game.awayAbbr;
      const homeAbbr = game.homeAbbr;
      const gameKey = `${awayAbbr}@${homeAbbr}`;

      // Find a market where question mentions both teams
      const match = mlbMarkets.find(m =>
        teamMatchesQuestion(awayAbbr, m.question) &&
        teamMatchesQuestion(homeAbbr, m.question)
      );

      if (!match) continue;

      // Parse outcomePrices — format is JSON string like '["0.72", "0.28"]'
      let prices;
      try { prices = JSON.parse(match.outcomePrices); } catch { continue; }
      if (!Array.isArray(prices) || prices.length < 2) continue;

      const outcomes = JSON.parse(match.outcomes ?? '[]');
      const price0 = parseFloat(prices[0]);
      const price1 = parseFloat(prices[1]);
      if (!Number.isFinite(price0) || !Number.isFinite(price1)) continue;

      // Determine which outcome corresponds to away vs home
      // Polymarket questions are usually "Will [TEAM] beat [TEAM]?" — first outcome is Yes
      const q = match.question.toLowerCase();
      let awayPrice, homePrice;

      const awayMentionedFirst = (() => {
        const awayFrags = MLB_TEAM_FRAGMENTS[awayAbbr] ?? [];
        const homeFrags = MLB_TEAM_FRAGMENTS[homeAbbr] ?? [];
        const awayIdx = Math.min(...awayFrags.map(f => q.indexOf(f)).filter(i => i >= 0), Infinity);
        const homeIdx = Math.min(...homeFrags.map(f => q.indexOf(f)).filter(i => i >= 0), Infinity);
        return awayIdx < homeIdx;
      })();

      if (awayMentionedFirst) {
        // "Will [AWAY] beat [HOME]?" → Yes = away wins
        awayPrice = price0; homePrice = price1;
      } else {
        // "Will [HOME] beat [AWAY]?" → Yes = home wins
        homePrice = price0; awayPrice = price1;
      }

      moneylines[gameKey] = {
        away: {
          team: awayAbbr,
          price: awayPrice,
          american: priceToPercent(awayPrice),  // Show as "72%" when no sportsbook ML
          implied: awayPrice,
          source: "polymarket",
        },
        home: {
          team: homeAbbr,
          price: homePrice,
          american: priceToPercent(homePrice),
          implied: homePrice,
          source: "polymarket",
        },
      };
      console.log(`  [polymarket] ${gameKey} → away ${priceToPercent(awayPrice)} / home ${priceToPercent(homePrice)} (${match.question.slice(0, 60)})`);
    }

    console.log(`✅ Polymarket moneylines: ${Object.keys(moneylines).length} games matched`);
  } catch (err) {
    console.warn("❌ Polymarket fallback failed:", err.message);
  }

  return moneylines;
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    // No Odds API key — fetch today's schedule for game keys, then use Polymarket
    let todayGames = [];
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const schedRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=team`, { headers: { "Accept": "application/json" } });
      if (schedRes.ok) {
        const sched = await schedRes.json();
        todayGames = (sched?.dates?.[0]?.games ?? []).map(g => ({
          awayAbbr: g?.teams?.away?.team?.abbreviation ?? "",
          homeAbbr: g?.teams?.home?.team?.abbreviation ?? "",
        })).filter(g => g.awayAbbr && g.homeAbbr);
      }
    } catch (e) {
      console.warn("Could not fetch schedule for Polymarket matching:", e.message);
    }

    const moneylines = await fetchPolymarketMLB(todayGames);
    const output = {
      fetchedAt: new Date().toISOString(),
      fetchStatus: { moneylines: `polymarket:${Object.keys(moneylines).length}`, hrProps: "skipped", kProps: "skipped", source: "polymarket" },
      sport: SPORT,
      moneylines,
      hrOdds: {},
      kOdds: {},
    };
    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
    console.log(`✅ Wrote ${OUTPUT} (Polymarket source)`);
    return;
  }
  console.log(`ODDS_API_KEY present (length: ${apiKey.length})`);
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
