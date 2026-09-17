/**
 * RESEARCH ONLY — prospective 2026 JKB TD Score forward-validation snapshot.
 *
 * Records one append-only pregame snapshot per (playerId, gameId, observedAt)
 * to `data/nfl/research/td-calibration/forward-archive/nfl-td-forward-archive-2026.jsonl`.
 *
 * It is strictly ADDITIVE and never:
 *   - modifies production TD Score math or the touchdown-preview artifact
 *   - exposes JKB TD Probability / Fair Odds / TD Edge anywhere
 *   - alters the production sportsbook selection path or any UI
 *   - overwrites or rewrites a prior observation
 *
 * For each player in the current `touchdown-preview.json` it captures:
 *   - production-window AND trailing8 JKB TD Score (windows.<defaultWindow> / windows.last8)
 *   - the RESEARCH candidate calibrated probability for both windows, derived
 *     from the committed `candidate-model.json` (never hardcoded), with the
 *     teamChanged adjustment applied exactly as recorded when teamChanged is known
 *   - best approved-book Anytime TD price (identical logic to production selection)
 *   - the Novig two-sided player_anytime_td line=0.5 market + no-vig P(over)
 *   - teamChanged / earlySeasonFlag flags
 *   - actualTd / gradedAt left null (filled later by the grader)
 *
 * Any missing key / fetch failure / malformed payload exits 0 without writing.
 *
 * Usage: node scripts/research/snapshot-nfl-td-forward-validation.mjs [--dry-run]
 * Cadence: alongside the production anytime-TD refresh on game days.
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
import {
  americanToImplied,
  calibratedTdProbability,
  dedupeAppendOnly,
  deriveTeamChanged,
  earlySeasonFlag,
  noVigOverProbability,
  parseJsonl,
  resolveCandidateCalibrator,
  snapshotKey,
  toJsonl,
} from "./lib/nfl-td-forward-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SEASON = 2026;
const ARCHIVE = path.join(
  ROOT,
  "data/nfl/research/td-calibration/forward-archive",
  `nfl-td-forward-archive-${SEASON}.jsonl`,
);
const CANDIDATE_MODEL = path.join(ROOT, "data/nfl/research/td-calibration/candidate-model.json");
const GAMES_SOURCE = path.join(ROOT, "public/data/nfl", String(SEASON), "games.json");
const DEPTH_CHART_DIR = path.join(ROOT, "data/nfl/nflverse/depth-charts");
const TD_PREVIEW = path.join(ROOT, "public/data/nfl", String(SEASON), "touchdown-preview.json");

const PARLAY_BASE = "https://parlay-api.com/v1";
const NFL_SPORT_KEY = "americanfootball_nfl";
const REQUEST_MARKETS = "player_anytime_td";
const TIMEOUT_MS = 20000;
const HEADERS = { Accept: "application/json", "User-Agent": "JoeKnowsBall/1.0" };
const DRY_RUN = process.argv.includes("--dry-run");

const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v, d = 6) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

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
  const fileEntry = manifest.files.find((f) => f.season === SEASON);
  if (!fileEntry) throw new Error(`no depth-chart cache entry for ${SEASON}`);
  const rows = parseCsv(readFileSync(path.join(DEPTH_CHART_DIR, fileEntry.filename), "utf8"));
  const MAP = { Quarterback: "QB", "Running Back": "RB", "Wide Receiver": "WR", "Tight End": "TE" };
  const entries = [];
  for (const row of rows) {
    const position = MAP[String(row.pos_name ?? "").trim()];
    const team = String(row.team ?? "").trim().toLowerCase();
    const gsis = String(row.gsis_id ?? "").trim();
    if (position && team && gsis) {
      entries.push({ team, position, playerId: `gsis:${gsis}`, playerName: String(row.player_name ?? "").trim() });
    }
  }
  return entries;
}

/** playerId -> { productionScore, trailing8Score, gameId, teamChanged, kickoff, week }. */
function loadPreview() {
  if (!existsSync(TD_PREVIEW)) return { byId: new Map(), week: null };
  const artifact = JSON.parse(readFileSync(TD_PREVIEW, "utf8"));
  const defaultWindow = artifact.defaultWindow ?? String(SEASON - 1);
  const byId = new Map();
  for (const p of artifact.players ?? []) {
    const prodWin = p.windows?.[defaultWindow] ?? null;
    const last8Win = p.windows?.last8 ?? null;
    const priorGames = [...(p.playerGames ?? []), ...(p.playerHistory ?? [])];
    byId.set(p.playerId, {
      productionScore: num(prodWin?.jkbTdScore),
      trailing8Score: num(last8Win?.jkbTdScore),
      productionWindowKey: defaultWindow,
      gameId: p.gameId,
      kickoff: p.kickoff ?? null,
      team: p.team ?? null,
      opponent: p.opponent ?? null,
      position: p.position ?? null,
      playerName: p.playerName ?? null,
      teamChanged: deriveTeamChanged(priorGames, p.team),
    });
  }
  return { byId, week: artifact.week ?? null };
}

