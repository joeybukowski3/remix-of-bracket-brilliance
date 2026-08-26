/**
 * Phase 10B: canonical NFL yardage-market layer.
 *
 * Fetches passing/rushing/receiving-yards player props from ParlayAPI
 * (the approved v1 primary provider -- see Gate 1 trial), resolves each
 * quote to a real roster player via strict identity (name + team +
 * scheduled game + position), and selects a canonical two-sided line from
 * the approved-sportsbook allowlist only. Non-approved observations
 * (exchange/DFS) and milestone/ladder rows are retained for QA but never
 * become a canonical line. No model join happens here -- this script ends
 * at a trustworthy market layer, nothing else.
 *
 * Optionally cross-checks a couple of events against The Odds API
 * (DraftKings only) when ODDS_API_KEY is set; this is diagnostic only and
 * never blocks the canonical output.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  buildYardageQuotes,
  CANONICAL_MARKETS,
  MARKET_PLAUSIBLE_POSITIONS,
  selectCanonicalLines,
} from "./lib/nfl-prop-line-selection.mjs";
import { APPROVED_SPORTSBOOKS, classifyBook } from "./lib/nfl-book-classification.mjs";
import { buildGameIndex, buildRosterNameIndex, resolvePlayerIdentity } from "./lib/nfl-roster-identity.mjs";
import { loadLastObservations, parseArchiveJsonl, selectNewArchiveObservations, toArchiveJsonlLines } from "./lib/nfl-market-archive.mjs";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "public/data/nfl/nfl-yardage-market.json");
const QA_OUTPUT = path.join(ROOT, "artifacts/nfl-yardage-market-qa.json");
const ARCHIVE_OUTPUT = path.join(ROOT, "data/nfl/props/market-archive/nfl-yardage-market-archive.jsonl");
const GAMES_SOURCE = path.join(ROOT, "public/data/nfl/2026/games.json");
const DEPTH_CHART_DIR = path.join(ROOT, "data/nfl/nflverse/depth-charts");
const DEPTH_CHART_SEASON = 2026;

const PARLAY_BASE = "https://parlay-api.com/v1";
const ODDS_BASE = "https://api.the-odds-api.com/v4";
const NFL_SPORT_KEY = "americanfootball_nfl";
const TIMEOUT_MS = 20000;
const CROSS_CHECK_EVENT_LIMIT = 2;

const PROVIDER_MARKETS = [
  "player_passing_yards",
  "player_pass_yds",
  "player_rushing_yards",
  "player_rush_yds",
  "player_receiving_yards",
  "player_reception_yds",
];

const HEADERS = { Accept: "application/json", "User-Agent": "JoeKnowsBall/1.0" };

async function fetchJson(url, { extraHeaders = {}, label = url } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { ...HEADERS, ...extraHeaders }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch (_) {}
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)} [${label}]`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function loadGames() {
  const artifact = JSON.parse(readFileSync(GAMES_SOURCE, "utf8"));
  return Array.isArray(artifact?.games) ? artifact.games : [];
}

function loadDepthChartEntries() {
  const manifest = JSON.parse(readFileSync(path.join(DEPTH_CHART_DIR, "manifest.json"), "utf8"));
  const fileEntry = manifest.files.find((f) => f.season === DEPTH_CHART_SEASON);
  if (!fileEntry) throw new Error(`No depth-chart cache entry for season ${DEPTH_CHART_SEASON}`);
  const text = readFileSync(path.join(DEPTH_CHART_DIR, fileEntry.filename), "utf8");
  const rows = parseCsv(text);
  const POSITION_NAME_MAP = { Quarterback: "QB", "Running Back": "RB", "Wide Receiver": "WR", "Tight End": "TE" };
  const entries = [];
  for (const row of rows) {
    const position = POSITION_NAME_MAP[String(row.pos_name ?? "").trim()];
    if (!position) continue;
    const team = String(row.team ?? "").trim().toLowerCase();
    const gsis = String(row.gsis_id ?? "").trim();
    if (!team || !gsis) continue;
    entries.push({ team, position, playerId: `gsis:${gsis}`, playerName: String(row.player_name ?? "").trim() });
  }
  return entries;
}

async function fetchParlayApiRows(parlayKey) {
  const url = `${PARLAY_BASE}/sports/${NFL_SPORT_KEY}/props?markets=${PROVIDER_MARKETS.join(",")}&limit=10000`;
  const data = await fetchJson(url, { extraHeaders: { "X-API-Key": parlayKey }, label: "parlayapi:nfl-props" });
  return Array.isArray(data) ? data : Array.isArray(data?.props) ? data.props : Array.isArray(data?.results) ? data.results : [];
}

/** Diagnostic-only cross-check against The Odds API for a couple of events, DraftKings only. Never throws -- any failure is reported and skipped. */
async function crossCheckOddsApi(oddsApiKey) {
  try {
    const events = await fetchJson(`${ODDS_BASE}/sports/${NFL_SPORT_KEY}/events?apiKey=${oddsApiKey}`, { label: "oddsapi:events" });
    const sample = Array.isArray(events) ? events.slice(0, CROSS_CHECK_EVENT_LIMIT) : [];
    const comparisons = [];
    for (const event of sample) {
      const url = `${ODDS_BASE}/sports/${NFL_SPORT_KEY}/events/${event.id}/odds?apiKey=${oddsApiKey}&regions=us&markets=player_pass_yds&bookmakers=draftkings`;
      try {
        const odds = await fetchJson(url, { label: `oddsapi:event:${event.id}` });
        comparisons.push({ eventId: event.id, homeTeam: event.home_team, awayTeam: event.away_team, oddsApiDraftKingsMarkets: odds?.bookmakers?.length ?? 0 });
      } catch (err) {
        comparisons.push({ eventId: event.id, error: err.message });
      }
    }
    return { status: "ok", eventsChecked: comparisons.length, comparisons };
  } catch (err) {
    return { status: "failed", error: err.message };
  }
}

