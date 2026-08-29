/**
 * Generate public/data/nfl/matchup-epa.json — nflfastR EPA efficiency for the
 * matchup analyzer.
 *
 * Reads only the committed compact cache under data/nfl/nflverse/epa-team-game/
 * plus the repository's own schedule/results; never touches the network. Run
 * scripts/refresh-nfl-epa-source-cache.mjs first to update the cache.
 *
 * Sample windows are NOT redefined here. The four control states, the
 * chronological completed-game index and the competition ranking all come from
 * scripts/lib/nfl-matchup-metrics.mjs, the same module the Phase 2 conventional
 * generator uses, so a given control state selects byte-identical game ids in
 * both artifacts and the Season / Last 5 / blend toggles move EPA exactly as
 * they move yards per play.
 *
 * Independent of the Phase 2, 3A, 3B, 4 and 5 generators: a failure here can
 * never block any of them, and a missing EPA artifact only leaves the six EPA
 * rows at N/A.
 *
 * Usage:
 *   node scripts/generate-nfl-matchup-epa.mjs
 *   node scripts/generate-nfl-matchup-epa.mjs --dry-run
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import {
  WINDOW_IDS,
  WINDOW_SPECS,
  buildCompletedGameIndex,
  computeRanks,
  roundTo,
  selectWindowGames,
} from "./lib/nfl-matchup-metrics.mjs";
import {
  COMPACT_COLUMNS,
  EPA_DISPLAY_DECIMALS,
  EPA_ELIGIBLE_PLAY_FILTER,
  EPA_METRIC_DIRECTIONS,
  EPA_METRIC_KEYS,
  NFL_EPA_ATTRIBUTION,
  NFL_EPA_SOURCE_LABEL,
  indexTeamGames,
  opponentRecord,
  parseCompactRow,
  sumWindow,
  validateTeamGames,
  windowMetrics,
} from "./lib/nfl-epa-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "epa-team-game");
const OUT_FILE = join(DATA_DIR, "matchup-epa.json");

export const EPA_SCHEMA_VERSION = "nfl-matchup-epa-v1";

const CURRENT_SEASON = 2026;
const PRIOR_SEASON = 2025;

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

/** Load and byte-verify every cached season present in the manifest. */
function loadCache() {
  const manifestPath = join(CACHE_DIR, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`EPA cache manifest missing at ${manifestPath}; run refresh-nfl-epa-source-cache.mjs`);
  }
  const manifest = readJson(manifestPath);
  const records = [];
  const files = [];

  for (const entry of manifest.files ?? []) {
    const path = join(CACHE_DIR, entry.filename);
    if (!existsSync(path)) {
      throw new Error(`EPA cache: manifest lists ${entry.filename} but the file is missing`);
    }
    const text = readFileSync(path, "utf-8");
    const problems = verifyCacheEntry(entry, text, { requiredHeaders: [...COMPACT_COLUMNS] });
    if (problems.length > 0) {
      throw new Error(`EPA cache integrity failure:\n  - ${problems.join("\n  - ")}`);
    }
    const parsed = parseCsv(text).map(parseCompactRow);
    const structural = validateTeamGames(parsed);
    if (structural.length > 0) {
      throw new Error(
        `EPA cache ${entry.filename} failed structural validation:\n  - ${structural.slice(0, 8).join("\n  - ")}`
      );
    }
    records.push(...parsed);
    files.push({
      season: entry.season,
      filename: entry.filename,
      rowCount: entry.rowCount,
      sha256: entry.sha256,
      eligiblePlays: entry.eligiblePlays ?? null,
      upstreamSourceRows: entry.upstreamSourceRows ?? null,
      retrievedDateUtc: entry.retrievedDateUtc,
      sourceUrl: entry.sourceUrl,
    });
  }

  if (records.length === 0) {
    throw new Error("EPA cache contains no team-game rows; refusing to overwrite a known-good artifact");
  }
  return { manifest, records, files };
}

function loadSeason(season) {
  const gamesPath = join(DATA_DIR, String(season), "games.json");
  const resultsPath = join(DATA_DIR, String(season), "results.json");
  if (!existsSync(gamesPath) || !existsSync(resultsPath)) return null;
  return {
    season,
    games: readJson(gamesPath).games ?? [],
    results: readJson(resultsPath).results ?? [],
  };
}

