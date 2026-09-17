/**
 * NFL yardage ALT-market layer (secondary/fallback source: Kalshi).
 *
 * Deliberately separate from fetch-nfl-yardage-market.mjs (the canonical
 * ParlayAPI sportsbook layer). This script NEVER reads or writes
 * nfl-yardage-market.json -- it produces an independent artifact
 * (nfl-yardage-alt-market.json) that the UI join layer consults ONLY when
 * the sportsbook layer has no line for a player. Source priority is
 * enforced downstream: sportsbook -> kalshi -> unavailable.
 *
 * Kalshi's public market-data REST API needs no key. Player yardage
 * contracts are one-sided "N+" threshold ladders; this script resolves each
 * ladder's player to a real roster gsis id via the shared strict-identity
 * engine, then derives ONE market-implied reference line per player by
 * price-interpolating the YES=0.50 point (see nfl-kalshi-yardage.mjs). The
 * raw ladder and every real contract price are preserved in the artifact.
 *
 * Fail-safe: any fetch failure, empty result, or malformed payload exits 0
 * without touching the last-known-good artifact or archive. A failure here
 * can never affect the sportsbook refresh -- they are separate processes.
 *
 * Polymarket was investigated as a third source and deliberately NOT
 * integrated: its currently listed NFL yardage contracts are season-long
 * ("3,200+ passing yards in the 2026-27 regular season"), which are not
 * equivalent to the single-game passing/rushing/receiving yardage props
 * this page shows. The normalized model keeps a `source` discriminator so
 * another source could be added later without a rewrite.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  KALSHI_YARDAGE_SERIES,
  KALSHI_SERIES_TO_MARKET,
  buildKalshiLadderRecord,
  parseKalshiMarketContext,
  resolveKalshiTeamAbbr,
} from "./lib/nfl-kalshi-yardage.mjs";
import { MARKET_PLAUSIBLE_POSITIONS, CANONICAL_MARKETS } from "./lib/nfl-prop-line-selection.mjs";
import { buildRosterNameIndex, normalizeRosterTeamAbbr } from "./lib/nfl-roster-identity.mjs";
import { normalizeNflPropName } from "./lib/nfl-prop-name-normalizer.mjs";
import { loadLastObservations, parseArchiveJsonl, selectNewArchiveObservations, toArchiveJsonlLines } from "./lib/nfl-market-archive.mjs";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { resolveCurrentWeek } from "./lib/nfl-market-coverage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "public/data/nfl/nfl-yardage-alt-market.json");
const ARCHIVE_OUTPUT = path.join(ROOT, "data/nfl/props/market-archive/nfl-yardage-alt-market-archive.jsonl");
const GAMES_SOURCE = path.join(ROOT, "public/data/nfl/2026/games.json");
const DEPTH_CHART_DIR = path.join(ROOT, "data/nfl/nflverse/depth-charts");
const DEPTH_CHART_SEASON = 2026;

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const TIMEOUT_MS = 20000;
const HEADERS = { Accept: "application/json", "User-Agent": "JoeKnowsBall/1.0" };

async function fetchJson(url, { label = url } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch (_) {}
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 200)} [${label}]`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** All open markets for one Kalshi series, following the cursor. */
async function fetchSeriesMarkets(seriesTicker) {
  const rows = [];
  let cursor = "";
  for (let page = 0; page < 40; page += 1) {
    const url = `${KALSHI_BASE}/markets?series_ticker=${seriesTicker}&status=open&limit=1000${cursor ? `&cursor=${cursor}` : ""}`;
    const data = await fetchJson(url, { label: `kalshi:${seriesTicker}:p${page}` });
    const batch = Array.isArray(data?.markets) ? data.markets : [];
    rows.push(...batch);
    cursor = data?.cursor ?? "";
    if (!cursor || batch.length === 0) break;
  }
  return rows;
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

/** Group raw Kalshi markets by (event_ticker, player display name). */
function groupByPlayer(rawRows) {
  const groups = new Map();
  for (const row of rawRows) {
    const sub = String(row.yes_sub_title ?? row.title ?? "");
    const playerName = sub.includes(":") ? sub.split(":")[0].trim() : "";
    if (!playerName) continue;
    const key = `${row.event_ticker}|${normalizeNflPropName(playerName)}`;
    const bucket = groups.get(key) ?? { playerName, rawRows: [] };
    bucket.rawRows.push(row);
    groups.set(key, bucket);
  }
  return groups;
}

/**
 * Resolve a Kalshi player group to a real roster identity + scheduled game.
 * Strict: needs both team names to resolve to abbreviations, a single
 * scheduled game for that pair (date-disambiguated), and exactly one
 * roster player of a plausible position on one of the two teams.
 */
function resolveKalshiIdentity({ playerName, rawRows }, { games, rosterIndex, canonicalMarket, currentWeek }) {
  const context = parseKalshiMarketContext(rawRows[0]);
  if (!context.teamAName || !context.teamBName) return { resolved: false, reason: "unparsable_matchup" };

  const abbrA = resolveKalshiTeamAbbr(context.teamAName, games);
  const abbrB = resolveKalshiTeamAbbr(context.teamBName, games);
  if (!abbrA || !abbrB || abbrA === abbrB) return { resolved: false, reason: "unresolved_teams" };

  const pairGames = games.filter(
    (g) => {
      const h = String(g.homeAbbr ?? "").toLowerCase();
      const a = String(g.awayAbbr ?? "").toLowerCase();
      return (h === abbrA && a === abbrB) || (h === abbrB && a === abbrA);
    },
  );
  if (pairGames.length === 0) return { resolved: false, reason: "game_not_in_schedule" };

  let game = pairGames[0];
  if (pairGames.length > 1) {
    const dateMatch = context.kickoffDate
      ? pairGames.filter((g) => String(g.dateUtc ?? "").slice(0, 10) === context.kickoffDate)
      : [];
    const weekMatch = pairGames.filter((g) => g.week === currentWeek);
    if (dateMatch.length === 1) game = dateMatch[0];
    else if (weekMatch.length === 1) game = weekMatch[0];
    else return { resolved: false, reason: "ambiguous_repeated_matchup" };
  }

  const homeAbbr = String(game.homeAbbr ?? "").toLowerCase();
  const awayAbbr = String(game.awayAbbr ?? "").toLowerCase();

  const nameCandidates = rosterIndex.get(normalizeNflPropName(playerName)) ?? [];
  const inGame = nameCandidates.filter((c) => c.team === homeAbbr || c.team === awayAbbr);
  if (inGame.length === 0) return { resolved: false, reason: "no_roster_match_in_game" };

  const plausible = MARKET_PLAUSIBLE_POSITIONS[canonicalMarket] ?? [];
  const byPosition = inGame.filter((c) => plausible.includes(c.position));
  if (byPosition.length === 0) return { resolved: false, reason: "position_mismatch" };
  if (byPosition.length > 1) return { resolved: false, reason: "ambiguous_multiple_roster_matches" };

  const candidate = byPosition[0];
  return {
    resolved: true,
    identity: {
      playerId: candidate.playerId,
      playerName: candidate.playerName,
      position: candidate.position,
      team: normalizeRosterTeamAbbr(candidate.team),
      opponent: candidate.team === homeAbbr ? awayAbbr : homeAbbr,
      gameId: game.gameId,
      week: game.week,
    },
  };
}

async function main() {
  console.log("Fetching NFL yardage ALT markets (Kalshi)...");
  const now = new Date();

  const games = loadGames();
  const depthChartEntries = loadDepthChartEntries();
  const rosterIndex = buildRosterNameIndex(depthChartEntries);
  const currentWeek = resolveCurrentWeek(games);

  const canonical = {};
  for (const market of CANONICAL_MARKETS) canonical[market] = {};

  const diagnostics = {
    bySeries: {},
    matched: 0,
    unmatchedIdentity: [],
    ladderRejected: [],
    referenceLineModes: { interpolated: 0, exact_rung: 0, nearest_rung: 0 },
  };
  const archiveObservations = [];
  let anyFetchSucceeded = false;

  for (const [canonicalMarket, seriesTicker] of Object.entries(KALSHI_YARDAGE_SERIES)) {
    let rawRows = [];
    try {
      rawRows = await fetchSeriesMarkets(seriesTicker);
      anyFetchSucceeded = true;
    } catch (err) {
      console.error(`  ${seriesTicker}: fetch failed (non-fatal) -- ${err.message}`);
      diagnostics.bySeries[seriesTicker] = { error: err.message };
      continue;
    }
    console.log(`  ${seriesTicker} (${canonicalMarket}): ${rawRows.length} open markets`);

    const groups = groupByPlayer(rawRows);
    let seriesMatched = 0;
    for (const group of groups.values()) {
      const identityResult = resolveKalshiIdentity(group, { games, rosterIndex, canonicalMarket, currentWeek });
      if (!identityResult.resolved) {
        diagnostics.unmatchedIdentity.push({ market: canonicalMarket, player: group.playerName, reason: identityResult.reason });
        continue;
      }
      const built = buildKalshiLadderRecord({
        canonicalMarket,
        identity: identityResult.identity,
        rawRows: group.rawRows,
        now,
      });
      if (!built.ok) {
        diagnostics.ladderRejected.push({ market: canonicalMarket, player: group.playerName, reason: built.reason });
        continue;
      }

      // Only surface markets for the week the review page is showing.
      if (built.record.week !== currentWeek) {
        diagnostics.ladderRejected.push({ market: canonicalMarket, player: group.playerName, reason: `off_target_week_${built.record.week}` });
        continue;
      }

      canonical[canonicalMarket][built.record.playerId] = built.record;
      diagnostics.referenceLineModes[built.record.referenceLineMode] += 1;
      seriesMatched += 1;
      diagnostics.matched += 1;

      archiveObservations.push({
        observedAt: now.toISOString(),
        canonicalMarket,
        playerId: built.record.playerId,
        playerName: built.record.playerName,
        team: built.record.team,
        opponent: built.record.opponent,
        gameId: built.record.gameId,
        week: built.record.week,
        bookmaker: "kalshi",
        point: built.record.referenceLine,
        overPrice: null,
        underPrice: null,
      });
    }
    diagnostics.bySeries[seriesTicker] = { openMarkets: rawRows.length, playerGroups: groups.size, matched: seriesMatched };
  }

  if (!anyFetchSucceeded) {
    console.error("All Kalshi series fetches failed -- leaving last-known-good artifact untouched. Exiting 0 (non-fatal).");
    process.exit(0);
  }

  const output = {
    generatedAt: now.toISOString(),
    schemaVersion: "nfl-yardage-alt-market-v1",
    sport: "americanfootball_nfl",
    /** Ordered lowest-to-highest priority AFTER the sportsbook layer. */
    sources: ["kalshi"],
    provider: { kalshi: { base: KALSHI_BASE, series: KALSHI_YARDAGE_SERIES } },
    currentWeek,
    canonical,
    diagnostics: {
      matched: diagnostics.matched,
      unmatchedIdentityCount: diagnostics.unmatchedIdentity.length,
      ladderRejectedCount: diagnostics.ladderRejected.length,
      referenceLineModes: diagnostics.referenceLineModes,
      bySeries: diagnostics.bySeries,
      unmatchedIdentity: diagnostics.unmatchedIdentity.slice(0, 200),
      ladderRejected: diagnostics.ladderRejected.slice(0, 200),
    },
  };

  mkdirSync(path.dirname(ARCHIVE_OUTPUT), { recursive: true });
  let existingArchive = [];
  if (existsSync(ARCHIVE_OUTPUT)) existingArchive = parseArchiveJsonl(readFileSync(ARCHIVE_OUTPUT, "utf8"));
  const lastByKey = loadLastObservations(existingArchive);
  const newArchiveRecords = selectNewArchiveObservations(archiveObservations, lastByKey);
  if (newArchiveRecords.length > 0) appendFileSync(ARCHIVE_OUTPUT, `${toArchiveJsonlLines(newArchiveRecords)}\n`, "utf8");
  console.log(`  Archive: ${newArchiveRecords.length} new observation(s) appended (${archiveObservations.length} records this run).`);

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Wrote ${OUTPUT}`);
  for (const market of CANONICAL_MARKETS) {
    console.log(`  ${market}: ${Object.keys(canonical[market]).length} Kalshi reference lines`);
  }
  console.log(
    `  reference-line modes: interpolated=${diagnostics.referenceLineModes.interpolated} ` +
      `exact=${diagnostics.referenceLineModes.exact_rung} nearest=${diagnostics.referenceLineModes.nearest_rung}`,
  );
  console.log(`  unmatched identity=${diagnostics.unmatchedIdentity.length}, ladder rejected=${diagnostics.ladderRejected.length}`);
}

main().catch((err) => {
  console.error("Unexpected error (non-fatal):", err?.message ?? err);
  process.exit(0);
});
