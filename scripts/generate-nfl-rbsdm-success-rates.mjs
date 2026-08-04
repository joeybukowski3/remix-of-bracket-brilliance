/**
 * Generate public/data/nfl/matchup-success-rates.json — RBSDM-published team
 * success rates for the matchup analyzer (Phase 3A).
 *
 * Independent of the Phase 2 conventional-stat generator. An RBSDM outage can
 * never block `npm run nfl:matchup-metrics`; this artifact is optional
 * enrichment and its absence only leaves the success-rate rows unavailable.
 *
 * Values are RBSDM's published percentages, consumed verbatim. Success is never
 * recomputed at the play level here, and the 2025 and 2026 periods are never
 * blended — RBSDM exposes the finished rate but not the eligible-play
 * denominator, so combining ranges exactly is impossible.
 *
 * Attribution: RBSDM / Ben Baldwin (https://rbsdm.com/stats).
 *
 * Usage:
 *   node scripts/generate-nfl-rbsdm-success-rates.mjs
 *   node scripts/generate-nfl-rbsdm-success-rates.mjs --dry-run
 *   node scripts/generate-nfl-rbsdm-success-rates.mjs --season=2026
 *   node scripts/generate-nfl-rbsdm-success-rates.mjs --offline=<dir>   # fixtures
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompletedGameIndex } from "./lib/nfl-matchup-metrics.mjs";
import {
  LAST5_GAME_COUNT,
  LAST8_GAME_COUNT,
  PERIOD_2025_LAST8,
  PERIOD_2026_LAST5,
  PERIOD_2026_SEASON,
  RBSDM_ATTRIBUTION,
  RBSDM_ENDPOINT,
  RBSDM_FIELD_MAP,
  RBSDM_METRIC_DIRECTION,
  RBSDM_METRIC_KEYS,
  RBSDM_SOURCE_LABEL,
  buildRbsdmPayload,
  buildRbsdmTeamMap,
  completedGameCounts,
  groupTeamsByWeekRange,
  rankPeriodValues,
  seasonToDateRange,
  toPercent,
  validateRbsdmResponse,
} from "./lib/nfl-rbsdm-success.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const OUT_FILE = join(DATA_DIR, "matchup-success-rates.json");
const SCHEMA_VERSION = "nfl-matchup-success-rates-v1";

// Conservative, deliberately unhurried request behaviour against an
// undocumented third-party API.
const REQUEST_SPACING_MS = 4000;
const REQUEST_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 6000;
const USER_AGENT = "JoeKnowsBall-nfl-matchup-analyzer/1.0 (+https://www.joeknowsball.com)";

function parseArgs(argv) {
  const args = { currentSeason: 2026, dryRun: false, offlineDir: null };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.currentSeason = Number(raw.slice(9));
    else if (raw.startsWith("--offline=")) args.offlineDir = resolve(raw.slice(10));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.currentSeason)) throw new Error("Invalid --season");
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

function loadSeason(season) {
  const games = join(DATA_DIR, String(season), "games.json");
  const results = join(DATA_DIR, String(season), "results.json");
  if (!existsSync(games) || !existsSync(results)) return null;
  return { season, games: readJson(games).games ?? [], results: readJson(results).results ?? [] };
}

/** Fixture path for a range, used by --offline so tests/dev need no network. */
function offlineFile(dir, season, weekMin, weekMax) {
  return join(dir, `team-tiers_${season}_w${weekMin}-${weekMax}.json`);
}

/**
 * One RBSDM request with a bounded retry for transient failures only.
 * A 4xx (a bad request on our side) fails immediately rather than retrying.
 */
async function fetchRange(payload, label, { offlineDir }) {
  if (offlineDir) {
    const file = offlineFile(offlineDir, payload.season_min, payload.week_min, payload.week_max);
    if (!existsSync(file)) throw new Error(`${label}: offline fixture missing (${file})`);
    return readJson(file);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(RBSDM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        const transient = response.status >= 500 || response.status === 429;
        const err = new Error(`${label}: HTTP ${response.status}`);
        if (!transient) throw err;
        lastError = err;
      } else {
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`${label}: response was not valid JSON (likely an HTML error page)`);
        }
      }
    } catch (err) {
      if (err.message?.includes("not valid JSON") || err.message?.includes("HTTP 4")) throw err;
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BACKOFF_MS * attempt);
  }
  throw lastError ?? new Error(`${label}: request failed`);
}