function main() {
  const args = parseArgs(process.argv);
  const teamsJson = readJson(join(DATA_DIR, "teams.json"));
  const abbrs = teamsJson.teams.map((t) => t.abbr).sort();

  const { manifest, records, files } = loadCache();
  const epaIndex = indexTeamGames(records);
  const cachedSeasons = [...new Set(records.map((r) => r.season))].sort();

  // The same completed-game index the Phase 2 generator builds, from the same
  // repository schedule/results — so window membership cannot drift apart.
  const seasons = [PRIOR_SEASON, CURRENT_SEASON].map(loadSeason).filter(Boolean);
  if (seasons.length === 0) throw new Error("no season schedule/results found");
  const displaySeasons = new Set(seasons.map((s) => s.season));
  const completedByTeam = buildCompletedGameIndex(seasons);

  const windows = {};
  const coverage = { requested: 0, resolved: 0, teamsSkippedForMissingEpa: [] };

  for (const { id, mode, includePriorSeason } of WINDOW_SPECS) {
    {
      const teams = {};
      const valuesByMetric = Object.fromEntries(EPA_METRIC_KEYS.map((k) => [k, {}]));

      for (const abbr of abbrs) {
        const teamGames = completedByTeam.get(abbr) ?? [];
        const selected = selectWindowGames(teamGames, {
          mode,
          includePriorSeason,
          currentSeason: CURRENT_SEASON,
          priorSeason: PRIOR_SEASON,
        });
        if (selected.length === 0) continue;

        // Every selected game must have an EPA row. A window built from only
        // some of its games would be quietly wrong, so the team is omitted
        // instead and the gap is recorded.
        const epaRows = [];
        let missing = null;
        for (const game of selected) {
          coverage.requested += 1;
          const row = epaIndex.get(`${game.gameId}|${abbr}`);
          if (!row) { missing = game.gameId; break; }
          coverage.resolved += 1;
          epaRows.push(row);
        }
        if (missing) {
          coverage.teamsSkippedForMissingEpa.push({ window: id, team: abbr, missingGameId: missing });
          continue;
        }

        // Defence is the opponents' offence in those exact same games.
        const opponentRows = epaRows.map((row) => opponentRecord(epaIndex, row));

        const offenseTotals = sumWindow(epaRows);
        const defenseTotals = sumWindow(opponentRows);
        const metrics = windowMetrics(offenseTotals, defenseTotals);

        for (const key of EPA_METRIC_KEYS) {
          if (metrics[key] !== null) valuesByMetric[key][abbr] = metrics[key];
        }

        const last = selected[selected.length - 1];
        teams[abbr] = {
          gamesIncluded: selected.length,
          gameIds: selected.map((g) => g.gameId),
          seasons: [...new Set(selected.map((g) => g.season))].sort(),
          through: { season: last.season, week: last.week, dateUtc: last.dateUtc ?? null },
          raw: metrics,
          totals: {
            offense: offenseTotals,
            defense: defenseTotals,
          },
        };
      }

      // Ranks come from the unrounded values, so display rounding can never
      // move a team. Offense higher-is-better, defense lower-is-better.
      const ranks = Object.fromEntries(
        EPA_METRIC_KEYS.map((key) => [key, computeRanks(valuesByMetric[key], EPA_METRIC_DIRECTIONS[key])])
      );

      for (const [abbr, team] of Object.entries(teams)) {
        team.metrics = Object.fromEntries(
          EPA_METRIC_KEYS.map((key) => [
            key,
            [roundTo(team.raw[key], EPA_DISPLAY_DECIMALS), ranks[key][abbr] ?? null],
          ])
        );
        delete team.raw;
      }

      windows[id] = { mode, includePriorSeason, teams };
    }
  }

  const populated = WINDOW_IDS.filter((id) => Object.keys(windows[id].teams).length > 0);
  if (populated.length === 0) {
    throw new Error("no window produced any team values; refusing to overwrite a known-good artifact");
  }

  const artifact = {
    _meta: buildNflMeta({
      source: NFL_EPA_SOURCE_LABEL,
      season: CURRENT_SEASON,
      week: null,
      notes: [
        "EPA is nflfastR's play-level `epa`, consumed as authoritative; expected points are never recomputed here.",
        `Eligible plays: ${EPA_ELIGIBLE_PLAY_FILTER}.`,
        "nflfastR's own pass/rush indicators are authoritative; play_type is never reinterpreted. Sacks and QB scrambles count as PASS; kneels, spikes and special teams fall out because both indicators are 0; aborted rushes count as RUSH; accepted-penalty plays carrying an indicator are included.",
        "Two-point attempts are the one explicit exclusion.",
        "Window values sum EPA and plays across the selected games and divide once. Per-game rates are never averaged.",
        "Defensive values are the opponents' offensive production in the same game ids, joined exactly — never inferred from team names or schedule order.",
        "Regular season only; postseason never enters a window and preseason does not exist in this source.",
        "Sample windows, chronological ordering and ranking are shared with the Phase 2 conventional generator, so a control state selects the same games in both artifacts.",
        "The `prior-season-full` window is every completed prior-season game (the /nfl/power-ratings 2025 tab); it is not a matchup-analyzer control state.",
        "Success Rate remains RBSDM-sourced and is unaffected by this pipeline.",
        "The internal power-rating EPA in scripts/lib/nfl-advanced-stats.mjs uses different stats_team_week semantics and is deliberately NOT changed by this phase.",
        "No EPA edge, matchup score, projected spread, win probability or picked winner is produced.",
      ],
    }),
    schemaVersion: EPA_SCHEMA_VERSION,
    attribution: NFL_EPA_ATTRIBUTION,
    currentSeason: CURRENT_SEASON,
    priorSeason: PRIOR_SEASON,
    // Seasons that actually feed the display windows, matching what
    // `seasonsUsed` means in the sibling conventional-metrics generator. The
    // cache also holds 2020-2021 for the projected-spread model's beta fit;
    // reporting those here would claim this artifact's EPA rows were built from
    // seasons they never touch.
    seasonsUsed: cachedSeasons.filter((season) => displaySeasons.has(season)),
    metricKeys: [...EPA_METRIC_KEYS],
    metricDirections: EPA_METRIC_DIRECTIONS,
    displayDecimals: EPA_DISPLAY_DECIMALS,
    windows,
    provenance: {
      generatedAt: new Date().toISOString(),
      sourceUrlPattern: "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz",
      eligiblePlayFilter: EPA_ELIGIBLE_PLAY_FILTER,
      rawPlayByPlayCommitted: false,
      /** Every season in the committed cache, including those only the spread model reads. */
      cachedSeasons,
      cacheFiles: files,
      cacheNotPublished: manifest.notPublished ?? [],
      opponentJoinCoverage: {
        requestedTeamGames: coverage.requested,
        resolvedTeamGames: coverage.resolved,
        teamsOmittedForMissingEpa: coverage.teamsSkippedForMissingEpa,
      },
    },
  };

  const counts = WINDOW_IDS.map((id) => `${id}:${Object.keys(windows[id].teams).length}`).join(" ");
  console.log(`[nfl:epa] windows ${counts}`);
  console.log(
    `[nfl:epa] cache seasons=${cachedSeasons.join(",")} team-games=${records.length} ` +
      `selected-game EPA coverage ${coverage.resolved}/${coverage.requested}`
  );
  if (coverage.teamsSkippedForMissingEpa.length > 0) {
    console.log(`[nfl:epa] ${coverage.teamsSkippedForMissingEpa.length} team-windows omitted for missing EPA rows`);
  }

  if (args.dryRun) {
    console.log("[nfl:epa] dry run; nothing written");
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best effort */ }
    }
    throw err;
  }
  console.log(`[nfl:epa] wrote ${OUT_FILE}`);
}

try {
  main();
} catch (err) {
  console.error(`[nfl:epa] FAILED: ${err.message}`);
  console.error("[nfl:epa] existing artifact left untouched");
  process.exit(1);
}
