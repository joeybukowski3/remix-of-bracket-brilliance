/**
 * Integrity gate for the NFL matchup metric data chain.
 *
 * public/data/nfl/matchup-metrics.json (conventional + play-by-play down
 * metrics) and public/data/nfl/matchup-epa.json are produced by separate
 * generators but are shown side by side on the matchup page, so they must be
 * built from identical game windows. This check runs in the scheduled refresh
 * workflow BEFORE anything is committed; any problem exits non-zero so a
 * half-refreshed chain is never pushed.
 *
 * It reuses the artifacts' own fields only (game ids, season lists, counts,
 * metric tuples); it computes no statistic and re-implements no window logic.
 *
 * Usage:
 *   node scripts/validate-nfl-matchup-metrics-alignment.mjs
 *   node scripts/validate-nfl-matchup-metrics-alignment.mjs --data-dir=<dir>
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedFinalTeamGames, validateTeamGameCoverage } from "./lib/nfl-current-season-coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_TEAMS = 32;
const EXPECTED_WINDOWS = ["last5-blend", "last5-current", "prior-season-full", "season-blend", "season-current"];
/** Windows that must always cover every team (they always include prior-season games). */
const FULL_COVERAGE_WINDOWS = ["last5-blend", "prior-season-full", "season-blend"];
const CURRENT_ONLY_WINDOWS = ["last5-current", "season-current"];
const DOWN_METRIC_KEYS = [
  "off.firstDownsPerPlay",
  "def.firstDownsPerPlayAllowed",
  "off.thirdDownConversion",
  "def.thirdDownConversionAllowed",
];
const EPA_METRIC_KEYS = [
  "off.epaPerPlay",
  "off.epaPerPass",
  "off.epaPerRush",
  "def.epaPerPlayAllowed",
  "def.epaPerPassAllowed",
  "def.epaPerRushAllowed",
];

const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * @param {object} metrics parsed matchup-metrics.json
 * @param {object} epa parsed matchup-epa.json
 * @param {{ finalCurrentSeasonGames?: number }} [options]
 *   finalCurrentSeasonGames: completed current-season REG games according to
 *   results.json. When > 0 the current-only windows must be populated.
 * @returns {{ problems: string[], summary: object }}
 */
