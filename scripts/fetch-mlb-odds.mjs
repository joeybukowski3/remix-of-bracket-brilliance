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

// ── ESPN fallback ─────────────────────────────────────────────────────────────
// Uses ESPN's public scoreboard API (no key, no IP restrictions).
// odds.homeTeamOdds.moneyLine / odds.awayTeamOdds.moneyLine are DraftKings lines.

// cdn.espn.com returns current season data; site.api.espn.com is stuck on 2024
const ESPN_MLB_URL = "https://cdn.espn.com/core/mlb/scoreboard";

// Map ESPN team abbreviations to our internal abbreviations where they differ
const ESPN_ABBR_MAP = {
  "WSH": "WSH", "TB":  "TB",  "KC":  "KC",  "SF":  "SF",
  "SD":  "SD",  "NYM": "NYM", "NYY": "NYY", "LAD": "LAD",
  "LAA": "LAA", "CHC": "CHC", "CWS": "CWS", "ATH": "ATH",
  "OAK": "ATH", // ESPN may still use OAK
};

function normalizeEspnAbbr(abbr) {
  return ESPN_ABBR_MAP[abbr] ?? abbr;
}

// Format implied probability as percentage string e.g. "72%"
function priceToPercent(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return `${Math.round(price * 100)}%`;
}

async function fetchEspnMLBOdds(dateStr) {
  // dateStr = "YYYYMMDD"
  console.log(`Using ESPN as moneyline fallback (date: ${dateStr})`);
  const moneylines = {};

  try {
    const url = `${ESPN_MLB_URL}?xhr=1&limit=50`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let data;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "Accept": "application/json", "User-Agent": "JoeKnowsBall/1.0" },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`ESPN returned HTTP ${res.status}`);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }

    // CDN endpoint wraps in content.sbData; fall back to top-level events
    const events = data?.content?.sbData?.events ?? data?.sbData?.events ?? data?.events ?? [];
    console.log(`  [espn] ${events.length} MLB games found`);

    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      const competitors = comp.competitors ?? [];
      const homeComp = competitors.find(c => c.homeAway === "home");
      const awayComp = competitors.find(c => c.homeAway === "away");
      if (!homeComp || !awayComp) continue;

      const homeAbbr = normalizeEspnAbbr(homeComp.team?.abbreviation ?? "");
      const awayAbbr = normalizeEspnAbbr(awayComp.team?.abbreviation ?? "");
      if (!homeAbbr || !awayAbbr) continue;

      const gameKey = `${awayAbbr}@${homeAbbr}`;
      const odds = comp.odds?.[0] ?? null;

      // ESPN odds field: odds.homeTeamOdds.moneyLine (integer American odds)
      const homeML = odds?.homeTeamOdds?.moneyLine ?? odds?.homeTeamOdds?.current?.moneyLine ?? null;
      const awayML = odds?.awayTeamOdds?.moneyLine ?? odds?.awayTeamOdds?.current?.moneyLine ?? null;

      const homeMLNum = typeof homeML === "string" ? parseInt(homeML, 10) : homeML;
      const awayMLNum = typeof awayML === "string" ? parseInt(awayML, 10) : awayML;

      if (homeMLNum == null && awayMLNum == null) {
        // No ML in ESPN — use win probability if available
        const homeWinPct = comp.predictor?.homeTeam?.teamChanceLoss != null
          ? 1 - comp.predictor.homeTeam.teamChanceLoss
          : odds?.homeTeamOdds?.winPercentage ?? null;
        const awayWinPct = odds?.awayTeamOdds?.winPercentage ?? null;

        if (homeWinPct != null || awayWinPct != null) {
          const hp = homeWinPct != null ? homeWinPct / 100 : null;
          const ap = awayWinPct != null ? awayWinPct / 100 : null;
          moneylines[gameKey] = {
            away: { team: awayAbbr, price: ap, american: priceToPercent(ap), implied: ap, source: "espn" },
            home: { team: homeAbbr, price: hp, american: priceToPercent(hp), implied: hp, source: "espn" },
          };
          console.log(`  [espn] ${gameKey} → win% away=${priceToPercent(ap)} home=${priceToPercent(hp)}`);
        }
        continue;
      }

      // Convert American ML to implied probability
      function mlToImplied(ml) {
        if (ml == null || !Number.isFinite(ml)) return null;
        return ml > 0 ? 100 / (ml + 100) : Math.abs(ml) / (Math.abs(ml) + 100);
      }

      moneylines[gameKey] = {
        away: {
          team: awayAbbr,
          price: awayMLNum,
          american: awayMLNum != null ? (awayMLNum > 0 ? `+${awayMLNum}` : `${awayMLNum}`) : null,
          implied: mlToImplied(awayMLNum),
          source: "espn",
        },
        home: {
          team: homeAbbr,
          price: homeMLNum,
          american: homeMLNum != null ? (homeMLNum > 0 ? `+${homeMLNum}` : `${homeMLNum}`) : null,
          implied: mlToImplied(homeMLNum),
          source: "espn",
        },
      };
      console.log(`  [espn] ${gameKey} → away=${awayMLNum} home=${homeMLNum}`);
    }

    console.log(`✅ ESPN moneylines: ${Object.keys(moneylines).length} games matched`);
  } catch (err) {
    console.warn("❌ ESPN fallback failed:", err.message);
  }

  return moneylines;
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    // No Odds API key — use ESPN as free moneyline source
    const todayCompact = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "");
    const moneylines = await fetchEspnMLBOdds(todayCompact);
    const output = {
      fetchedAt: new Date().toISOString(),
      fetchStatus: { moneylines: `espn:${Object.keys(moneylines).length}`, hrProps: "skipped", kProps: "skipped", source: "espn" },
      sport: SPORT,
      moneylines,
      hrOdds: {},
      kOdds: {},
    };
    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
    console.log(`✅ Wrote ${OUTPUT} (ESPN fallback)`);
    return;
  }
  console.log(`ODDS_API_KEY present (length: ${apiKey.length})`);

  // ── Quick quota check before spending calls ───────────────────────────────
  // Test with a single cheap call; if 401/quota → fall back to ESPN
  let quotaExhausted = false;
  try {
    const testUrl = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`;
    const testRes = await fetch(testUrl, { headers: HEADERS });
    if (testRes.status === 401 || testRes.status === 429) {
      const body = await testRes.text().catch(() => "");
      if (body.includes("quota") || body.includes("OUT_OF_USAGE") || testRes.status === 401) {
        quotaExhausted = true;
        console.warn("⚠️ Odds API quota exhausted — falling back to ESPN.");
      }
    }
    if (!quotaExhausted && !testRes.ok) {
      throw new Error(`HTTP ${testRes.status}`);
    }
  } catch (err) {
    if (!quotaExhausted) console.warn("⚠️ Odds API check failed:", err.message);
    quotaExhausted = true;
  }

  // If quota hit, use ESPN fallback
  if (quotaExhausted) {
    const todayCompact = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "");
    const moneylines = await fetchEspnMLBOdds(todayCompact);
    const output = {
      fetchedAt: new Date().toISOString(),
      fetchStatus: { moneylines: `espn:${Object.keys(moneylines).length}`, hrProps: "skipped", kProps: "skipped", source: "espn" },
      sport: SPORT,
      moneylines,
      hrOdds: {},
      kOdds: {},
    };
    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
    console.log(`✅ Wrote ${OUTPUT} (ESPN fallback)`);
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
