/**
 * fetch-mlb-odds.mjs
 * Fetches MLB odds from The Odds API using BULK endpoints and provider fallbacks.
 *
 * THE ODDS API CREDIT USAGE: 3 API calls per run when the primary provider is available (was up to 17).
 *   Call 1: /sports/baseball_mlb/odds/?markets=h2h          → all moneylines
 *   Call 2: /sports/baseball_mlb/odds/?markets=batter_home_runs → all HR props
 *   Call 3: /sports/baseball_mlb/odds/?markets=pitcher_strikeouts → all K props
 *   Backup moneylines: SportsGameOdds, then Odds-API.io
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
import {
  americanToImplied,
  formatAmerican,
  getMlbMoneylinesWithFallbacks,
} from "./lib/mlb-moneyline-providers.mjs";

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

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (apiKey) console.log(`ODDS_API_KEY present (length: ${apiKey.length})`);
  else console.warn("ODDS_API_KEY is not set — The Odds API moneylines/props will be skipped.");

  console.log("Fetching MLB odds via bulk endpoints...");

  const moneylineResult = await getMlbMoneylinesWithFallbacks({
    oddsApiKey: apiKey,
    sportsGameOddsApiKey: process.env.SPORTSGAMEODDS_API_KEY,
    oddsApiIoKey: process.env.ODDS_API_IO_KEY,
    fetchFn: fetch,
    logger: console,
  });
  const moneylines = moneylineResult.moneylines;
  const hrOdds     = {};
  const kOdds      = {};
  const fetchStatus = {
    moneylines: `${moneylineResult.metadata.source}:${Object.keys(moneylines).length}`,
    hrProps: apiKey ? "pending" : "skipped",
    kProps: apiKey ? "pending" : "skipped",
    error: moneylineResult.metadata.providerErrors[0] ?? null,
    source: moneylineResult.metadata.source,
    fallbackUsed: moneylineResult.metadata.fallbackUsed,
    providerErrors: moneylineResult.metadata.providerErrors,
    generatedAt: moneylineResult.metadata.generatedAt,
  };
  console.log(`✅ Moneylines: ${Object.keys(moneylines).length} games via ${moneylineResult.metadata.source}`);

  // ── Call 2: HR props (batter_home_runs) — all games, one request ─────────
  if (apiKey) {
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
  }

  // ── Call 3: K props (pitcher_strikeouts) — all games, one request ────────
  if (apiKey) {
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
  }

  // ── Write output ──────────────────────────────────────────────────────────
  const output = {
    fetchedAt: new Date().toISOString(),
    source: moneylineResult.metadata.source,
    fallbackUsed: moneylineResult.metadata.fallbackUsed,
    providerErrors: moneylineResult.metadata.providerErrors,
    generatedAt: moneylineResult.metadata.generatedAt,
    fetchStatus,
    sport: SPORT,
    moneylines,
    hrOdds,
    kOdds,
  };

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Wrote ${OUTPUT}`);
  console.log("   The Odds API credits used this run: up to 3 when all primary calls succeed");
}

main().catch(err => {
  console.error("Unexpected error (non-fatal):", err?.message ?? err);
  process.exit(0);
});
