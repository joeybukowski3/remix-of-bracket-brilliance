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
const OUTPUT = path.resolve(__dirname, "../public/data/mlb/mlb-odds.json");
const ODDS_BASE = "https://api.the-odds-api.com/v4";
const PARLAY_BASE = "https://parlay-api.com/v1";
const SPORT = "baseball_mlb";
const TIMEOUT_MS = 20000;
const PARLAY_HR_MARKET = "player_home_runs";
const PARLAY_K_MARKET = "player_strikeouts";

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "JoeKnowsBall/1.0",
};

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
    const used = res.headers.get("x-requests-used");
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

function canonicalPropMarket(value) {
  const market = String(value ?? "").toLowerCase();
  if (market === PARLAY_HR_MARKET || market === "batter_home_runs") return PARLAY_HR_MARKET;
  if (market === PARLAY_K_MARKET || market === "pitcher_strikeouts") return PARLAY_K_MARKET;
  return market;
}

async function fetchParlayApiProps(parlayKey) {
  const markets = `${PARLAY_HR_MARKET},${PARLAY_K_MARKET}`;
  const url = `${PARLAY_BASE}/sports/${SPORT}/props?markets=${markets}&limit=10000`;
  const data = await fetchJson(url, {
    extraHeaders: { "X-API-Key": parlayKey },
    label: "parlayapi:props",
  });

  const props = Array.isArray(data)
    ? data
    : Array.isArray(data?.props)
      ? data.props
      : Array.isArray(data?.results)
        ? data.results
        : [];
  const hrOdds = {};
  const kOdds = {};
  const detectedMarkets = [...new Set(props.map((row) => row?.market_key).filter(Boolean))].sort();

  console.log(`  ParlayAPI rows=${props.length}`);
  if (detectedMarkets.length) console.log(`  ParlayAPI markets=${detectedMarkets.join(",")}`);

  const preferred = ["draftkings", "fanduel", "betmgm", "caesars", "pinnacle", "bovada"];
  const grouped = {};

  for (const row of props) {
    const market = canonicalPropMarket(row?.market_key);
    if (market !== PARLAY_HR_MARKET && market !== PARLAY_K_MARKET) continue;
    const player = normalizeName(row?.player);
    if (!player) continue;
    const key = `${player}|${market}`;
    const bookmaker = String(row?.bookmaker ?? row?.source ?? "").toLowerCase();
    const bookRank = preferred.indexOf(bookmaker);
    const rank = bookRank === -1 ? preferred.length : bookRank;
    if (!grouped[key] || rank < grouped[key].rank) grouped[key] = { row, market, rank };
  }

  for (const { row, market } of Object.values(grouped)) {
    const playerKey = normalizeName(row.player);
    if (market === PARLAY_HR_MARKET) {
      hrOdds[playerKey] = {
        yes: formatAmerican(row.over_price),
        no: formatAmerican(row.under_price),
        line: row.line ?? 0.5,
        impliedYes: americanToImplied(row.over_price),
        bookmaker: row.bookmaker ?? row.source ?? null,
      };
    } else if (market === PARLAY_K_MARKET) {
      kOdds[playerKey] = {
        line: row.line ?? null,
        over: formatAmerican(row.over_price),
        under: formatAmerican(row.under_price),
        impliedOver: americanToImplied(row.over_price),
        bookmaker: row.bookmaker ?? row.source ?? null,
      };
    }
  }

  return { hrOdds, kOdds, rowCount: props.length, detectedMarkets };
}

async function main() {
  const oddsApiPrimaryKey = process.env.ODDS_API_KEY;
  const oddsApiBackupKey = process.env.ODDS_API_KEY_BACKUP;
  const parlayKey = process.env.PARLAYAPI;
  const theRundownKey = process.env.THERUNDOWNAPI;

  async function resolveOddsApiKey() {
    if (!oddsApiPrimaryKey && !oddsApiBackupKey) return null;
    if (!oddsApiPrimaryKey) {
      console.log("Primary ODDS_API_KEY not set — using backup.");
      return oddsApiBackupKey;
    }
    try {
      const res = await fetch(`${ODDS_BASE}/sports?apiKey=${oddsApiPrimaryKey}`, {
        signal: AbortSignal.timeout(8000),
        headers: HEADERS,
      });
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
  console.log("Fetching MLB moneylines...");
  const moneylineResult = await getMlbMoneylinesWithFallbacks({
    oddsApiKey,
    sportsGameOddsApiKey: process.env.SPORTSGAMEODDS_API_KEY,
    oddsApiIoKey: process.env.ODDS_API_IO_KEY,
    theRundownApiKey: theRundownKey,
    fetchFn: fetch,
    logger: console,
  });
  const moneylines = moneylineResult.moneylines;
  console.log(`✅ Moneylines: ${Object.keys(moneylines).length} games via ${moneylineResult.metadata.source}`);

  let hrOdds = {};
  let kOdds = {};
  const fetchStatus = {
    moneylines: `${moneylineResult.metadata.source}:${Object.keys(moneylines).length}`,
    hrProps: parlayKey ? "pending" : "skipped:no-PARLAYAPI-key",
    kProps: parlayKey ? "pending" : "skipped:no-PARLAYAPI-key",
    propsSource: null,
    propsRows: 0,
    requestedMarkets: [PARLAY_HR_MARKET, PARLAY_K_MARKET],
    detectedMarkets: [],
    error: moneylineResult.metadata.providerErrors[0] ?? null,
    source: moneylineResult.metadata.source,
    fallbackUsed: moneylineResult.metadata.fallbackUsed,
    providerErrors: moneylineResult.metadata.providerErrors,
    generatedAt: moneylineResult.metadata.generatedAt,
  };

  if (parlayKey) {
    console.log("Fetching MLB player props via ParlayAPI...");
    try {
      const result = await fetchParlayApiProps(parlayKey);
      hrOdds = result.hrOdds;
      kOdds = result.kOdds;
      fetchStatus.propsRows = result.rowCount;
      fetchStatus.detectedMarkets = result.detectedMarkets;
      console.log(`✅ HR odds: ${Object.keys(hrOdds).length} players`);
      console.log(`✅ K odds: ${Object.keys(kOdds).length} pitchers`);
      fetchStatus.hrProps = `${result.rowCount > 0 ? "ok" : "empty"}:${Object.keys(hrOdds).length}`;
      fetchStatus.kProps = `${result.rowCount > 0 ? "ok" : "empty"}:${Object.keys(kOdds).length}`;
      fetchStatus.propsSource = "parlayapi";
    } catch (err) {
      console.warn("❌ ParlayAPI props failed:", err.message);
      fetchStatus.hrProps = "failed";
      fetchStatus.kProps = "failed";
      if (!fetchStatus.error) fetchStatus.error = err.message;
    }
  } else {
    console.warn("No PARLAYAPI key — player props skipped. Set the PARLAYAPI secret to enable HR and K odds.");
  }

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
  console.log("   ParlayAPI credits used this run: 3 (when key is present)");
}

main().catch((err) => {
  console.error("Unexpected error (non-fatal):", err?.message ?? err);
  process.exit(0);
});
