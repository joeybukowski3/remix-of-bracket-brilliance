#!/usr/bin/env node
/**
 * build-mlb-batter-hand-splits.mjs
 *
 * Builds/refreshes public/data/mlb/batter-hand-splits-cache.json: a
 * per-batter platoon (vs left / vs right) hitting-split cache with
 * empirical-Bayes shrinkage toward each batter's own current-season
 * overall line, using the MLB StatsAPI.
 *
 * Phase 2 (hand-split cache) -- data pipeline only. This script does NOT
 * wire hand-split data into any live scoring, generator, archive, or UI
 * -- that integration is deferred to a later commit. It also does not
 * run in GitHub Actions yet (workflow activation is a separately
 * approved, later commit); it is gated behind
 * ENABLE_HAND_SPLIT_DATA_PIPELINE (see mlb-phase2-flags.mjs) so
 * accidental/local invocation without the flag is a no-op.
 *
 * Unlike the team-scoped bullpen pipeline, there is no small enumerable
 * universe of "all batters" to default to -- this CLI always operates on
 * an explicit, caller-supplied list of player ids (e.g. today's confirmed
 * lineups, supplied by a future generator-wiring commit). It never
 * fetches "every MLB hitter" in any mode.
 *
 * Usage:
 *   ENABLE_HAND_SPLIT_DATA_PIPELINE=true node scripts/build-mlb-batter-hand-splits.mjs --player=592450,660271
 *   ENABLE_HAND_SPLIT_DATA_PIPELINE=true node scripts/build-mlb-batter-hand-splits.mjs --player=592450 --force
 *   ENABLE_HAND_SPLIT_DATA_PIPELINE=true node scripts/build-mlb-batter-hand-splits.mjs --player=592450 --out=/tmp/hand-splits-smoke.json
 *
 * --player=<id>   required; one or more MLB player ids (repeatable, comma-separated also accepted)
 * --force         refresh every requested player regardless of freshness
 * --out=<path>    write to an alternate path instead of the tracked public/data file
 *                 (use this for local/manual smoke-testing; never point --out at a tracked path)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPhase2Flags } from "./lib/mlb-phase2-flags.mjs";
import { selectPlayersNeedingRefresh, mergePlayerCacheEntry } from "./lib/mlb-hand-split-cache.mjs";
import { fetchAndBuildPlayerHandSplits, SCHEMA_VERSION } from "./lib/mlb-batter-hand-splits.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(ROOT, "public", "data", "mlb", "batter-hand-splits-cache.json");
const SEASON = new Date().getFullYear();

function parseArgs(argv) {
  const isForce = argv.includes("--force");
  const outArg = argv.find((a) => a.startsWith("--out="));
  const playerArgs = argv.filter((a) => a.startsWith("--player=")).flatMap((a) => a.slice("--player=".length).split(","));
  const playerIds = Array.from(
    new Set(playerArgs.map(Number).filter((id) => Number.isFinite(id) && id > 0))
  );
  return {
    isForce,
    outputPath: outArg ? path.resolve(outArg.slice("--out=".length)) : DEFAULT_OUTPUT_PATH,
    playerIds,
  };
}

async function main() {
  const flags = getPhase2Flags();
  if (!flags.ENABLE_HAND_SPLIT_DATA_PIPELINE) {
    console.log(
      "[hand-split] ENABLE_HAND_SPLIT_DATA_PIPELINE is not \"true\" -- this is a shadow/candidate pipeline " +
        "and is a no-op by default. Set ENABLE_HAND_SPLIT_DATA_PIPELINE=true to run it."
    );
    return;
  }

  const { isForce, outputPath, playerIds } = parseArgs(process.argv.slice(2));

  if (playerIds.length === 0) {
    console.log("[hand-split] No --player=<id> supplied. Nothing to do (this CLI never fetches \"all\" batters).");
    return;
  }

  if (outputPath === DEFAULT_OUTPUT_PATH && process.env.MLB_HAND_SPLIT_ALLOW_TRACKED_WRITE !== "true") {
    // Mirrors the bullpen CLI's tracked-write guard exactly: no
    // live-generated production JSON should be committed from this
    // commit. Writing to the tracked path requires an explicit opt-in
    // env var so manual/local runs don't accidentally create a file
    // that then gets committed.
    console.log(
      "[hand-split] Refusing to write to the tracked public/data/mlb/batter-hand-splits-cache.json path " +
        "without MLB_HAND_SPLIT_ALLOW_TRACKED_WRITE=true. Use --out=<path> for local verification, " +
        "e.g. --out=/tmp/batter-hand-splits-cache.json."
    );
    return;
  }

  const now = new Date();

  let cache = { schemaVersion: SCHEMA_VERSION, season: SEASON, generatedAt: now.toISOString(), players: {} };
  if (existsSync(outputPath) && !isForce) {
    try {
      cache = JSON.parse(readFileSync(outputPath, "utf8"));
    } catch {
      console.warn(`[hand-split] Could not parse existing cache at ${outputPath}; starting fresh`);
    }
  }

  const refreshPlayerIds = isForce ? playerIds : selectPlayersNeedingRefresh(cache.players ?? {}, playerIds, now);
  console.log(`[hand-split] ${playerIds.length} player(s) requested; ${refreshPlayerIds.length} need refresh`);

  for (const playerId of refreshPlayerIds) {
    const playerIdStr = String(playerId);
    const existingEntry = cache.players?.[playerIdStr];

    let refreshResult;
    try {
      const built = await fetchAndBuildPlayerHandSplits(playerId, SEASON, {});
      refreshResult = { ok: true, data: built };
      if (built.warnings?.length) console.log(`[hand-split] player=${playerId}: ${built.warnings.join("; ")}`);
    } catch (error) {
      console.warn(`[hand-split] player=${playerId}: refresh failed entirely (${error.message})`);
      refreshResult = { ok: false };
    }

    cache.players = cache.players ?? {};
    cache.players[playerIdStr] = mergePlayerCacheEntry(existingEntry, refreshResult, now);
  }

  cache.generatedAt = now.toISOString();
  cache.schemaVersion = SCHEMA_VERSION;
  cache.season = SEASON;

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(cache, null, 2) + "\n");
  console.log(`[hand-split] Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error("[hand-split] Fatal error:", error);
  process.exitCode = 1;
});