function buildProviderQaSummary(rows, quotesByMarket) {
  const allQuotes = Object.values(quotesByMarket).flat();
  const approvedObserved = new Set();
  const nonApprovedObserved = new Set();
  const marketCoverageByBook = {};
  const twoSidedCoverageByBook = {};

  for (const quote of allQuotes) {
    if (classifyBook(quote.bookmaker) === "sportsbook") approvedObserved.add(quote.bookmaker);
    else nonApprovedObserved.add(`${quote.bookmaker}(${quote.bookClass})`);

    const marketKey = `${quote.canonicalMarket}|${quote.bookmaker}`;
    marketCoverageByBook[marketKey] = (marketCoverageByBook[marketKey] ?? 0) + 1;
    if (quote.twoSided) twoSidedCoverageByBook[marketKey] = (twoSidedCoverageByBook[marketKey] ?? 0) + 1;
  }

  const milestoneRowCount = rows.filter((r) => /milestone/i.test(String(r?.market_key ?? ""))).length;

  return {
    approvedSportsbooksObserved: [...approvedObserved].sort(),
    unapprovedProvidersObserved: [...nonApprovedObserved].sort(),
    standardMarketRowCount: allQuotes.length,
    milestoneMarketRowCount: milestoneRowCount,
    marketCoverageByBook,
    twoSidedCoverageByBook,
  };
}

