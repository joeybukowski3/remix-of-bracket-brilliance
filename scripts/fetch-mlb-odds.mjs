/**
 * fetch-mlb-odds.mjs
 * Fetches MLB odds with provider fallbacks.
 *
 * PLAYER PROPS — ParlayAPI (primary, 3 credits/run):
 *   GET /v1/sports/baseball_mlb/props?markets=batter_home_runs,pitcher_strikeouts
 *   Returns ALL players across ALL games in one call. Auth via X-API-Key header.
 *   Free tier: 1,000 credits/month. 4 runs/day = 12 credits/day ≈ 360/month → fits free tier.
 *
 * MONEYLINES — The Odds API → SportsGameOdds → Odds-API.io → TheRundown → ESPN
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

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT     = path.resolve(__dirname, "../public/data/mlb/mlb-odds.json");
const ODDS_BASE  = "https://api.the-odds-api.com/v4";
const PARLAY_BASE = "https://parlay-api.com/v1";
const SPORT      = "baseball_mlb";
const TIMEOUT_MS = 20000;

const HEADERS = {
  "Accept": "application/json",
  "User-Agent": "JoeKnowsBall/1.0",
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchJson(url, { extraHeaders = {}, label = url } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { ...HEADERS, ...extraHeaders },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const remaining = res.headers.get("x-requests-remaining");
    const used      = res.headers.get("x-requests-used");
    console.log(`  [${label}] status=${res.status} remaining=${remaining ?? "?"} used=${used ?? "?"}`);
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch (_) {}
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
    }
    return res.json();
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

// ── ParlayAPI props (HR + K in one call, 3 credits) ──────────────────────────

async function fetchParlayApiProps(parlayKey) {
  const url = `${PARLAY_BASE}/sports/${SPORT}/props?markets=batter_home_runs,pitcher_strikeouts`;
  const data = await fetchJson(url, {
    extraHeaders: { "X-API-Key": parlayKey },
    label: "parlayapi:props",
  });

  const props = Array.isArray(data) ? data : (data?.props ?? []);
  const hrOdds = {};
  const kOdds  = {};

  // Book preference order for picking the canonical line when multiple books differ
  const PREFERRED = ["draftkings", "fanduel", "betmgm", "caesars", "pinnacle", "bovada"];

  // Group rows by (player, market) and pick preferred book
  const grouped = {};
  for (const row of props) {
    const market = row.market_key;
    if (market !== "batter_home_runs" && market !== "pitcher_strikeouts") continue;
    const key = `${normalizeName(row.player)}|${market}`;
    const bookRank = PREFERRED.indexOf(row.bookmaker ?? row.source ?? "");
    const rank = bookRank === -1 ? PREFERRED.length : bookRank;
    if (!grouped[key] || rank < grouped[key].rank) {
      grouped[key] = { row, rank };
    }
  }

  for (const { row } of Object.values(grouped)) {
    const playerKey = normalizeName(row.player);
    if (row.market_key === "batter_home_runs") {
      // ParlayAPI batter_home_runs: over_price = "Yes" side (anytime HR)
      hrOdds[playerKey] = {
        yes: formatAmerican(row.over_price),
        no:  formatAmerican(row.under_price),
        impliedYes: americanToImplied(row.over_price),
      };
    } else if (row.market_key === "pitcher_strikeouts") {
      kOdds[playerKey] = {
        line:        row.line ?? null,
        over:        formatAmerican(row.over_price),
        under:       formatAmerican(row.under_price),
        impliedOver: americanToImplied(row.over_price),
      };
    }
  }

  return { hrOdds, kOdds };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const oddsApiPrimaryKey = process.env.ODDS_API_KEY;
  const oddsApiBackupKey  = process.env.ODDS_API_KEY_BACKUP;
  const parlayKey         = process.env.PARLAYAPI;
  const theRundownKey     = process.env.THERUNDOWNAPI;

  // Resolve Odds API key for moneylines (0-credit quota check)
  async function resolveOddsApiKey() {
    if (!oddsApiPrimaryKey && !oddsApiBackupKey) return null;
    if (!oddsApiPrimaryKey) { console.log("Primary ODDS_API_KEY not set — using backup."); return oddsApiBackupKey; }
    try {
      const res = await fetch(
        `${ODDS_BASE}/sports?apiKey=${oddsApiPrimaryKey}`,
        { signal: AbortSignal.timeout(8000), headers: HEADERS }
      );
      const remaining = parseInt(res.headers.get("x-requests-remaining") ?? "1", 10);
      if (res.status === 401 || res.status === 402 || remaining <= 0) {
        if (oddsApiBackupKey) {
          console.warn(`Primary key exhausted (status=${res.status} remaining=${remaining}) — switching to backup key.`);
          return oddsApiBackupKey;
        }
        console.warn("Primary key exhausted and no backup key set.");
        return null;
      }
      console.log(`ODDS_API_KEY active (remaining=${remaining})`);
      return oddsApiPrimaryKey;
    } catch (err) {
      console.warn(`Primary key check failed (${err.message}) — trying backup.`);
      return oddsApiBackupKey ?? oddsApiPrimaryKey;
    }
  }

  const oddsApiKey = await resolveOddsApiKey();

  // ── Moneylines ────────────────────────────────────────────────────────────
  console.log("Fetching MLB moneylines...");
  const moneylineResult = await getMlbMoneylinesWithFallbacks({
    oddsApiKey,
    sportsGameOddsApiKey: process.env.SPORTSGAMEODDS_API_KEY,
    oddsApiIoKey:         process.env.ODDS_API_IO_KEY,
    theRundownApiKey:     theRundownKey,
    fetchFn: fetch,
    logger: console,
  });
  const moneylines = moneylineResult.moneylines;
  console.log(`✅ Moneylines: ${Object.keys(moneylines).length} games via ${moneylineResult.metadata.source}`);

  // ── Player props (HR + K) via ParlayAPI ──────────────────────────────────
  let hrOdds = {};
  let kOdds  = {};
  const fetchStatus = {
    moneylines:   `${moneylineResult.metadata.source}:${Object.keys(moneylines).length}`,
    hrProps:      parlayKey ? "pending" : "skipped:no-PARLAYAPI-key",
    kProps:       parlayKey ? "pending" : "skipped:no-PARLAYAPI-key",
    propsSource:  null,
    error:        moneylineResult.metadata.providerErrors[0] ?? null,
    source:       moneylineResult.metadata.source,
    fallbackUsed: moneylineResult.metadata.fallbackUsed,
    providerErrors: moneylineResult.metadata.providerErrors,
    generatedAt:  moneylineResult.metadata.generatedAt,
  };

  if (parlayKey) {
    console.log("Fetching MLB player props via ParlayAPI...");
    try {
      const result = await fetchParlayApiProps(parlayKey);
      hrOdds = result.hrOdds;
      kOdds  = result.kOdds;
      console.log(`✅ HR odds: ${Object.keys(hrOdds).length} players`);
      console.log(`✅ K odds:  ${Object.keys(kOdds).length} pitchers`);
      fetchStatus.hrProps    = `ok:${Object.keys(hrOdds).length}`;
      fetchStatus.kProps     = `ok:${Object.keys(kOdds).length}`;
      fetchStatus.propsSource = "parlayapi";
    } catch (err) {
      console.warn("❌ ParlayAPI props failed:", err.message);
      fetchStatus.hrProps = "failed";
      fetchStatus.kProps  = "failed";
      if (!fetchStatus.error) fetchStatus.error = err.message;
    }
  } else {
    console.warn("No PARLAYAPI key — player props skipped. Set the PARLAYAPI secret to enable HR and K odds.");
  }

  // ── Write output ──────────────────────────────────────────────────────────
  const output = {
    fetchedAt:      new Date().toISOString(),
    source:         moneylineResult.metadata.source,
    fallbackUsed:   moneylineResult.metadata.fallbackUsed,
    providerErrors: moneylineResult.metadata.providerErrors,
    generatedAt:    moneylineResult.metadata.generatedAt,
    fetchStatus,
    sport: SPORT,
    moneylines,
    hrOdds,
    kOdds,
  };

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Wrote ${OUTPUT}`);
  console.log("   ParlayAPI credits used this run: 3 (when key is present)");
}

main().catch(err => {
  console.error("Unexpected error (non-fatal):", err?.message ?? err);
  process.exit(0);
});
