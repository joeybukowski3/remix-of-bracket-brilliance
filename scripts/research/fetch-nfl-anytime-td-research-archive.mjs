/**
 * RESEARCH ONLY — prospective anytime-TD market archive for the TD Score
 * calibration study.
 *
 * The calibration study cannot compare JKB to the sportsbook because archived
 * anytime-TD odds only begin 2026-09-09. This script accumulates a forward
 * research archive so a market baseline (baseline D) can be run later in 2026.
 *
 * It is strictly ADDITIVE:
 *   - reads the SAME ParlayAPI response the production fetch already pulls
 *     (`markets=player_anytime_td`, which returns all three market-key families)
 *   - reuses the UNMODIFIED production selection lib for the approved-book best
 *     price (identical to `nfl-anytime-td-market.json`)
 *   - additionally captures the Novig two-sided `player_anytime_td` exchange
 *     market (line 0.5), which production selection deliberately drops
 *   - joins the current-week JKB TD Score from `touchdown-preview.json`
 *   - appends one row per (playerId, gameId, observedAt) to
 *     `data/nfl/props/market-archive/nfl-anytime-td-research-archive.jsonl`
 *
 * It NEVER writes `public/data/nfl/nfl-anytime-td-market.json`, never touches
 * the production archive, never changes production selection or the UI.
 * Any missing key / fetch failure / malformed payload exits 0 without writing.
 *
 * Usage:
 *   node scripts/research/fetch-nfl-anytime-td-research-archive.mjs [--dry-run]
 * Intended cadence: alongside the production anytime-TD refresh (hourly on
 * game days through the 2026 season).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  ANYTIME_TD_EXCHANGE_MARKET_KEY,
  ANYTIME_TD_MARKET,
  ANYTIME_TD_PLAUSIBLE_POSITIONS,
  APPROVED_SPORTSBOOKS,
  buildAnytimeTdQuotes,
  computeMarketImpliedProbability,
  dedupeBovadaAliasQuotes,
  selectAnytimeTdBestPrices,
} from "../lib/nfl-anytime-td-selection.mjs";
import { buildGameIndex, buildRosterNameIndex, resolvePlayerIdentity } from "../lib/nfl-roster-identity.mjs";
import { parseCsv } from "../lib/nfl-schedules-results-core.mjs";
import { resolveCurrentWeek } from "../lib/nfl-market-coverage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const ARCHIVE = path.join(ROOT, "data/nfl/props/market-archive/nfl-anytime-td-research-archive.jsonl");
const GAMES_SOURCE = path.join(ROOT, "public/data/nfl/2026/games.json");
const DEPTH_CHART_DIR = path.join(ROOT, "data/nfl/nflverse/depth-charts");
const DEPTH_CHART_SEASON = 2026;
const TD_PREVIEW_SEASON = 2026;

const PARLAY_BASE = "https://parlay-api.com/v1";
const NFL_SPORT_KEY = "americanfootball_nfl";
const REQUEST_MARKETS = "player_anytime_td";
const TIMEOUT_MS = 20000;
const HEADERS = { Accept: "application/json", "User-Agent": "JoeKnowsBall/1.0" };
const DRY_RUN = process.argv.includes("--dry-run");

const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

async function fetchJson(url, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { ...HEADERS, ...extraHeaders }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
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
  if (!fileEntry) throw new Error(`no depth-chart cache entry for ${DEPTH_CHART_SEASON}`);
  const rows = parseCsv(readFileSync(path.join(DEPTH_CHART_DIR, fileEntry.filename), "utf8"));
  const MAP = { Quarterback: "QB", "Running Back": "RB", "Wide Receiver": "WR", "Tight End": "TE" };
  const entries = [];
  for (const row of rows) {
    const position = MAP[String(row.pos_name ?? "").trim()];
    const team = String(row.team ?? "").trim().toLowerCase();
    const gsis = String(row.gsis_id ?? "").trim();
    if (position && team && gsis) entries.push({ team, position, playerId: `gsis:${gsis}`, playerName: String(row.player_name ?? "").trim() });
  }
  return entries;
}

function loadJkbTdScores() {
  const file = path.join(ROOT, "public", "data", "nfl", String(TD_PREVIEW_SEASON), "touchdown-preview.json");
  if (!existsSync(file)) return { byId: new Map(), week: null };
  const artifact = JSON.parse(readFileSync(file, "utf8"));
  const byId = new Map();
  for (const p of artifact.players ?? []) {
    const w = p.windows?.[artifact.defaultWindow] ?? p.windows?.["2026"] ?? null;
    byId.set(p.playerId, { jkbTdScore: w?.jkbTdScore ?? null, gameId: p.gameId });
  }
  return { byId, week: artifact.week ?? null };
}

async function fetchParlayRows(key) {
  const url = `${PARLAY_BASE}/sports/${NFL_SPORT_KEY}/props?markets=${REQUEST_MARKETS}&limit=10000`;
  const data = await fetchJson(url, { "X-API-Key": key });
  return Array.isArray(data) ? data : Array.isArray(data?.props) ? data.props : Array.isArray(data?.results) ? data.results : [];
}

/**
 * Novig two-sided anytime-TD (line == 0.5). The production selection lib
 * intentionally ignores `player_anytime_td`; we scan the raw rows for it.
 * Field names are captured defensively (the exchange payload is less
 * characterised than the approved-book one).
 */