/**
 * Resolve one period: issue a request per distinct week range, validate each,
 * then read every team's value only from the request whose range matches that
 * team's own true window.
 */
async function buildPeriod({ periodKey, ranges, teamMap, offlineDir, gamesIncluded, requestLog }) {
  const valuesByTeam = {};
  const gameIdsByTeam = {};
  let first = true;

  for (const range of ranges) {
    if (!first && !offlineDir) await sleep(REQUEST_SPACING_MS);
    first = false;

    const payload = buildRbsdmPayload(range);
    const label = `${periodKey} weeks ${range.weekMin}-${range.weekMax}`;
    const json = await fetchRange(payload, label, { offlineDir });
    const { byTeam, teamsReturned } = validateRbsdmResponse(json, {
      teamMap,
      requiredTeams: range.teams,
      label,
    });

    // Only the teams whose true window matches this range are read from it.
    for (const team of range.teams) {
      valuesByTeam[team] = byTeam.get(team);
      gameIdsByTeam[team] = range.gameIdsByTeam[team] ?? null;
    }

    requestLog.push({
      periodKey,
      endpoint: RBSDM_ENDPOINT,
      payload,
      weekMin: range.weekMin,
      weekMax: range.weekMax,
      teamsSelected: range.teams,
      teamsReturned,
    });
    console.log(`[nfl:rbsdm] ${label}: ${teamsReturned.length} returned, ${range.teams.length} selected`);
  }

  // Rank each metric independently within this period.
  const ranks = {};
  for (const metricKey of RBSDM_METRIC_KEYS) {
    const metricValues = {};
    for (const [team, values] of Object.entries(valuesByTeam)) {
      if (values && values[metricKey] !== null && values[metricKey] !== undefined) {
        metricValues[team] = values[metricKey];
      }
    }
    ranks[metricKey] = rankPeriodValues(metricValues, RBSDM_METRIC_DIRECTION[metricKey]);
  }

  const teams = {};
  for (const [team, values] of Object.entries(valuesByTeam)) {
    const metrics = {};
    for (const metricKey of RBSDM_METRIC_KEYS) {
      const raw = values?.[metricKey];
      if (raw === null || raw === undefined) continue;
      metrics[metricKey] = {
        // Display percent, the unrounded source fraction, and the rank.
        pct: toPercent(raw),
        raw,
        rank: ranks[metricKey][team] ?? null,
      };
    }
    teams[team] = {
      gamesIncluded: gamesIncluded[team] ?? (gameIdsByTeam[team]?.length ?? null),
      gameIds: gameIdsByTeam[team] ?? null,
      metrics,
    };
  }

  return teams;
}

