#!/usr/bin/env node
/**
 * build-mlb-team-bullpen-stats.mjs
 *
 * Builds/refreshes public/data/mlb/team-bullpen-stats.json: a
 * reliever-pool-approximation bullpen stats + recent-workload/fatigue
 * cache for every MLB team, using the MLB StatsAPI.
 *
 * Phase 2.3 -- Bullpen data pipeline only. This script does NOT wire
 * bullpen data into any live scoring, generator, archive, or UI --
 * that integration is deferred to a later commit. It also does not run
 * in GitHub Actions yet (workflow activation is a later commit); it is
 * gated behind ENABLE_BULLPEN_DATA_PIPELINE (see mlb-phase2-flags.mjs)
 * so accidental/local invocation without the flag is a no-op.
 *
 * Usage:
 *   ENABLE_BULLPEN_DATA_PIPELINE=true node scripts/build-mlb-team-bullpen-stats.mjs
 *   ENABLE_BULLPEN_DATA_PIPELINE=true node scripts/build-mlb-team-bullpen-stats.mjs --force
 *   ENABLE_BULLPEN_DATA_PIPELINE=true node scripts/build-mlb-team-bullpen-stats.mjs --team=147
 *   ENABLE_BULLPEN_DATA_PIPELINE=true node scripts/build-mlb-team-bullpen-stats.mjs --out=/tmp/bullpen-smoke.json
 *
 * --force        refresh every team's season + workload sections regardless of freshness
 * --team=<id>     restrict to a single MLB team id (repeatable, comma-separated also accepted)
 * --out=<path>    write to an alternate path instead of the tracked public/data file
 *                 (use this for local/manual smoke-testing; never point --out at a tracked path)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPhase2Flags } from "./lib/mlb-phase2-flags.mjs";
import { selectTeamsNeedingRefresh, mergeTeamCacheEntry } from "./lib/mlb-bullpen-cache.mjs";
import { fetchAllTeams } from "./lib/mlb-bullpen-fetch.mjs";
import { fetchAndBuildTeamBullpenStats, toPersistableSchema, SCHEMA_VERSION } from "./lib/mlb-bullpen-stats.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(ROOT, "public", "data", "mlb", "team-bullpen-stats.json");
const SEASON = new Date().getFullYear();

function parseArgs(argv) {
  const isForce = argv.includes("--force");
  const outArg = argv.find((a) => a.startsWith("--out="));
  const teamArgs = argv.filter((a) => a.startsWith("--team=")).flatMap((a) => a.slice("--team=".length).split(","));
  return {
    isForce,
    outputPath: outArg ? path.resolve(outArg.slice("--out=".length)) : DEFAULT_OUTPUT_PATH,
    teamIds: teamArgs.length ? teamArgs.map(Number) : null,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const flags = getPhase2Flags();
  if (!flags.ENABLE_BULLPEN_DATA_PIPELINE) {
    console.log(
      "[bullpen] ENABLE_BULLPEN_DATA_PIPELINE is not \"true\" -- this is a shadow/candidate pipeline " +
        "and is a no-op by default. Set ENABLE_BULLPEN_DATA_PIPELINE=true to run it."
    );
    return;
  }

  const { isForce, outputPath, teamIds } = parseArgs(process.argv.slice(2));
  if (outputPath === path.join(ROOT, "public", "data", "mlb", "team-bullpen-stats.json") && process.env.MLB_BULLPEN_ALLOW_TRACKED_WRITE !== "true") {
    // Commit 3 scope: no generator/archive/workflow wiring yet, and no
    // live-generated production JSON should be committed from this
    // commit. Writing to the tracked path requires an explicit opt-in
    // env var so manual/local runs don't accidentally create a file
    // that then gets committed.
    console.log(
      "[bullpen] Refusing to write to the tracked public/data/mlb/team-bullpen-stats.json path " +
        "without MLB_BULLPEN_ALLOW_TRACKED_WRITE=true. Use --out=<path> for local verification, " +
        "e.g. --out=/tmp/team-bullpen-stats.json."
    );
    return;
  }

  const now = new Date();
  const asOfDate = todayIso();

  let cache = { schemaVersion: SCHEMA_VERSION, season: SEASON, generatedAt: now.toISOString(), teams: {} };
  if (existsSync(outputPath) && !isForce) {
    try {
      cache = JSON.parse(readFileSync(outputPath, "utf8"));
    } catch {
      console.warn(`[bullpen] Could not parse existing cache at ${outputPath}; starting fresh`);
    }
  }

  const allTeams = await fetchAllTeams(SEASON);
  const scopedTeams = teamIds ? allTeams.filter((t) => teamIds.includes(t.id)) : allTeams;
  const allTeamIds = scopedTeams.map((t) => String(t.id));

  const { seasonRefreshTeamIds, workloadRefreshTeamIds } = isForce
    ? { seasonRefreshTeamIds: allTeamIds, workloadRefreshTeamIds: allTeamIds }
    : selectTeamsNeedingRefresh(cache.teams ?? {}, allTeamIds, now);

  console.log(
    `[bullpen] ${scopedTeams.length} team(s) in scope; ${seasonRefreshTeamIds.length} need season refresh, ` +
      `${workloadRefreshTeamIds.length} need workload refresh`
  );

  for (const team of scopedTeams) {
    const teamIdStr = String(team.id);
    const needsSeason = seasonRefreshTeamIds.includes(teamIdStr);
    const needsWorkload = workloadRefreshTeamIds.includes(teamIdStr);
    if (!needsSeason && !needsWorkload) continue;

    const sections = [...(needsSeason ? ["season"] : []), ...(needsWorkload ? ["workload"] : [])];
    const existingEntry = cache.teams?.[teamIdStr];
    const knownRelieverPitcherIds = existingEntry?.season?.relieverPitcherIds ?? [];

    let refreshResult;
    try {
      const built = await fetchAndBuildTeamBullpenStats(
        { teamId: team.id, teamAbbr: team.abbreviation, season: SEASON, asOfDate, sections, knownRelieverPitcherIds },
        {}
      );
      refreshResult = {
        ...(needsSeason ? { season: { ok: Boolean(built.season), data: built.season } } : {}),
        ...(needsWorkload ? { workload: { ok: Boolean(built.workload), data: built.workload } } : {}),
      };
      if (built.warnings?.length) console.log(`[bullpen] ${team.abbreviation}: ${built.warnings.join("; ")}`);
    } catch (error) {
      console.warn(`[bullpen] ${team.abbreviation}: refresh failed entirely (${error.message})`);
      refreshResult = {
        ...(needsSeason ? { season: { ok: false } } : {}),
        ...(needsWorkload ? { workload: { ok: false } } : {}),
      };
    }

    const merged = mergeTeamCacheEntry(existingEntry, refreshResult, now);
    cache.teams = cache.teams ?? {};
    cache.teams[teamIdStr] = {
      teamId: team.id,
      teamAbbr: team.abbreviation,
      ...toPersistableSchema(merged),
    };
  }

  cache.generatedAt = now.toISOString();
  cache.schemaVersion = SCHEMA_VERSION;
  cache.season = SEASON;

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(cache, null, 2) + "\n");
  console.log(`[bullpen] Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error("[bullpen] Fatal error:", error);
  process.exitCode = 1;
});