async function main() {
  const parlayKey = process.env.PARLAYAPI;
  const oddsApiKey = process.env.ODDS_API_KEY;

  if (!parlayKey) {
    console.error("No PARLAYAPI key set -- cannot build the canonical NFL yardage market. Aborting (non-fatal exit).");
    process.exit(0);
  }

  console.log("Fetching NFL yardage props via ParlayAPI...");
  const rows = await fetchParlayApiRows(parlayKey);
  console.log(`  ParlayAPI rows=${rows.length}`);

  const games = loadGames();
  const depthChartEntries = loadDepthChartEntries();
  const gameIndex = buildGameIndex(games);
  const rosterIndex = buildRosterNameIndex(depthChartEntries);

  const quotesByMarket = {};
  for (const market of CANONICAL_MARKETS) quotesByMarket[market] = [];
  for (const row of rows) {
    const { quotes } = buildYardageQuotes([row]);
    for (const quote of quotes) quotesByMarket[quote.canonicalMarket].push(quote);
  }

  const canonical = {};
  const unresolvedIdentity = [];
  const noApprovedBookMarket = [];
  const archiveObservations = [];

  for (const market of CANONICAL_MARKETS) {
    const { selections, rejections } = selectCanonicalLines(quotesByMarket[market], { approvedBookRanking: APPROVED_SPORTSBOOKS });
    canonical[market] = {};

    for (const rejection of rejections) {
      noApprovedBookMarket.push({ market, player: rejection.player, eventId: rejection.eventId, reason: rejection.rejected });
    }

    for (const selection of selections) {
      const identity = resolvePlayerIdentity(
        { providerName: selection.providerPlayerName, homeTeamFullName: selection.homeTeam, awayTeamFullName: selection.awayTeam, canonicalMarket: market },
        { rosterIndex, gameIndex, marketPlausiblePositions: MARKET_PLAUSIBLE_POSITIONS },
      );

      if (!identity.resolved) {
        unresolvedIdentity.push({ market, providerPlayerName: selection.providerPlayerName, eventId: selection.eventId, reason: identity.reason });
        continue;
      }

      canonical[market][identity.identity.playerId] = {
        playerId: identity.identity.playerId,
        playerName: identity.identity.playerName,
        position: identity.identity.position,
        team: identity.identity.team,
        opponent: identity.identity.opponent,
        gameId: identity.identity.gameId,
        week: identity.identity.week,
        bookmaker: selection.bookmaker,
        point: selection.point,
        over: selection.over,
        under: selection.under,
        booksAtPoint: selection.booksAtPoint,
        lastUpdate: selection.lastUpdate,
      };

      archiveObservations.push({
        observedAt: new Date().toISOString(),
        canonicalMarket: market,
        playerId: identity.identity.playerId,
        playerName: identity.identity.playerName,
        team: identity.identity.team,
        opponent: identity.identity.opponent,
        gameId: identity.identity.gameId,
        week: identity.identity.week,
        bookmaker: selection.bookmaker,
        point: selection.point,
        overPrice: selection.overPrice,
        underPrice: selection.underPrice,
      });
    }
  }

  const qa = buildProviderQaSummary(rows, quotesByMarket);
  const playersWithDkLine = CANONICAL_MARKETS.flatMap((market) =>
    Object.values(canonical[market]).filter((entry) => entry.bookmaker === "draftkings").map((entry) => entry.playerName),
  );

  let crossCheck = { status: "skipped:no-ODDS_API_KEY" };
  if (oddsApiKey) {
    console.log("Running minimal Odds API cross-check (DraftKings, passing yards, up to 2 events)...");
    crossCheck = await crossCheckOddsApi(oddsApiKey);
  } else {
    console.log("No ODDS_API_KEY set -- skipping cross-check (non-blocking).");
  }

  mkdirSync(path.dirname(ARCHIVE_OUTPUT), { recursive: true });
  let existingArchive = [];
  if (existsSync(ARCHIVE_OUTPUT)) {
    existingArchive = parseArchiveJsonl(readFileSync(ARCHIVE_OUTPUT, "utf8"));
  }
  const lastByKey = loadLastObservations(existingArchive);
  const newArchiveRecords = selectNewArchiveObservations(archiveObservations, lastByKey);
  if (newArchiveRecords.length > 0) {
    appendFileSync(ARCHIVE_OUTPUT, `${toArchiveJsonlLines(newArchiveRecords)}\n`, "utf8");
  }
  console.log(`  Archive: ${newArchiveRecords.length} new observation(s) appended (${archiveObservations.length} canonical lines this run, ${existingArchive.length} prior records).`);

  const output = {
    generatedAt: new Date().toISOString(),
    schemaVersion: "nfl-yardage-market-v1",
    sport: NFL_SPORT_KEY,
    provider: "parlayapi",
    approvedSportsbooks: APPROVED_SPORTSBOOKS,
    fetchStatus: { propsRows: rows.length },
    crossCheck,
    canonical,
    qa: {
      ...qa,
      playersWithDraftKingsLine: playersWithDkLine.length,
      playersWithNoApprovedSportsbookLine: noApprovedBookMarket.length,
      unresolvedIdentityCount: unresolvedIdentity.length,
    },
  };

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Wrote ${OUTPUT}`);

  mkdirSync(path.dirname(QA_OUTPUT), { recursive: true });
  writeFileSync(
    QA_OUTPUT,
    JSON.stringify({ generatedAt: output.generatedAt, ...qa, playersWithDkLine, noApprovedBookMarket, unresolvedIdentity, crossCheck }, null, 2),
    "utf8",
  );
  console.log(`✅ Wrote ${QA_OUTPUT}`);

  for (const market of CANONICAL_MARKETS) {
    console.log(`  ${market}: ${Object.keys(canonical[market]).length} canonical lines`);
  }
}

main().catch((err) => {
  console.error("Unexpected error (non-fatal):", err?.message ?? err);
  process.exit(0);
});
