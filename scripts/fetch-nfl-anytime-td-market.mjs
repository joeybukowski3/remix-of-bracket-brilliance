/**
 * Canonical NFL Anytime Touchdown market layer.
 *
 * Fetches the ParlayAPI NFL props feed once and resolves the approved-book
 * "player to score a touchdown anytime" price for each real roster player,
 * via strict identity (name + team + scheduled game + plausible position).
 * See scripts/lib/nfl-anytime-td-selection.mjs for the full market-key
 * contract this was built against (live-verified, not assumed).
 *
 * This is a dedicated producer, deliberately separate from
 * fetch-nfl-yardage-market.mjs -- the anytime-TD market is structurally a
 * one-sided single price, not a two-sided line, and bending the yardage
 * selector to fit it would have muddied both. Identity resolution and book
 * classification are reused as-is from their shared lib modules.
 *
 * Fail-safe: any missing key, fetch failure, or malformed payload exits 0
 * without touching the last-known-good artifact or archive. No fabricated
 * odds are ever written.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  ANYTIME_TD_MARKET,
  ANYTIME_TD_PLAUSIBLE_POSITIONS,
  ANYTIME_TD_PRIMARY_MARKET_KEY,
  APPROVED_SPORTSBOOKS,
  buildAnytimeTdQuotes,
  computeMarketImpliedProbability,
  dedupeBovadaAliasQuotes,
  formatAmerican,
  selectAnytimeTdBestPrices,
} from "./lib/nfl-anytime-td-selection.mjs";
import { isApprovedSportsbook } from "./lib/nfl-book-classification.mjs";
import { buildGameIndex, buildRosterNameIndex, resolvePlayerIdentity } from "./lib/nfl-roster-identity.mjs";
import { loadLastObservations, parseArchiveJsonl, selectNewArchiveObservations, toArchiveJsonlLines } from "./lib/nfl-market-archive.mjs";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { resolveCurrentWeek } from "./lib/nfl-market-coverage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "public/data/nfl/nfl-anytime-td-market.json");
const ARCHIVE_OUTPUT = path.join(ROOT, "data/nfl/props/market-archive/nfl-anytime-td-market-archive.jsonl");
const GAMES_SOURCE = path.join(ROOT, "public/data/nfl/2026/games.json");
const DEPTH_CHART_DIR = path.join(ROOT, "data/nfl/nflverse/depth-charts");
const DEPTH_CHART_SEASON = 2026;

const PARLAY_BASE = "https://parlay-api.com/v1";
const NFL_SPORT_KEY = "americanfootball_nfl";
const TIMEOUT_MS = 20000;
const HEADERS = { Accept: "application/json", "User-Agent": "JoeKnowsBall/1.0" };

// The live payload does not actually respect this query filter -- it
// returns all three anytime-TD-flavored market_key families regardless
// (see module header) -- but the request still costs 3 credits either way
// per the live characterization, and passing it documents intent.
const REQUEST_MARKETS = "player_anytime_td";

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
  const url = `${PARLAY_BASE}/sports/${NFL_SPORT_KEY}/props?markets=${REQUEST_MARKETS}&limit=10000`;
  const data = await fetchJson(url, { extraHeaders: { "X-API-Key": parlayKey }, label: "parlayapi:nfl-anytime-td" });
  return Array.isArray(data) ? data : Array.isArray(data?.props) ? data.props : Array.isArray(data?.results) ? data.results : [];
}

async function main() {
  const parlayKey = process.env.PARLAYAPI;
  if (!parlayKey) {
    console.error("No PARLAYAPI key set -- cannot build the canonical NFL anytime-TD market. Aborting (non-fatal exit).");
    process.exit(0);
  }

  console.log("Fetching NFL anytime-TD props via ParlayAPI...");
  const rows = await fetchParlayApiRows(parlayKey);
  console.log(`  ParlayAPI rows=${rows.length}`);

  const games = loadGames();
  const depthChartEntries = loadDepthChartEntries();
  const gameIndex = buildGameIndex(games);
  const rosterIndex = buildRosterNameIndex(depthChartEntries);
  const marketPlausiblePositions = { [ANYTIME_TD_MARKET]: ANYTIME_TD_PLAUSIBLE_POSITIONS };
  // Disambiguates a divisional-rematch team pair toward the week this
  // market is actually being built for -- see selectGameForPair.
  const currentWeek = resolveCurrentWeek(games);

  const { quotes, rejections: buildRejections, marketKeyCounts } = buildAnytimeTdQuotes(rows);
  const { quotes: dedupedQuotes, collapsedCount: bovadaDuplicatesCollapsed } = dedupeBovadaAliasQuotes(quotes);
  const { selections, rejections: noApprovedBookRejections } = selectAnytimeTdBestPrices(dedupedQuotes, { approvedBookRanking: APPROVED_SPORTSBOOKS });

  const canonical = {};
  const unresolvedIdentity = [];
  const archiveObservations = [];
  const generatedAt = new Date().toISOString();

  for (const selection of selections) {
    const identity = resolvePlayerIdentity(
      { providerName: selection.decoratedName, homeTeamFullName: selection.homeTeam, awayTeamFullName: selection.awayTeam, canonicalMarket: ANYTIME_TD_MARKET, targetWeek: currentWeek },
      { rosterIndex, gameIndex, marketPlausiblePositions },
    );

    if (!identity.resolved) {
      unresolvedIdentity.push({ providerPlayerName: selection.providerPlayerName, eventId: selection.eventId, reason: identity.reason });
      continue;
    }

    const marketImpliedProbability = computeMarketImpliedProbability(selection.overPrice);

    canonical[identity.identity.playerId] = {
      playerId: identity.identity.playerId,
      playerName: identity.identity.playerName,
      position: identity.identity.position,
      team: identity.identity.team,
      opponent: identity.identity.opponent,
      gameId: identity.identity.gameId,
      week: identity.identity.week,
      anytimeTdOdds: selection.overPrice,
      anytimeTdBook: selection.bookmaker,
      marketImpliedProbability,
      oddsUpdatedAt: selection.lastUpdate,
      oddsSourceState: "available",
    };

    archiveObservations.push({
      observedAt: generatedAt,
      canonicalMarket: ANYTIME_TD_MARKET,
      playerId: identity.identity.playerId,
      playerName: identity.identity.playerName,
      team: identity.identity.team,
      opponent: identity.identity.opponent,
      gameId: identity.identity.gameId,
      week: identity.identity.week,
      bookmaker: selection.bookmaker,
      point: null,
      overPrice: selection.overPrice,
      underPrice: null,
    });
  }

  const approvedBookmakerCounts = {};
  const allBookmakerCounts = {};
  for (const quote of dedupedQuotes) {
    allBookmakerCounts[quote.bookmaker] = (allBookmakerCounts[quote.bookmaker] ?? 0) + 1;
    if (isApprovedSportsbook(quote.bookmaker)) approvedBookmakerCounts[quote.bookmaker] = (approvedBookmakerCounts[quote.bookmaker] ?? 0) + 1;
  }

  const observedApprovedBooks = new Set(dedupedQuotes.filter((q) => isApprovedSportsbook(q.bookmaker)).map((q) => q.bookmaker));
  const zeroRowApprovedBooks = APPROVED_SPORTSBOOKS.filter((book) => !observedApprovedBooks.has(book));

  const output = {
    schemaVersion: "nfl-anytime-td-market-v1",
    generatedAt,
    provider: "parlayapi",
    approvedSportsbooks: APPROVED_SPORTSBOOKS,
    fetchStatus: { propsRows: rows.length },
    canonical,
    qa: {
      providerRowsFetched: rows.length,
      primaryMarketRows: marketKeyCounts[ANYTIME_TD_PRIMARY_MARKET_KEY] ?? 0,
      marketKeyCounts,
      segmentedRowsRejected: buildRejections.segmented,
      nonScorerMarketRowsRejected: buildRejections.nonScorerMarket,
      malformedRowsRejected: buildRejections.malformed,
      bovadaDuplicateRowsCollapsed: bovadaDuplicatesCollapsed,
      allBookmakerCounts,
      approvedBookmakerRowCounts: approvedBookmakerCounts,
      approvedBooksWithZeroRows: zeroRowApprovedBooks,
      playersWithNoApprovedSportsbookQuote: noApprovedBookRejections.length,
      unresolvedIdentityCount: unresolvedIdentity.length,
      unresolvedIdentity,
      playersWithCanonicalQuote: Object.keys(canonical).length,
    },
  };

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
  console.log(`  Archive: ${newArchiveRecords.length} new observation(s) appended (${archiveObservations.length} canonical quotes this run, ${existingArchive.length} prior records).`);

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Wrote ${OUTPUT}`);
  console.log(`  Canonical anytime-TD quotes: ${Object.keys(canonical).length}`);
  console.log(`  Approved books observed: ${[...observedApprovedBooks].sort().join(", ") || "(none)"}`);
  if (zeroRowApprovedBooks.length > 0) console.log(`  Approved books with zero rows this run: ${zeroRowApprovedBooks.join(", ")}`);
  console.log(`  Bovada duplicate rows collapsed: ${bovadaDuplicatesCollapsed}`);
  console.log(`  Unresolved identities: ${unresolvedIdentity.length}`);
  console.log(`  Sample selected price: ${Object.values(canonical)[0] ? `${Object.values(canonical)[0].playerName} ${formatAmerican(Object.values(canonical)[0].anytimeTdOdds)} (${Object.values(canonical)[0].anytimeTdBook})` : "(none)"}`);
}

main().catch((err) => {
  console.error("Unexpected error (non-fatal):", err?.message ?? err);
  process.exit(0);
});