export function validateMatchupMetricsAlignment(metrics, epa, { finalCurrentSeasonGames = 0, expectedCurrentTeamGames = null } = {}) {
  const problems = [];
  const summary = {};
  const fail = (message) => problems.push(message);

  if (!metrics?.windows || !metrics?._meta) fail("matchup-metrics.json is missing _meta/windows");
  if (!epa?.windows) fail("matchup-epa.json is missing windows");
  if (problems.length > 0) return { problems, summary };

  const currentSeason = metrics._meta.currentSeason;
  if (!Number.isInteger(currentSeason)) fail("matchup-metrics.json has no integer currentSeason");
  if (epa.currentSeason !== currentSeason) {
    fail(`currentSeason differs: matchup-metrics ${currentSeason} vs matchup-epa ${epa.currentSeason}`);
  }

  for (const key of DOWN_METRIC_KEYS) {
    if (!metrics._meta.metricKeys?.includes(key)) fail(`matchup-metrics.json metricKeys is missing ${key}`);
  }
  for (const key of EPA_METRIC_KEYS) {
    if (!epa.metricKeys?.includes(key)) fail(`matchup-epa.json metricKeys is missing ${key}`);
  }

  const metricWindows = Object.keys(metrics.windows).sort();
  const epaWindows = Object.keys(epa.windows).sort();
  if (!sameList(metricWindows, EXPECTED_WINDOWS)) fail(`matchup-metrics windows are ${metricWindows.join(",")}`);
  if (!sameList(epaWindows, EXPECTED_WINDOWS)) fail(`matchup-epa windows are ${epaWindows.join(",")}`);
  if (problems.length > 0) return { problems, summary };

  for (const id of EXPECTED_WINDOWS) {
    const m = metrics.windows[id].teams ?? {};
    const e = epa.windows[id].teams ?? {};
    const mTeams = Object.keys(m).sort();
    const eTeams = Object.keys(e).sort();
    summary[id] = { metricsTeams: mTeams.length, epaTeams: eTeams.length };

    if (!sameList(mTeams, eTeams)) {
      fail(`${id}: team sets differ (metrics ${mTeams.length}, epa ${eTeams.length})`);
    }
    if (FULL_COVERAGE_WINDOWS.includes(id) && mTeams.length !== EXPECTED_TEAMS) {
      fail(`${id}: expected ${EXPECTED_TEAMS} teams, got ${mTeams.length}`);
    }

    for (const abbr of mTeams) {
      const mt = m[abbr];
      const et = e[abbr];
      if (!et) continue;
      const label = `${id}/${abbr}`;
      if (mt.gamesIncluded !== mt.gameIds?.length) fail(`${label}: metrics gamesIncluded != gameIds length`);
      if (et.gamesIncluded !== et.gameIds?.length) fail(`${label}: epa gamesIncluded != gameIds length`);
      if (!sameList(mt.gameIds, et.gameIds)) {
        fail(`${label}: game ids differ (metrics ${mt.gameIds?.length}, epa ${et.gameIds?.length})`);
      }
      if (!sameList(mt.seasons, et.seasons)) fail(`${label}: season lists differ`);
      for (const key of DOWN_METRIC_KEYS) {
        if (!isFiniteNumber(mt.metrics?.[key]?.[0])) fail(`${label}: ${key} is missing`);
      }
      for (const key of EPA_METRIC_KEYS) {
        if (!isFiniteNumber(et.metrics?.[key]?.[0])) fail(`${label}: ${key} is missing`);
      }
    }
  }

  for (const id of CURRENT_ONLY_WINDOWS) {
    for (const [name, artifact] of [["metrics", metrics], ["epa", epa]]) {
      for (const [abbr, team] of Object.entries(artifact.windows[id].teams ?? {})) {
        if (!sameList(team.seasons, [currentSeason])) fail(`${id}/${abbr}: ${name} current-only window includes a non-${currentSeason} game`);
      }
    }
    if (finalCurrentSeasonGames > 0 && summary[id].metricsTeams === 0) {
      fail(`${id}: ${finalCurrentSeasonGames} completed ${currentSeason} games exist but the window is empty`);
    }
  }

  if (expectedCurrentTeamGames) {
    for (const [name, artifact] of [["metrics", metrics], ["epa", epa]]) {
      const included = Object.entries(artifact.windows["season-current"].teams ?? {}).flatMap(([team, row]) =>
        (row.gameIds ?? []).map((gameId) => ({ team, gameId }))
      );
      const coverage = validateTeamGameCoverage(expectedCurrentTeamGames, included, `${name} season-current`);
      summary[`${name}Coverage`] = coverage.summary;
      for (const problem of coverage.problems) fail(`${name}: ${problem}`);
    }
  }

  return { problems, summary };
}

function parseArgs(argv) {
  const args = { dataDir: join(ROOT, "public", "data", "nfl") };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--data-dir=")) args.dataDir = resolve(raw.slice(11));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`Missing file: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function countFinalGames(dataDir, season) {
  const path = join(dataDir, String(season), "results.json");
  if (!existsSync(path)) return 0;
  const results = readJson(path).results ?? [];
  return results.filter((r) => r.seasonType === "REG" && r.final === true).length;
}

function main() {
  const { dataDir } = parseArgs(process.argv);
  const metrics = readJson(join(dataDir, "matchup-metrics.json"));
  const epa = readJson(join(dataDir, "matchup-epa.json"));
  const finalGames = countFinalGames(dataDir, metrics?._meta?.currentSeason);
  const seasonDir = join(dataDir, String(metrics?._meta?.currentSeason));
  const results = readJson(join(seasonDir, "results.json")).results ?? [];
  const games = readJson(join(seasonDir, "games.json")).games ?? [];
  const expectedCurrentTeamGames = expectedFinalTeamGames(results, games);
  const { problems, summary } = validateMatchupMetricsAlignment(metrics, epa, { finalCurrentSeasonGames: finalGames, expectedCurrentTeamGames });

  if (problems.length > 0) {
    console.error(`[nfl:matchup-alignment] FAILED with ${problems.length} problem(s):`);
    for (const problem of problems.slice(0, 25)) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`[nfl:matchup-alignment] OK season=${metrics._meta.currentSeason} finalGames=${finalGames} ${JSON.stringify(summary)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:matchup-alignment] FAILED: ${err.message}`);
    process.exit(1);
  }
}
