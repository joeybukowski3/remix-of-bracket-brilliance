/**
 * generate-mlb-ml-picks.mjs
 *
 * Generates today's Moneyline Edge picks server-side, using the faithful
 * JS port of computeModelEdge (mlb-ml-edge-core.mjs) and a Node port of
 * the client-side data-fetching (mlb-ml-detail-fetch.mjs). This is
 * infrastructure for the prediction archive ONLY -- it does not feed the
 * live website. The live website continues to compute picks in the
 * browser via mlbModelEdge.ts, exactly as before Phase 1.
 *
 * Output mirrors the role of hr-props-raw.json for the HR pipeline:
 * public/data/mlb/ml-picks-raw.json, read by build-mlb-ml-archive.mjs.
 *
 * Usage:
 *   node scripts/generate-mlb-ml-picks.mjs
 *   node scripts/generate-mlb-ml-picks.mjs --dry-run
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { computeModelEdgeCore } from "./lib/mlb-ml-edge-core.mjs";
import { fetchMlGameDetail } from "./lib/mlb-ml-detail-fetch.mjs";
import { MLB_ML_MODEL_VERSION } from "./lib/mlb-ml-model-version.mjs";
import { getPhase2Flags } from "./lib/mlb-phase2-flags.mjs";
import { computeMlPhase2Shadow } from "./lib/mlb-ml-phase2-shadow.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const OUTPUT_PATH = path.join(DATA_DIR, "ml-picks-raw.json");
const MLB_ODDS_PATH = path.join(DATA_DIR, "mlb-odds.json");
const BULLPEN_CACHE_PATH = path.join(DATA_DIR, "team-bullpen-stats.json");
const POLYMARKET_DIR = path.join(ROOT, "public", "data", "polymarket");
const DRY_RUN = process.argv.includes("--dry-run");

/** Which Phase 2 flags are relevant to the Moneyline shadow -- if none are enabled, phase2Shadow is never computed (and the field is omitted entirely, not written as null). */
const RELEVANT_ML_SHADOW_FLAGS = ["ENABLE_ML_PROJECTED_IP_SHADOW", "ENABLE_ML_PARK_SHADOW", "ENABLE_ML_BULLPEN_SHADOW"];

function anyMlShadowFlagEnabled(flags) {
  return RELEVANT_ML_SHADOW_FLAGS.some((name) => flags?.[name] === true);
}

/**
 * Pure wiring helper (exported for deterministic unit testing without a
 * live slate): resolves each team's bullpen cache entry by id and calls
 * the Phase 2 Moneyline shadow composition layer. Returns undefined
 * (never null) when no relevant flag is enabled, so callers can omit the
 * field entirely with `...(phase2Shadow !== undefined ? { phase2Shadow } : {})`.
 * Throws on unexpected failure -- the caller is responsible for catching
 * this per-game so a shadow failure never blocks the live pick.
 *
 * @param {object} params
 * @param {object} params.detail  Same detail passed to computeModelEdgeCore.
 * @param {{ away: {id:number}, home: {id:number}, venue?: string|null }} params.game
 * @param {object} params.bullpenCache  Loaded team-bullpen-stats.json (or the safe empty fallback).
 * @param {object} params.flags  getPhase2Flags() result.
 */
export function buildMlPhase2Shadow({ detail, game, bullpenCache, flags }) {
  if (!anyMlShadowFlagEnabled(flags)) return undefined;
  const bullpen = {
    away: bullpenCache?.teams?.[String(game.away.id)] ?? null,
    home: bullpenCache?.teams?.[String(game.home.id)] ?? null,
  };
  return computeMlPhase2Shadow(detail, { venue: game.venue ?? null, bullpen, flags });
}

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/html, */*",
};

function getTodayEt() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Request failed ${res.status} for ${url}`);
  return res.json();
}

function formatLeagueRecord(record) {
  if (!record?.wins && !record?.losses && record?.wins !== 0 && record?.losses !== 0) return "—";
  return `${record.wins}-${record.losses}`;
}

/** Mirrors normalizeGame/loadSchedule in MlbGameDetail.tsx. */
async function loadSchedule() {
  const date = getTodayEt();
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,linescore,probablePitcher`;
  const json = await fetchJson(url);
  const games = json?.dates?.[0]?.games ?? [];
  return games.map((game) => ({
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    // Phase 2 addition -- already present in the raw schedule response,
    // just not previously passed through. Used ONLY by the Phase 2.2
    // Moneyline park-context shadow (mlb-ml-park-shadow.mjs). Live pick
    // computation (computeModelEdgeCore) does not read this field.
    venue: game.venue?.name ?? "Unknown Venue",
    away: {
      id: game?.teams?.away?.team?.id ?? null,
      abbreviation: game?.teams?.away?.team?.abbreviation ?? "AWY",
      record: formatLeagueRecord(game?.teams?.away?.leagueRecord),
      probablePitcher: game?.teams?.away?.probablePitcher ?? null,
    },
    home: {
      id: game?.teams?.home?.team?.id ?? null,
      abbreviation: game?.teams?.home?.team?.abbreviation ?? "HME",
      record: formatLeagueRecord(game?.teams?.home?.leagueRecord),
      probablePitcher: game?.teams?.home?.probablePitcher ?? null,
    },
  }));
}

function loadJsonSafe(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[ml-picks] Failed to parse ${filePath}: ${err.message}. Using fallback.`);
    return fallback;
  }
}

