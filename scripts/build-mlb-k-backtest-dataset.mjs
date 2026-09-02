/**
 * build-mlb-k-backtest-dataset.mjs  (backtest step 5 orchestrator)
 *
 * Joins the StatsAPI outcome corpus (step 1) + cached game logs (step 2) into a
 * one-row-per-start JSONL dataset via the pure builders in
 * scripts/lib/mlb-k-backtest-*.mjs. Deterministic given the caches; safe to
 * re-run.
 *
 * Output:
 *   data/mlb/k-history/backtest/<label>/dataset.jsonl
 *   data/mlb/k-history/backtest/<label>/manifest.json
 *
 * Usage: node scripts/build-mlb-k-backtest-dataset.mjs [--label=2023-2025] [--seasons=2023,2024,2025]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { calculateProjectedKs, calculateProjectedK9 } from "./generate-mlb-hr-props.mjs";
import { calculateProjectedInnings, classifyPitcherRole, parseInningsPitchedString } from "./lib/mlb-projected-innings.mjs";
import { computeWorkloadProjection } from "./mlb-k/compute-workload-projection.mjs";
import { V2_PRODUCTION_CONFIDENCE } from "./lib/mlb-k-production-projection.mjs";
import { createCachedFetch, writeJsonAtomic } from "./lib/mlb-k-backtest-cache.mjs";
import { normalizeGameLog, pitchingGameLogUrl, teamHittingGameLogUrl } from "./lib/mlb-k-backtest-gamelogs.mjs";
import {
  buildLeagueAsOf,
  buildPitcherAsOf,
  buildTeamOffenseAsOf,
  buildWorkloadDataShape,
} from "./lib/mlb-k-backtest-asof.mjs";
import { buildBacktestRow } from "./lib/mlb-k-backtest-dataset.mjs";
import { loadProjectStrikeoutsV2 } from "./lib/mlb-k-backtest-v2-loader.mjs";

const ROOT = process.cwd();
const STATS_API_ROOT = path.join(ROOT, "data", "mlb", "k-history", "raw", "statsapi");
const GAMELOG_CACHE_DIR = path.join(ROOT, "data", "mlb", "k-history", "raw", "gamelogs");
const BACKTEST_ROOT = path.join(ROOT, "data", "mlb", "k-history", "backtest");

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function loadNormalizedCorpus(seasons) {
  const games = [];
  const sources = [];
  for (const seasonEntry of readdirSync(STATS_API_ROOT, { withFileTypes: true })) {
    if (!seasonEntry.isDirectory() || !/^\d{4}$/.test(seasonEntry.name)) continue;
    const season = Number(seasonEntry.name);
    if (seasons && !seasons.includes(season)) continue;
    const seasonDir = path.join(STATS_API_ROOT, seasonEntry.name);
    for (const windowEntry of readdirSync(seasonDir, { withFileTypes: true })) {
      if (!windowEntry.isDirectory()) continue;
      const normalizedPath = path.join(seasonDir, windowEntry.name, "normalized-outcomes.json");
      if (!existsSync(normalizedPath)) continue;
      let payload;
      try {
        payload = JSON.parse(readFileSync(normalizedPath, "utf8"));
      } catch {
        continue;
      }
      sources.push({ path: path.relative(ROOT, normalizedPath), sha256: sha256File(normalizedPath), games: (payload.games ?? []).length });
      for (const game of payload.games ?? []) {
        if (game.isFinal !== true) continue;
        games.push({ ...game, season });
      }
    }
  }
  // Deduplicate by gameId (weekly windows can overlap at the season envelope edges).
  const byId = new Map();
  for (const game of games) if (!byId.has(game.gameId)) byId.set(game.gameId, game);
  return { games: [...byId.values()].sort((a, b) => a.officialDate.localeCompare(b.officialDate) || a.gameId - b.gameId), sources };
}

class GameLogStore {
  constructor(cacheDir) {
    this.fetchImpl = createCachedFetch({ cacheDir, mode: "offline" });
    this.pitching = new Map();
    this.team = new Map();
    this.misses = { pitching: new Set(), team: new Set() };
  }

  async pitchingLog(pitcherId, season) {
    const key = `${pitcherId}:${season}`;
    if (this.pitching.has(key)) return this.pitching.get(key);
    let rows = [];
    try {
      rows = normalizeGameLog(await (await this.fetchImpl(pitchingGameLogUrl(pitcherId, season))).json());
    } catch {
      this.misses.pitching.add(key);
    }
    this.pitching.set(key, rows);
    return rows;
  }

  async teamLog(teamId, season) {
    const key = `${teamId}:${season}`;
    if (this.team.has(key)) return this.team.get(key);
    let rows = [];
    try {
      rows = normalizeGameLog(await (await this.fetchImpl(teamHittingGameLogUrl(teamId, season))).json());
    } catch {
      this.misses.team.add(key);
    }
    this.team.set(key, rows);
    return rows;
  }
}

async function loadSeasonTeamLogs(store, teamIds, season) {
  const map = new Map();
  for (const teamId of teamIds) map.set(teamId, await store.teamLog(teamId, season));
  return map;
}

export async function buildDataset({ label, seasons, log = (message) => console.log(message) } = {}) {
  const startedAt = Date.now();
  if (!existsSync(STATS_API_ROOT)) throw new Error("StatsAPI corpus missing - run acquire-mlb-k-backtest-history first");
  const { games, sources } = loadNormalizedCorpus(seasons);
  if (!games.length) throw new Error("No completed games in corpus for the requested seasons");

  const projectStrikeoutsV2 = await loadProjectStrikeoutsV2();
  const deps = {
    calculateProjectedInnings,
    calculateProjectedK9,
    calculateProjectedKs,
    classifyPitcherRole,
    computeWorkloadProjection,
    projectStrikeoutsV2,
    v2ProductionConfidence: V2_PRODUCTION_CONFIDENCE,
  };
  const store = new GameLogStore(GAMELOG_CACHE_DIR);

  const outDir = path.join(BACKTEST_ROOT, label);
  mkdirSync(outDir, { recursive: true });
  const datasetPath = path.join(outDir, "dataset.jsonl");
  const tmpPath = `${datasetPath}.tmp-${process.pid}`;
  const stream = [];

  const teamLogCache = new Map();
  const counters = {
    totalStarts: 0, rowsBuilt: 0, skippedNoPitcherId: 0, skippedPitchingLogMissing: 0, skippedNoActualK: 0,
    v2Available: 0, v2ProductionEligible: 0, legacyAvailable: 0, bothAvailable: 0, productionScoreable: 0,
    productionSourceV2: 0, productionSourceLegacy: 0, productionSourceUnavailable: 0,
  };
  const degradationCounts = {};
  const bySeason = {};

  let processed = 0;
  for (const game of games) {
    const season = game.season;
    if (!teamLogCache.has(season)) {
      const teamIds = [...new Set(games.filter((g) => g.season === season).flatMap((g) => [g.awayTeamId, g.homeTeamId]).filter(Boolean))];
      teamLogCache.set(season, await loadSeasonTeamLogs(store, teamIds, season));
    }
    const seasonTeamLogs = teamLogCache.get(season);
    const leagueAsOf = buildLeagueAsOf({ teamRowsByTeam: seasonTeamLogs, cutoffDate: game.officialDate });
    bySeason[season] ??= { totalStarts: 0, rowsBuilt: 0, productionScoreable: 0, fallbackRows: 0 };

    for (const starter of game.startingPitchers ?? []) {
      counters.totalStarts += 1;
      bySeason[season].totalStarts += 1;
      if (!starter.pitcherId) {
        counters.skippedNoPitcherId += 1;
        continue;
      }
      const opponentTeamId = starter.side === "home" ? game.awayTeamId : game.homeTeamId;
      const [currentRows, priorRows] = await Promise.all([
        store.pitchingLog(starter.pitcherId, season),
        store.pitchingLog(starter.pitcherId, season - 1),
      ]);
      if (!currentRows.length && !priorRows.length) {
        counters.skippedPitchingLogMissing += 1;
        continue;
      }
      const actualK = starter.actualStrikeouts;
      if (actualK == null) {
        counters.skippedNoActualK += 1;
        continue;
      }

      const pitcherAsOf = buildPitcherAsOf({
        currentSeasonRows: currentRows,
        priorSeasonRows: priorRows,
        cutoffDate: game.officialDate,
        excludeGamePk: game.gameId,
      });
      const opponentAsOf = buildTeamOffenseAsOf({
        teamRows: seasonTeamLogs.get(opponentTeamId) ?? [],
        cutoffDate: game.officialDate,
        excludeGamePk: game.gameId,
      });
      const workloadDataShape = buildWorkloadDataShape(pitcherAsOf, { season, cutoffDate: game.officialDate });

      const row = buildBacktestRow({
        identity: {
          season,
          date: game.officialDate,
          gameId: game.gameId,
          gameNumber: game.gameNumber ?? 1,
          pitcherId: starter.pitcherId,
          pitcherName: starter.pitcherName ?? null,
          team: starter.team ?? null,
          opponent: starter.side === "home" ? game.awayTeam : game.homeTeam,
          pitcherIsHome: starter.side === "home",
          handedness: starter.pitcherHand ?? null,
          venueId: game.venueId ?? null,
        },
        pitcherAsOf,
        opponentAsOf,
        leagueAsOf,
        workloadDataShape,
        actual: {
          strikeouts: starter.actualStrikeouts,
          inningsPitched: parseInningsPitchedString(starter.actualInnings),
          battersFaced: starter.actualBattersFaced,
          pitches: starter.actualPitchCount,
          walks: starter.actualWalks,
          hits: starter.actualHits,
        },
        deps,
      });

      stream.push(JSON.stringify(row));
      counters.rowsBuilt += 1;
      bySeason[season].rowsBuilt += 1;
      if (row.availability.v2) counters.v2Available += 1;
      if (row.v2.productionEligible) counters.v2ProductionEligible += 1;
      if (row.availability.legacy) counters.legacyAvailable += 1;
      if (row.availability.both) counters.bothAvailable += 1;
      if (row.availability.productionScoreable) { counters.productionScoreable += 1; bySeason[season].productionScoreable += 1; }
      if (row.productionResolved.source === "v2") counters.productionSourceV2 += 1;
      else if (row.productionResolved.source === "legacy-fallback") { counters.productionSourceLegacy += 1; bySeason[season].fallbackRows += 1; }
      else counters.productionSourceUnavailable += 1;
      for (const flag of row.degradationFlags) degradationCounts[flag] = (degradationCounts[flag] ?? 0) + 1;
    }
    processed += 1;
    if (processed % 500 === 0) log(`[dataset] ${processed}/${games.length} games -> ${counters.rowsBuilt} rows`);
  }

  writeFileSync(tmpPath, `${stream.join("\n")}\n`, "utf8");
  renameSync(tmpPath, datasetPath);

  const gamelogManifestPath = path.join(GAMELOG_CACHE_DIR, "manifest.json");
  const manifest = {
    schemaVersion: 1,
    kind: "mlb-k-backtest-dataset",
    label,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    seasons: seasons ?? "all-in-corpus",
    datasetPath: path.relative(ROOT, datasetPath),
    rowCount: counters.rowsBuilt,
    counters,
    bySeason,
    degradationCounts,
    gameLogCacheMisses: {
      pitching: [...store.misses.pitching],
      team: [...store.misses.team],
    },
    inputs: {
      normalizedOutcomes: sources,
      gamelogManifestSha256: existsSync(gamelogManifestPath) ? sha256File(gamelogManifestPath) : null,
    },
  };
  writeJsonAtomic(path.join(outDir, "manifest.json"), manifest);
  return manifest;
}

export async function main(argv = process.argv.slice(2)) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const seasonsArg = value("--seasons=");
  const seasons = seasonsArg ? seasonsArg.split(",").map((entry) => Number(entry.trim())).filter(Number.isInteger) : null;
  const label = value("--label=") ?? (seasons ? `${Math.min(...seasons)}-${Math.max(...seasons)}` : "all");
  const manifest = await buildDataset({ label, seasons });
  console.log(JSON.stringify({
    label: manifest.label,
    rowCount: manifest.rowCount,
    counters: manifest.counters,
    bySeason: manifest.bySeason,
    degradationCounts: manifest.degradationCounts,
    cacheMisses: {
      pitching: manifest.gameLogCacheMisses.pitching.length,
      team: manifest.gameLogCacheMisses.team.length,
    },
  }, null, 2));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[build-mlb-k-backtest-dataset] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