async function main() {
  const args = parseArgs(process.argv);
  const currentSeason = args.currentSeason;
  const priorSeason = currentSeason - 1;

  const teamsJson = readJson(join(DATA_DIR, "teams.json"));
  const teamMap = buildRbsdmTeamMap(teamsJson);

  const seasonInputs = [];
  for (const season of [priorSeason, currentSeason]) {
    const loaded = loadSeason(season);
    if (loaded) seasonInputs.push(loaded);
  }
  if (seasonInputs.length === 0) throw new Error("No schedule/results data available");

  const completedByTeam = buildCompletedGameIndex(seasonInputs);
  const priorCounts = completedGameCounts(completedByTeam, priorSeason);
  const currentCounts = completedGameCounts(completedByTeam, currentSeason);

  const requestLog = [];
  const periods = {};

  // --- 2025 last 8 ---------------------------------------------------------
  const last8 = groupTeamsByWeekRange(completedByTeam, {
    season: priorSeason,
    gameCount: LAST8_GAME_COUNT,
  });
  if (last8.groups.length > 0) {
    console.log(`[nfl:rbsdm] ${priorSeason} last ${LAST8_GAME_COUNT}: ${last8.groups.length} distinct week ranges`);
    periods[PERIOD_2025_LAST8] = await buildPeriod({
      periodKey: PERIOD_2025_LAST8,
      ranges: last8.groups,
      teamMap,
      offlineDir: args.offlineDir,
      gamesIncluded: Object.fromEntries(last8.groups.flatMap((g) => g.teams.map((t) => [t, LAST8_GAME_COUNT]))),
      requestLog,
    });
  }

  // --- 2026 season to date -------------------------------------------------
  const seasonRange = seasonToDateRange(completedByTeam, currentSeason);
  if (seasonRange) {
    if (!args.offlineDir) await sleep(REQUEST_SPACING_MS);
    periods[PERIOD_2026_SEASON] = await buildPeriod({
      periodKey: PERIOD_2026_SEASON,
      ranges: [seasonRange],
      teamMap,
      offlineDir: args.offlineDir,
      gamesIncluded: currentCounts,
      requestLog,
    });
  } else {
    console.log(`[nfl:rbsdm] no completed ${currentSeason} games yet; season-to-date period omitted`);
  }

  // --- 2026 last 5 ---------------------------------------------------------
  const last5 = groupTeamsByWeekRange(completedByTeam, {
    season: currentSeason,
    gameCount: LAST5_GAME_COUNT,
  });
  if (last5.groups.length > 0) {
    if (!args.offlineDir) await sleep(REQUEST_SPACING_MS);
    periods[PERIOD_2026_LAST5] = await buildPeriod({
      periodKey: PERIOD_2026_LAST5,
      ranges: last5.groups,
      teamMap,
      offlineDir: args.offlineDir,
      gamesIncluded: Object.fromEntries(last5.groups.flatMap((g) => g.teams.map((t) => [t, LAST5_GAME_COUNT]))),
      requestLog,
    });
  } else {
    console.log(`[nfl:rbsdm] fewer than ${LAST5_GAME_COUNT} completed ${currentSeason} games; last-5 period omitted`);
  }

  if (Object.keys(periods).length === 0) {
    throw new Error("No periods could be built; refusing to overwrite a known-good artifact");
  }

  const artifact = {
    _meta: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: RBSDM_SOURCE_LABEL,
      attribution: RBSDM_ATTRIBUTION,
      endpoint: RBSDM_ENDPOINT,
      method: "POST",
      currentSeason,
      priorSeason,
      sourceFields: RBSDM_FIELD_MAP,
      metricDirections: RBSDM_METRIC_DIRECTION,
      completedGameCounts: { [priorSeason]: priorCounts, [currentSeason]: currentCounts },
      requests: requestLog,
      notes: [
        "Success rates are RBSDM's published values, consumed verbatim. Success is never recomputed at the play level.",
        "Periods are never blended: RBSDM exposes the finished rate but not the eligible-play denominator, so ranges cannot be combined exactly.",
        "Regular season only (weeks_post_start/end = None).",
        "Last 8 / Last 5 windows are per-team: teams are grouped by the uniform week range that reproduces their own final N completed games, and each team's value is read only from its matching request.",
        "Ranks are competition ranks (1,2,2,4) computed independently within each period on unrounded source fractions.",
        "2026 season-to-date teams may have unequal game counts; gamesIncluded is stored per team.",
      ],
    },
    periods,
  };

  const summary = Object.fromEntries(
    Object.entries(periods).map(([k, v]) => [k, Object.keys(v).length])
  );
  console.log(`[nfl:rbsdm] periods=${JSON.stringify(summary)}`);

  if (args.dryRun) {
    console.log("[nfl:rbsdm] dry run; nothing written");
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best effort */ }
    }
    throw err;
  }
  console.log(`[nfl:rbsdm] wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(`[nfl:rbsdm] FAILED: ${err.message}`);
  console.error("[nfl:rbsdm] existing artifact left untouched");
  process.exit(1);
});
