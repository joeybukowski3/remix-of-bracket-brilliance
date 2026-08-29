/**
 * Generate public/data/nfl/matchup-metrics.json — conventional team metrics for
 * the NFL matchup analyzer, precomputed for all four sample-control states.
 *
 * Inputs (all already present in this repository, no network required):
 *   data/nfl/nflverse/stats-team-week/stats_team_week_<season>.csv
 *   public/data/nfl/<season>/games.json
 *   public/data/nfl/<season>/results.json
 *   public/data/nfl/teams.json
 *
 * The current-season CSV legitimately does not exist before the season starts.
 * That is not an error: the blend-OFF windows simply resolve to no sample and
 * every metric stays unavailable.
 *
 * Usage:
 *   node scripts/generate-nfl-matchup-metrics.mjs
 *   node scripts/generate-nfl-matchup-metrics.mjs --season=2026
 *   node scripts/generate-nfl-matchup-metrics.mjs --dry-run
 *   node scripts/generate-nfl-matchup-metrics.mjs --stats-dir=<dir> --data-dir=<dir> --out=<file>
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAdvancedTeamStatRows } from "./lib/nfl-advanced-stats.mjs";
import {
  MATCHUP_METRIC_DEFS,
  MATCHUP_METRIC_KEYS,
  WINDOW_SPECS,
  aggregateTeamWindow,
  buildCompletedGameIndex,
  computeRanks,
  roundTo,
  selectWindowGames,
} from "./lib/nfl-matchup-metrics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA_DIR = join(ROOT, "public", "data", "nfl");
const DEFAULT_STATS_DIR = join(ROOT, "data", "nfl", "nflverse", "stats-team-week");
const SOURCE_LABEL = "nflverse (stats_team weekly release)";
const SCHEMA_VERSION = "nfl-matchup-metrics-v1";
const EXPECTED_TEAMS = 32;

function parseArgs(argv) {
  const args = { season: 2026, dryRun: false, statsDir: DEFAULT_STATS_DIR, dataDir: DEFAULT_DATA_DIR, out: null };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--stats-dir=")) args.statsDir = resolve(raw.slice(12));
    else if (raw.startsWith("--data-dir=")) args.dataDir = resolve(raw.slice(11));
    else if (raw.startsWith("--out=")) args.out = resolve(raw.slice(6));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season)) throw new Error(`Invalid --season`);
  args.out = args.out ?? join(args.dataDir, "matchup-metrics.json");
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadSeason(dataDir, season) {
  const gamesPath = join(dataDir, String(season), "games.json");
  const resultsPath = join(dataDir, String(season), "results.json");
  if (!existsSync(gamesPath) || !existsSync(resultsPath)) return null;
  return {
    season,
    games: readJson(gamesPath).games ?? [],
    results: readJson(resultsPath).results ?? [],
  };
}

function loadStatRows(statsDir, season, teamsJson) {
  const file = join(statsDir, `stats_team_week_${season}.csv`);
  if (!existsSync(file)) {
    return { rows: [], file: null, present: false };
  }
  const rows = parseAdvancedTeamStatRows(readFileSync(file, "utf-8"), teamsJson, {
    season,
    seasonType: "REG",
  });
  return { rows, file, present: true };
}

function main() {
  const args = parseArgs(process.argv);
  const currentSeason = args.season;
  const priorSeason = currentSeason - 1;

  const teamsJson = readJson(join(args.dataDir, "teams.json"));
  const teams = teamsJson.teams ?? [];
  if (teams.length !== EXPECTED_TEAMS) {
    throw new Error(`Expected ${EXPECTED_TEAMS} canonical teams, found ${teams.length}`);
  }
  const teamAbbrs = teams.map((t) => t.abbr).sort();
  if (new Set(teamAbbrs).size !== EXPECTED_TEAMS) {
    throw new Error("Duplicate team abbreviation in teams.json");
  }

  // --- source data ---------------------------------------------------------
  const seasonInputs = [];
  const sourceFiles = [];
  const seasonsUsed = [];

  for (const season of [priorSeason, currentSeason]) {
    const schedule = loadSeason(args.dataDir, season);
    const stats = loadStatRows(args.statsDir, season, teamsJson);

    if (!schedule) {
      console.log(`[nfl:matchup-metrics] no schedule/results for ${season}; skipping`);
      continue;
    }
    if (!stats.present) {
      console.log(
        `[nfl:matchup-metrics] stats_team_week_${season}.csv not present yet; ${season} contributes no metrics`
      );
      continue;
    }

    // A complete prior season must cover all 32 teams; a season in progress
    // (or not yet started) legitimately covers fewer.
    const distinct = new Set(stats.rows.map((r) => r.team));
    if (season === priorSeason && distinct.size !== EXPECTED_TEAMS) {
      throw new Error(
        `stats_team_week_${season}.csv covers ${distinct.size} teams, expected ${EXPECTED_TEAMS}`
      );
    }

    seasonInputs.push({ ...schedule, rows: stats.rows });
    sourceFiles.push({
      season,
      path: stats.file.replace(`${ROOT}\\`, "").replace(`${ROOT}/`, "").replace(/\\/g, "/"),
      rowCount: stats.rows.length,
    });
    seasonsUsed.push(season);
  }

  if (seasonInputs.length === 0) {
    throw new Error("No usable source seasons; refusing to write an empty artifact");
  }

  // --- indices -------------------------------------------------------------
  const completedByTeam = buildCompletedGameIndex(seasonInputs);

  const rowsByGameTeam = new Map();
  for (const input of seasonInputs) {
    for (const row of input.rows) {
      const gameId = row.source.game_id;
      const key = `${gameId}|${row.team}`;
      if (rowsByGameTeam.has(key)) {
        throw new Error(`Duplicate stats row for ${key}`);
      }
      rowsByGameTeam.set(key, row);
    }
  }

  // --- build every window --------------------------------------------------
  const windows = {};
  const joinProblems = [];

  for (const { id, mode, includePriorSeason } of WINDOW_SPECS) {
    {
      const perTeam = {};
      const rawByMetric = Object.fromEntries(MATCHUP_METRIC_KEYS.map((k) => [k, {}]));

      for (const team of teamAbbrs) {
        const teamGames = completedByTeam.get(team) ?? [];
        const selected = selectWindowGames(teamGames, {
          mode,
          includePriorSeason,
          currentSeason,
          priorSeason,
        });
        if (selected.length === 0) continue;

        const { values, missing } = aggregateTeamWindow(selected, rowsByGameTeam);
        if (missing.length > 0) joinProblems.push(...missing);

        const last = selected[selected.length - 1];
        perTeam[team] = {
          gamesIncluded: selected.length,
          gameIds: selected.map((g) => g.gameId),
          seasons: [...new Set(selected.map((g) => g.season))].sort(),
          through: { season: last.season, week: last.week, dateUtc: last.dateUtc },
          metrics: {},
        };
        for (const key of MATCHUP_METRIC_KEYS) rawByMetric[key][team] = values[key];
      }

      // Rank on unrounded values, then round only for display.
      for (const key of MATCHUP_METRIC_KEYS) {
        const ranks = computeRanks(rawByMetric[key], MATCHUP_METRIC_DEFS[key].direction);
        for (const [team, raw] of Object.entries(rawByMetric[key])) {
          if (raw === null || raw === undefined || !Number.isFinite(raw)) continue;
          perTeam[team].metrics[key] = [roundTo(raw, MATCHUP_METRIC_DEFS[key].decimals), ranks[team] ?? null];
        }
      }

      windows[id] = { mode, includePriorSeason, teams: perTeam };
    }
  }

  if (joinProblems.length > 0) {
    throw new Error(
      `Opponent join failed for ${joinProblems.length} team-games, e.g. ${JSON.stringify(joinProblems[0])}`
    );
  }

  const artifact = {
    _meta: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: SOURCE_LABEL,
      sourceFiles,
      scheduleSource: "public/data/nfl/<season>/{games,results}.json",
      currentSeason,
      priorSeason,
      seasonsUsed,
      teamCount: EXPECTED_TEAMS,
      metricKeys: MATCHUP_METRIC_KEYS,
      notes: [
        "Conventional team metrics only. EPA, success rate, first downs, third down, time of possession, line-of-scrimmage win rates, ATS/O-U and injuries are NOT in this artifact.",
        "Regular season only; postseason excluded. Samples are built from completed games, never week numbers, so byes are handled naturally.",
        "The `prior-season-full` window is every completed prior-season game (the /nfl/power-ratings 2025 tab); it is not a matchup-analyzer control state.",
        "Ratios are recomputed from summed numerators/denominators over the selected games -- never a mean of per-game rates.",
        "Offensive plays = pass attempts + sacks taken + carries. Offensive yards = passing yards + rushing yards (gross of sack yardage, matching the existing v0.2 pipeline).",
        "Defensive values come from the opponent's row in the same games, joined on game_id.",
        "Opponent passer rating uses the standard NFL formula over aggregate opponent totals, each component clamped to 0-2.375.",
        "Ranks are competition ranks (1,2,2,4) computed per window on unrounded values; values are rounded only for display.",
        "Play-mix and volume metrics are context-only and must not be given quality-tier colouring.",
        "No betting lines, no projected spread, no win probability, no pick.",
      ],
    },
    windows,
  };

  const populated = Object.fromEntries(
    Object.entries(windows).map(([id, w]) => [id, Object.keys(w.teams).length])
  );
  console.log(`[nfl:matchup-metrics] seasons=${seasonsUsed.join(",")} teams-per-window=${JSON.stringify(populated)}`);

  if (args.dryRun) {
    console.log("[nfl:matchup-metrics] dry run; nothing written");
    return;
  }

  // Atomic write: only replace a known-good artifact once the new one is built.
  const tmp = `${args.out}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
    renameSync(tmp, args.out);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best effort cleanup */ }
    }
    throw err;
  }
  console.log(`[nfl:matchup-metrics] wrote ${args.out}`);
}

try {
  main();
} catch (err) {
  console.error(`[nfl:matchup-metrics] FAILED: ${err.message}`);
  process.exit(1);
}
