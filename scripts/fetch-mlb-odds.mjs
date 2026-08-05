import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  americanToImplied,
  getMlbMoneylinesWithFallbacks,
} from "./lib/mlb-moneyline-providers.mjs";
import {
  HR_MARKET,
  K_MARKET,
  buildPropQuotes,
  selectPrimaryLines,
} from "./lib/mlb-prop-line-selection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, "../public/data/mlb/mlb-odds.json");
const DIAGNOSTICS_OUTPUT = path.resolve(__dirname, "../artifacts/mlb-prop-line-selection.json");
const ODDS_BASE = "https://api.the-odds-api.com/v4";
const PARLAY_BASE = "https://parlay-api.com/v1";
const SPORT = "baseball_mlb";
const TIMEOUT_MS = 20000;
const PARLAY_HR_MARKET = HR_MARKET;
const PARLAY_K_MARKET = K_MARKET;

const PREFERRED_BOOKS = ["draftkings", "fanduel", "betmgm", "caesars", "pinnacle", "bovada"];
// K props only: bet365 is a real sportsbook that was missing from the shared
// `PREFERRED_BOOKS` list above, so it was ranked identically to an unranked/DFS
// source and could lose a book-preference tie by iteration order alone. Kept
// separate from `PREFERRED_BOOKS` (used for HR) so this never affects HR book
// ranking. DFS pick'em products (Underdog, PrizePicks, Sleeper) have different
// market structure/limits than a real two-sided sportsbook line and are
// excluded entirely from sourcing a strikeout prop line.
const K_PREFERRED_BOOKS = [...PREFERRED_BOOKS, "bet365"];
const K_DISALLOWED_BOOKS = new Set(["underdog", "prizepicks", "sleeper"]);

// A posted strikeout prop is a two-sided Over/Under market. The provider packs
// one-sided "N+ strikeouts" milestone rungs into the same `player_strikeouts`
// market key, so a pitcher with no two-sided market anywhere in the payload is
// omitted rather than published with a ladder rung as their line.
const K_REQUIRE_TWO_SIDED = true;

// Home runs are routinely priced Yes-only, so a one-sided HR market is normal
// and must not be rejected -- the ladder rungs are separated by threshold
// consensus instead.
const HR_REQUIRE_TWO_SIDED = false;

/** Per-player diagnostics are opt-in via `MLB_ODDS_DEBUG_PLAYERS=name,name`. */
function debugPlayerFilter() {
  return String(process.env.MLB_ODDS_DEBUG_PLAYERS ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

function logSelectionDiagnostics(label, { diagnostics, rejections }) {
  const watched = debugPlayerFilter();
  const suspicious = diagnostics.filter((entry) => entry.warnings.length > 0);
  console.log(
    `  [${label}] selected=${diagnostics.length} rejected=${rejections.length} flagged=${suspicious.length}`,
  );
  for (const entry of rejections.slice(0, 5)) {
    console.warn(`  [${label}] rejected ${entry.player}: ${entry.rejected} (${entry.warnings.join(",") || "no warnings"})`);
  }
  if (rejections.length > 5) console.warn(`  [${label}] ...and ${rejections.length - 5} more rejected`);
  for (const entry of [...diagnostics, ...rejections]) {
    if (!watched.includes(entry.player)) continue;
    console.log(
      `  [${label}] ${entry.player} market=${entry.providerMarket} point=${entry.selectedPoint} alt=${entry.isAlternate}` +
        ` twoSided=${entry.twoSided} books=${(entry.booksAtPoint ?? []).join("/")} reason=${entry.reason}` +
        ` offered=${(entry.pointsOffered ?? []).map((p) => `${p.point}x${p.books}`).join(",")}`,
    );
  }
}

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

  // Threshold first, price second. Every provider row is kept as a distinct
  // quote (event + player + market + threshold + side + bookmaker) so that the
  // primary line is resolved from market structure rather than from whichever
  // ladder rung happened to appear first in the payload.
  const { quotes, rejected } = buildPropQuotes(props);
  const hrResult = selectPrimaryLines(quotes.filter((quote) => quote.canonicalMarket === PARLAY_HR_MARKET), {
    bookRanking: PREFERRED_BOOKS,
    requireTwoSided: HR_REQUIRE_TWO_SIDED,
  });
  const kResult = selectPrimaryLines(quotes.filter((quote) => quote.canonicalMarket === PARLAY_K_MARKET), {
    bookRanking: K_PREFERRED_BOOKS,
    disallowedBooks: K_DISALLOWED_BOOKS,
    requireTwoSided: K_REQUIRE_TWO_SIDED,
  });

  console.log(`  ParlayAPI quotes=${quotes.length} unusableRows=${rejected}`);
  logSelectionDiagnostics("hr", hrResult);
  logSelectionDiagnostics("k", kResult);

  for (const [player, selection] of hrResult.selections) {
    hrOdds[player] = {
      yes: selection.over,
      no: selection.under,
      line: selection.point,
      impliedYes: americanToImplied(selection.overPrice),
      bookmaker: selection.bookmaker,
      providerPlayerName: selection.providerPlayerName,
      providerMarket: selection.providerMarket,
      isAlternate: selection.isAlternate,
      twoSided: selection.twoSided,
      booksAtLine: selection.booksAtPoint,
      selectionReason: selection.reason,
    };
  }

  for (const [player, selection] of kResult.selections) {
    kOdds[player] = {
      line: selection.point,
      over: selection.over,
      under: selection.under,
      impliedOver: americanToImplied(selection.overPrice),
      bookmaker: selection.bookmaker,
      providerPlayerName: selection.providerPlayerName,
      providerMarket: selection.providerMarket,
      isAlternate: selection.isAlternate,
      twoSided: selection.twoSided,
      booksAtLine: selection.booksAtPoint,
      selectionReason: selection.reason,
    };
  }

  return {
    hrOdds,
    kOdds,
    rowCount: props.length,
    detectedMarkets,
    selection: {
      quotes: quotes.length,
      unusableRows: rejected,
      hr: { selected: hrResult.diagnostics.length, rejected: hrResult.rejections.length },
      k: { selected: kResult.diagnostics.length, rejected: kResult.rejections.length },
    },
    diagnostics: { hr: hrResult, k: kResult },
  };
}

function writeSelectionDiagnostics(result) {
  const payload = {
    generatedAt: new Date().toISOString(),
    summary: result.selection,
    detectedMarkets: result.detectedMarkets,
    hr: { selected: result.diagnostics.hr.diagnostics, rejected: result.diagnostics.hr.rejections },
    k: { selected: result.diagnostics.k.diagnostics, rejected: result.diagnostics.k.rejections },
  };
  mkdirSync(path.dirname(DIAGNOSTICS_OUTPUT), { recursive: true });
  writeFileSync(DIAGNOSTICS_OUTPUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`  Wrote selection diagnostics ${DIAGNOSTICS_OUTPUT}`);
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
      fetchStatus.lineSelection = result.selection;
      writeSelectionDiagnostics(result);
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