/** Sportsbook price at generation time -- see mlb-odds.json (already fetched by fetch-mlb-odds.mjs earlier in the same workflow run). */
function getSportsbookPriceAtPick(mlbOdds, gameKey, pickIsAway) {
  const ml = mlbOdds?.moneylines?.[gameKey];
  if (!ml) return null;
  const side = pickIsAway ? ml.away : ml.home;
  if (!side) return null;
  return {
    american: side.american ?? null,
    implied: side.implied ?? null,
    capturedAt: mlbOdds.generatedAt ?? mlbOdds.fetchedAt ?? new Date().toISOString(),
  };
}

/**
 * Polymarket price at generation time -- see today's snapshot file (already
 * fetched by fetch-polymarket-snapshots.mjs).
 *
 * NOTE: Polymarket's own `gameId` field is a different ID namespace than
 * MLB StatsAPI's gamePk -- they do not match directly (confirmed against
 * live data during Phase 1 development). Match by team abbreviations
 * instead, same as the matching approach in
 * src/lib/mlb/polymarketMoneylines.ts (matchEventToGame).
 */
function getPolymarketPriceAtPick(pmSnapshot, awayAbbr, homeAbbr, pickIsAway) {
  if (!pmSnapshot?.games) return null;
  const game = pmSnapshot.games.find((g) => g.awayAbbr === awayAbbr && g.homeAbbr === homeAbbr);
  if (!game) return null;
  const price = pickIsAway ? game.openPrice?.away : game.openPrice?.home;
  if (price == null) return null;
  return { yesPrice: price, capturedAt: game.openTime ?? pmSnapshot.updatedAt ?? new Date().toISOString() };
}

async function main() {
  const date = getTodayEt();
  const generatedAt = new Date().toISOString();

  const schedule = await loadSchedule();
  if (!schedule.length) {
    console.warn("[ml-picks] No games on today's schedule. Nothing to generate.");
    return;
  }

  const mlbOdds = loadJsonSafe(MLB_ODDS_PATH, null);
  const pmSnapshot = loadJsonSafe(path.join(POLYMARKET_DIR, `snapshots-${date}.json`), null);

  // Loaded ONCE per run (not per game) -- Phase 2 shadow inputs only.
  // Missing/malformed cache safely falls back to an empty structure; the
  // shadow calculators themselves treat missing per-team entries as
  // "unavailable" and fail neutral (see mlb-ml-bullpen-shadow.mjs).
  const phase2Flags = getPhase2Flags();
  const bullpenCache = loadJsonSafe(BULLPEN_CACHE_PATH, { teams: {} });

  const picks = [];
  let errorCount = 0;

  for (const game of schedule) {
    if (!game.away.probablePitcher?.id || !game.home.probablePitcher?.id) {
      console.warn(`[ml-picks] Skipping ${game.away.abbreviation}@${game.home.abbreviation}: no confirmed probable pitcher(s) yet.`);
      continue;
    }
    try {
      const detail = await fetchMlGameDetail(game);
      const edge = computeModelEdgeCore(detail);
      if (edge.pick === "push") {
        console.log(`[ml-picks] ${game.away.abbreviation}@${game.home.abbreviation}: push, not archived.`);
        continue;
      }

      const gameKey = `${game.away.abbreviation}@${game.home.abbreviation}`;
      const pickIsAway = edge.pick === "away";

      // Phase 2 shadow: isolated in its own try/catch so a shadow failure
      // never blocks the live pick above -- on failure, phase2Shadow stays
      // undefined and the field is omitted entirely from this record.
      let phase2Shadow;
      try {
        phase2Shadow = buildMlPhase2Shadow({ detail, game, bullpenCache, flags: phase2Flags });
      } catch (shadowErr) {
        console.warn(`[ml-picks] phase2Shadow failed for ${gameKey}: ${shadowErr instanceof Error ? shadowErr.message : shadowErr}`);
        phase2Shadow = undefined;
      }

      picks.push({
        gameId: game.gamePk,
        gameKey,
        pick: edge.pick,
        pickAbbr: pickIsAway ? game.away.abbreviation : game.home.abbreviation,
        confidence: edge.confidence,
        differential: edge.differential,
        factors: edge.factors,
        topFactor: edge.topFactor,
        priceAtPick: getSportsbookPriceAtPick(mlbOdds, gameKey, pickIsAway),
        polymarketAtPick: getPolymarketPriceAtPick(pmSnapshot, game.away.abbreviation, game.home.abbreviation, pickIsAway),
        ...(phase2Shadow !== undefined ? { phase2Shadow } : {}),
      });
    } catch (err) {
      console.warn(`[ml-picks] Failed to compute edge for ${game.away.abbreviation}@${game.home.abbreviation}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`[ml-picks] date=${date} games=${schedule.length} picks=${picks.length} errors=${errorCount}`);

  const output = {
    date,
    generatedAt,
    modelVersion: MLB_ML_MODEL_VERSION,
    picks,
  };

  if (DRY_RUN) {
    console.log("[ml-picks] --dry-run set, not writing.");
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (picks.length === 0) {
    console.warn("[ml-picks] No picks generated. Existing file (if any) is preserved.");
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`[ml-picks] Wrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[ml-picks] Fatal: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}

export { main as generateMlPicksMain };