function extractNovigTwoSided(rawRows) {
  const out = [];
  for (const row of rawRows) {
    const marketKey = String(row?.market_key ?? "").trim().toLowerCase();
    if (marketKey !== ANYTIME_TD_EXCHANGE_MARKET_KEY) continue;
    const line = num(row?.line ?? row?.point ?? row?.handicap);
    if (line != null && Math.abs(line - 0.5) > 1e-6) continue; // 0.5 = anytime; 1.5 = 2+, etc.
    const overPrice = num(row?.over_price ?? row?.over ?? row?.price_over);
    const underPrice = num(row?.under_price ?? row?.under ?? row?.price_under);
    if (overPrice == null && underPrice == null) continue;
    out.push({
      bookmaker: String(row?.bookmaker ?? "").trim().toLowerCase() || "novig",
      player: row?.player ?? null,
      homeTeam: row?.home_team ?? null,
      awayTeam: row?.away_team ?? null,
      line,
      overPrice,
      underPrice,
      lastUpdate: row?.last_update ?? row?.updated_at ?? null,
    });
  }
  return out;
}

function impliedFromAmerican(odds) {
  if (odds == null || !Number.isFinite(odds)) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

async function main() {
  const key = process.env.PARLAYAPI;
  if (!key) {
    console.error("[td-research-archive] no PARLAYAPI key — exiting 0 without writing");
    process.exit(0);
  }

  let rawRows;
  try {
    rawRows = await fetchParlayRows(key);
  } catch (err) {
    console.error(`[td-research-archive] fetch failed (${err.message}) — exiting 0 without writing`);
    process.exit(0);
  }
  console.log(`[td-research-archive] ParlayAPI rows=${rawRows.length}`);

  const games = loadGames();
  const gameIndex = buildGameIndex(games);
  const rosterIndex = buildRosterNameIndex(loadDepthChartEntries());
  const marketPlausiblePositions = { [ANYTIME_TD_MARKET]: ANYTIME_TD_PLAUSIBLE_POSITIONS };
  const currentWeek = resolveCurrentWeek(games);
  const { byId: jkbById, week: previewWeek } = loadJkbTdScores();
  const observedAt = new Date().toISOString();

  // ---- approved-book best price (identical logic to production) ----
  const { quotes } = buildAnytimeTdQuotes(rawRows);
  const { quotes: deduped } = dedupeBovadaAliasQuotes(quotes);
  const { selections } = selectAnytimeTdBestPrices(deduped, { approvedBookRanking: APPROVED_SPORTSBOOKS });

  // ---- Novig two-sided ----
  const novig = extractNovigTwoSided(rawRows);
  const novigByPlayerKey = new Map();
  for (const q of novig) {
    const norm = String(q.player ?? "").toLowerCase().replace(/[^a-z]/g, "");
    novigByPlayerKey.set(norm, q);
  }

  const records = [];
  let unresolved = 0;
  for (const sel of selections) {
    const res = resolvePlayerIdentity(
      {
        providerName: sel.decoratedName ?? sel.player,
        homeTeamFullName: sel.homeTeam,
        awayTeamFullName: sel.awayTeam,
        canonicalMarket: ANYTIME_TD_MARKET,
        targetWeek: currentWeek,
      },
      { rosterIndex, gameIndex, marketPlausiblePositions },
    );
    if (!res?.resolved) {
      unresolved += 1;
      continue;
    }
    const identity = res.identity;

    const rawImplied = computeMarketImpliedProbability(sel.overPrice);
    const normName = String(sel.player ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const nv = novigByPlayerKey.get(normName) ?? null;
    const nvOverImplied = nv ? impliedFromAmerican(nv.overPrice) : null;
    const nvUnderImplied = nv ? impliedFromAmerican(nv.underPrice) : null;
    const noVigOverProbability =
      nvOverImplied != null && nvUnderImplied != null && nvOverImplied + nvUnderImplied > 0
        ? Number((nvOverImplied / (nvOverImplied + nvUnderImplied)).toFixed(5))
        : null;

    const jkb = jkbById.get(identity.playerId) ?? null;

    records.push({
      observedAt,
      season: 2026,
      week: identity.week ?? previewWeek ?? currentWeek ?? null,
      playerId: identity.playerId,
      playerName: identity.playerName ?? sel.decoratedName ?? null,
      position: identity.position ?? null,
      team: identity.team ?? null,
      opponent: identity.opponent ?? null,
      gameId: identity.gameId,
      kickoff: identity.kickoff ?? null,
      bestApprovedBook: sel.bookmaker ?? null,
      bestApprovedAnytimeTdOdds: sel.overPrice ?? null,
      marketImpliedProbabilityRaw: rawImplied,
      novigLine: nv?.line ?? null,
      novigOverPrice: nv?.overPrice ?? null,
      novigUnderPrice: nv?.underPrice ?? null,
      novigOverImplied: nvOverImplied == null ? null : Number(nvOverImplied.toFixed(5)),
      novigUnderImplied: nvUnderImplied == null ? null : Number(nvUnderImplied.toFixed(5)),
      noVigOverProbability,
      jkbTdScore: jkb?.jkbTdScore ?? null,
      calibratedProbability: null, // placeholder — filled by a later calibrated-probability job
    });
  }

  console.log(
    `[td-research-archive] built ${records.length} records ` +
      `(approved-book selections=${selections.length}, unresolved=${unresolved}, novig two-sided rows=${novig.length}, ` +
      `with novig=${records.filter((r) => r.noVigOverProbability != null).length}, ` +
      `with jkbScore=${records.filter((r) => r.jkbTdScore != null).length})`,
  );

  if (DRY_RUN) {
    console.log("[td-research-archive] --dry-run: sample record:");
    console.log(JSON.stringify(records[0] ?? null, null, 2));
    return;
  }
  if (!records.length) {
    console.error("[td-research-archive] 0 records — nothing appended");
    return;
  }
  mkdirSync(path.dirname(ARCHIVE), { recursive: true });
  appendFileSync(ARCHIVE, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`[td-research-archive] appended ${records.length} rows -> ${path.relative(ROOT, ARCHIVE)}`);
}

main().catch((err) => {
  console.error(`[td-research-archive] FAILED: ${err.message} — no partial write`);
  process.exit(0);
});