async function fetchParlayRows(key) {
  const url = `${PARLAY_BASE}/sports/${NFL_SPORT_KEY}/props?markets=${REQUEST_MARKETS}&limit=10000`;
  const data = await fetchJson(url, { "X-API-Key": key });
  return Array.isArray(data) ? data : Array.isArray(data?.props) ? data.props : Array.isArray(data?.results) ? data.results : [];
}

function extractNovigTwoSided(rawRows) {
  const out = [];
  for (const row of rawRows) {
    const marketKey = String(row?.market_key ?? "").trim().toLowerCase();
    if (marketKey !== ANYTIME_TD_EXCHANGE_MARKET_KEY) continue;
    const line = num(row?.line ?? row?.point ?? row?.handicap);
    if (line != null && Math.abs(line - 0.5) > 1e-6) continue;
    const overPrice = num(row?.over_price ?? row?.over ?? row?.price_over);
    const underPrice = num(row?.under_price ?? row?.under ?? row?.price_under);
    if (overPrice == null && underPrice == null) continue;
    out.push({
      player: row?.player ?? null,
      line,
      overPrice,
      underPrice,
    });
  }
  return out;
}

async function main() {
  const key = process.env.PARLAYAPI;
  if (!key) {
    console.error("[td-forward-snapshot] no PARLAYAPI key — exiting 0 without writing");
    process.exit(0);
  }

  let calibrator;
  try {
    calibrator = resolveCandidateCalibrator(JSON.parse(readFileSync(CANDIDATE_MODEL, "utf8")));
  } catch (err) {
    console.error(`[td-forward-snapshot] candidate model unavailable (${err.message}) — exiting 0 without writing`);
    process.exit(0);
  }

  let rawRows;
  try {
    rawRows = await fetchParlayRows(key);
  } catch (err) {
    console.error(`[td-forward-snapshot] fetch failed (${err.message}) — exiting 0 without writing`);
    process.exit(0);
  }
  console.log(`[td-forward-snapshot] ParlayAPI rows=${rawRows.length}`);

  const games = loadGames();
  const gameIndex = buildGameIndex(games);
  const rosterIndex = buildRosterNameIndex(loadDepthChartEntries());
  const marketPlausiblePositions = { [ANYTIME_TD_MARKET]: ANYTIME_TD_PLAUSIBLE_POSITIONS };
  const currentWeek = resolveCurrentWeek(games);
  const { byId: previewById, week: previewWeek } = loadPreview();
  const observedAt = new Date().toISOString();

  const { quotes } = buildAnytimeTdQuotes(rawRows);
  const { quotes: deduped } = dedupeBovadaAliasQuotes(quotes);
  const { selections } = selectAnytimeTdBestPrices(deduped, { approvedBookRanking: APPROVED_SPORTSBOOKS });

  const novig = extractNovigTwoSided(rawRows);
  const novigByPlayerKey = new Map();
  for (const q of novig) {
    novigByPlayerKey.set(String(q.player ?? "").toLowerCase().replace(/[^a-z]/g, ""), q);
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
    const preview = previewById.get(identity.playerId) ?? null;
    const week = identity.week ?? previewWeek ?? currentWeek ?? null;
    const teamChanged = preview?.teamChanged ?? null;

    const rawMarketImpliedProbability = computeMarketImpliedProbability(sel.overPrice);
    const nv = novigByPlayerKey.get(String(sel.player ?? "").toLowerCase().replace(/[^a-z]/g, "")) ?? null;
    const novigNoVig = nv ? noVigOverProbability(nv.overPrice, nv.underPrice) : null;

    const prodScore = preview?.productionScore ?? null;
    const t8Score = preview?.trailing8Score ?? null;

    records.push({
      schemaVersion: "nfl-td-forward-archive-v1",
      season: SEASON,
      week,
      gameId: identity.gameId,
      kickoff: identity.kickoff ?? preview?.kickoff ?? null,
      playerId: identity.playerId,
      playerName: identity.playerName ?? preview?.playerName ?? sel.decoratedName ?? null,
      position: identity.position ?? preview?.position ?? null,
      team: identity.team ?? preview?.team ?? null,
      opponent: identity.opponent ?? preview?.opponent ?? null,

      jkbTdScoreProductionWindow: prodScore,
      jkbTdScoreProductionWindowKey: preview?.productionWindowKey ?? null,
      jkbTdScoreTrailing8: t8Score,

      candidateCalibratedProbability: round(calibratedTdProbability(calibrator, { jkbTdScore: t8Score, teamChanged })),
      candidateCalibratedProbabilityProductionWindow: round(
        calibratedTdProbability(calibrator, { jkbTdScore: prodScore, teamChanged }),
      ),
      candidateCalibratedProbabilityTrailing8: round(
        calibratedTdProbability(calibrator, { jkbTdScore: t8Score, teamChanged }),
      ),
      candidateCalibrationVersion: calibrator.version,

      teamChanged,
      earlySeasonFlag: earlySeasonFlag(week),

      bestSportsbookOdds: sel.overPrice ?? null,
      bestSportsbookBook: sel.bookmaker ?? null,
      rawMarketImpliedProbability,

      novigLine: nv?.line ?? null,
      novigOverPrice: nv?.overPrice ?? null,
      novigUnderPrice: nv?.underPrice ?? null,
      novigOverImplied: nv ? round(americanToImplied(nv.overPrice), 5) : null,
      novigUnderImplied: nv ? round(americanToImplied(nv.underPrice), 5) : null,
      novigNoVigProbability: round(novigNoVig, 5),

      observedAt,
      actualTd: null,
      gradedAt: null,
    });
  }

  let existing = [];
  try {
    if (existsSync(ARCHIVE)) existing = parseJsonl(readFileSync(ARCHIVE, "utf8"));
  } catch (err) {
    console.error(`[td-forward-snapshot] could not read existing archive (${err.message}) — exiting 0 without writing`);
    process.exit(0);
  }
  const { toAppend, skipped } = dedupeAppendOnly(existing.map(snapshotKey), records, snapshotKey);

  console.log(
    `[td-forward-snapshot] built ${records.length} records ` +
      `(selections=${selections.length}, unresolved=${unresolved}, novig two-sided=${novig.length}, ` +
      `withProdScore=${records.filter((r) => r.jkbTdScoreProductionWindow != null).length}, ` +
      `withT8Score=${records.filter((r) => r.jkbTdScoreTrailing8 != null).length}, ` +
      `withNovig=${records.filter((r) => r.novigNoVigProbability != null).length}, ` +
      `newToAppend=${toAppend.length}, skippedExisting=${skipped})`,
  );

  if (DRY_RUN) {
    console.log("[td-forward-snapshot] --dry-run sample record:");
    console.log(JSON.stringify(toAppend[0] ?? records[0] ?? null, null, 2));
    return;
  }
  if (!toAppend.length) {
    console.error("[td-forward-snapshot] nothing new to append");
    return;
  }
  mkdirSync(path.dirname(ARCHIVE), { recursive: true });
  appendFileSync(ARCHIVE, toJsonl(toAppend) + "\n", "utf8");
  console.log(`[td-forward-snapshot] appended ${toAppend.length} rows -> ${path.relative(ROOT, ARCHIVE)}`);
}

main().catch((err) => {
  console.error(`[td-forward-snapshot] FAILED: ${err.message} — no partial write`);
  process.exit(0);
});
