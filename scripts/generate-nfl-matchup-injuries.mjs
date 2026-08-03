/**
 * Generate public/data/nfl/matchup-injuries.json — normalized NFL injury
 * availability with offensive/defensive snap participation.
 *
 * Reads only the committed cache under data/nfl/nflverse/{injuries,weekly-rosters,
 * snap-counts}; never touches the network. Run
 * scripts/refresh-nfl-injury-source-cache.mjs first to update those bytes.
 *
 * Independent of the Phase 2 conventional-stat generator, the Phase 3A RBSDM
 * generator and the Phase 3B ESPN generator. A failure here can never block any
 * of them, and a missing injury artifact only leaves the Injuries section at an
 * unavailable state.
 *
 * Pipeline: validate cache -> parse -> exact-ID join -> denominator resolution
 * -> aggregate -> validate artifact -> temp file -> atomic rename. A known-good
 * artifact is never replaced by empty, partial or unvalidated output.
 *
 * Attribution: nflverse. Snap counts originate with Pro-Football-Reference.
 *
 * Usage:
 *   node scripts/generate-nfl-matchup-injuries.mjs
 *   node scripts/generate-nfl-matchup-injuries.mjs --season=2025 --week=12
 *   node scripts/generate-nfl-matchup-injuries.mjs --dry-run
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import {
  buildCrosswalk,
  parseInjuryRows,
  parsePlayerRows,
  parseRosterRows,
  parseSnapRows,
} from "./lib/nfl-injury-sources.mjs";
import { resolveAllDenominators } from "./lib/nfl-snap-denominator.mjs";
import {
  RESERVE_RELEVANCE_MIN_SNAP_PCT,
  buildInjuryEntries,
  groupRelevantByTeam,
  summarizeTeam,
} from "./lib/nfl-injury-join.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_ROOT = join(ROOT, "data", "nfl", "nflverse");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const OUT_FILE = join(DATA_DIR, "matchup-injuries.json");

export const INJURY_SCHEMA_VERSION = "nfl-matchup-injuries-v1";

/** The season the site is currently presenting. */
const CURRENT_SEASON = 2026;

/** Minimum share of injury rows that must resolve to a pfr_id. */
const MIN_JOIN_COVERAGE = 0.95;

const SOURCE_LABEL = "nflverse (injuries, weekly_rosters, snap_counts releases)";
const ATTRIBUTION = "nflverse; snap counts originate with Pro-Football-Reference";

const CACHE_DIRS = {
  injuries: "injuries",
  weeklyRosters: "weekly-rosters",
  snapCounts: "snap-counts",
  players: "players",
};

/** Season-scoped sources. players.csv is league-wide (season: null). */
const SEASON_SOURCES = ["injuries", "weeklyRosters", "snapCounts"];

const REQUIRED_HEADERS = {
  injuries: ["season", "season_type", "team", "week", "gsis_id", "position", "report_status", "practice_status"],
  weeklyRosters: ["season", "week", "game_type", "team", "gsis_id", "pfr_id", "status"],
  snapCounts: ["game_id", "season", "game_type", "week", "pfr_player_id", "offense_snaps", "offense_pct", "defense_snaps", "defense_pct"],
  players: ["gsis_id", "pfr_id", "espn_id", "display_name", "position"],
};

function parseArgs(argv) {
  const args = { season: null, week: null, dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (args.season != null && !Number.isInteger(args.season)) throw new Error("--season must be an integer");
  if (args.week != null && !Number.isInteger(args.week)) throw new Error("--week must be an integer");
  return args;
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

/**
 * Load one cached source for a season, verifying it against its manifest.
 * Returns null when the season is not cached — an expected state before a
 * season starts, distinct from a corrupt or missing file that IS cached.
 */
function loadCachedSource(key, season) {
  const dir = join(CACHE_ROOT, CACHE_DIRS[key]);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`${key}: cache manifest missing at ${manifestPath}; run refresh-nfl-injury-source-cache.mjs`);
  }
  const manifest = readJson(manifestPath);
  const entry = (manifest.files ?? []).find((file) => file.season === season);
  if (!entry) return null;


  const path = join(dir, entry.filename);
  if (!existsSync(path)) {
    throw new Error(`${key} ${season}: manifest lists ${entry.filename} but the file is missing`);
  }
  const text = readFileSync(path, "utf-8");
  const problems = verifyCacheEntry(entry, text, { requiredHeaders: REQUIRED_HEADERS[key] });
  if (problems.length > 0) {
    throw new Error(`${key} ${season}: cache integrity failure:\n  - ${problems.join("\n  - ")}`);
  }
  return { entry, rows: parseCsv(text) };
}

/** Which seasons have all three season-scoped sources cached and intact. */
function resolveAvailability(seasons) {
  const availability = [];
  for (const season of seasons) {
    const sources = {};
    for (const key of SEASON_SOURCES) {
      sources[key] = loadCachedSource(key, season) != null;
    }
    availability.push({
      season,
      injuries: sources.injuries,
      weeklyRosters: sources.weeklyRosters,
      snapCounts: sources.snapCounts,
      complete: SEASON_SOURCES.every((key) => sources[key]),
    });
  }
  return availability;
}

function buildTeamAbbrMap(teamsJson) {
  const map = new Map();
  for (const team of teamsJson.teams ?? []) {
    map.set(team.nflverseAbbr, { abbr: team.abbr, slug: team.slug, name: team.name });
  }
  if (map.size !== 32) throw new Error(`teams.json must supply 32 teams, got ${map.size}`);
  return map;
}

function buildSeason(season, week, teamAbbrMap) {
  const injuriesSource = loadCachedSource("injuries", season);
  const rosterSource = loadCachedSource("weeklyRosters", season);
  const snapSource = loadCachedSource("snapCounts", season);
  const playersSource = loadCachedSource("players", null);
  if (!injuriesSource || !rosterSource || !snapSource) {
    throw new Error(`season ${season}: one or more sources are not cached`);
  }
  if (!playersSource) {
    throw new Error("players crosswalk is not cached; run refresh-nfl-injury-source-cache.mjs");
  }

  const injuries = parseInjuryRows(injuriesSource.rows, { season });
  const rosters = parseRosterRows(rosterSource.rows, { season });
  const snaps = parseSnapRows(snapSource.rows, { season });
  const players = parsePlayerRows(playersSource.rows);

  if (injuries.rows.length === 0) throw new Error(`season ${season}: no regular-season injury rows`);
  if (snaps.rows.length === 0) throw new Error(`season ${season}: no regular-season snap rows`);

  const targetWeek = week ?? Math.max(...injuries.rows.map((row) => row.week));

  const { crosswalk, conflicts } = buildCrosswalk(rosters.rows, players.rows);
  const { denominators, failures, resolvedCount, teamGameCount } = resolveAllDenominators(snaps.rows);

  // A denominator that cannot be pinned to a unique integer is a validation
  // failure, never an estimate. The known-good artifact is preserved instead.
  if (failures.length > 0) {
    const sample = failures
      .slice(0, 5)
      .map((f) => `${f.gameId} ${f.team} ${f.unit}: ${f.status} (candidates ${f.candidates.join("/") || "none"})`)
      .join("\n  - ");
    throw new Error(
      `season ${season}: ${failures.length} team-game denominators did not resolve uniquely:\n  - ${sample}`
    );
  }

  const { entries, join } = buildInjuryEntries({
    injuryRows: injuries.rows,
    rosterRows: rosters.rows,
    snapRows: snaps.rows,
    crosswalk,
    denominators,
    week: targetWeek,
  });

  if (entries.length === 0) {
    throw new Error(`season ${season} week ${targetWeek}: no injury records; refusing to publish an empty artifact`);
  }
  const coverage = join.total > 0 ? join.resolved / join.total : 0;
  if (coverage < MIN_JOIN_COVERAGE) {
    throw new Error(
      `season ${season} week ${targetWeek}: gsis->pfr join coverage ${(coverage * 100).toFixed(2)}% ` +
        `is below the ${(MIN_JOIN_COVERAGE * 100).toFixed(0)}% floor; refusing to publish`
    );
  }

  const grouped = groupRelevantByTeam(entries);
  const teams = {};
  for (const [nflverseAbbr, list] of grouped) {
    const mapped = teamAbbrMap.get(nflverseAbbr);
    if (!mapped) throw new Error(`season ${season}: unknown team code "${nflverseAbbr}"`);
    teams[mapped.abbr] = {
      nflverseAbbr,
      summary: summarizeTeam(list),
      entries: list.map((entry) => ({
        playerId: entry.playerId,
        gsisId: entry.gsisId,
        pfrId: entry.pfrId,
        espnId: entry.espnId,
        playerName: entry.playerName,
        position: entry.position,
        depthChartPosition: entry.depthChartPosition,
        unit: entry.unit,
        gameStatus: entry.gameStatus,
        practiceStatus: entry.practiceStatus,
        reserveStatus: entry.reserveStatus,
        injuryDescription: entry.injuryDescription,
        snaps: entry.snaps,
        provenance: entry.provenance,
      })),
    };
  }

  return {
    season,
    week: targetWeek,
    teams,
    stats: {
      injuryRowsParsed: injuries.rows.length,
      injuryRowsSkipped: injuries.skipped,
      rosterRowsParsed: rosters.rows.length,
      snapRowsParsed: snaps.rows.length,
      entriesForWeek: entries.length,
      entriesShown: Object.values(teams).reduce((sum, team) => sum + team.entries.length, 0),
      teamsWithEntries: Object.keys(teams).length,
    },
    join: {
      path: "injuries.gsis_id -> weekly_rosters.gsis_id -> weekly_rosters.pfr_id -> snap_counts.pfr_player_id",
      total: join.total,
      resolved: join.resolved,
      unresolved: join.unresolved,
      coveragePct: Number((coverage * 100).toFixed(4)),
      crosswalkSize: crosswalk.size,
      crosswalkConflicts: conflicts,
      unresolvedPlayers: join.unresolvedPlayers,
    },
    denominators: {
      teamGames: teamGameCount,
      unitsResolved: resolvedCount,
      failures,
    },
    sourceFiles: {
      injuries: injuriesSource.entry,
      weeklyRosters: rosterSource.entry,
      snapCounts: snapSource.entry,
      players: playersSource.entry,
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  const teamAbbrMap = buildTeamAbbrMap(readJson(join(DATA_DIR, "teams.json")));

  const candidateSeasons = args.season != null ? [args.season] : [CURRENT_SEASON, CURRENT_SEASON - 1];
  const availability = resolveAvailability([CURRENT_SEASON, CURRENT_SEASON - 1]);

  const usable = candidateSeasons.find(
    (season) => availability.find((row) => row.season === season)?.complete
  );
  if (usable == null) {
    throw new Error(
      "No season has a complete injury/roster/snap cache; refusing to overwrite a known-good artifact"
    );
  }

  const built = buildSeason(usable, args.week, teamAbbrMap);
  const currentAvailable = availability.find((row) => row.season === CURRENT_SEASON)?.complete === true;

  const artifact = {
    _meta: buildNflMeta({
      source: SOURCE_LABEL,
      season: built.season,
      week: built.week,
      notes: [
        "Game status, practice status and reserve status are separate fields and are never merged.",
        "Reserve is generic: nflverse publishes no authoritative dictionary for its RES/* sub-codes, so IR, PUP and NFI are not distinguished.",
        "Last-game percentages are the source-published offense_pct/defense_pct, consumed verbatim.",
        "Season percentages sum snaps and team snaps exactly; weekly percentages are never averaged.",
        "Team snap denominators are reconstructed as the unique integer satisfying every published player percentage in that team-game. max(player snaps) is not used.",
        "Season share covers regular-season games the player dressed for; games he missed are excluded from both numerator and denominator.",
        "Special-teams snaps are never used for relevance, ordering or percentages.",
        "K, P and LS are excluded entirely.",
        "No injury impact score, points-lost estimate, spread adjustment or win-probability effect is produced.",
      ],
    }),
    schemaVersion: INJURY_SCHEMA_VERSION,
    attribution: ATTRIBUTION,

    currentSeason: CURRENT_SEASON,
    dataSeason: built.season,
    dataWeek: built.week,
    /** True when the data shown predates the season the site is presenting. */
    isHistorical: built.season !== CURRENT_SEASON,

    availability: {
      currentSeasonAvailable: currentAvailable,
      reason: currentAvailable
        ? null
        : `nflverse has not published injuries_${CURRENT_SEASON}.csv / snap_counts_${CURRENT_SEASON}.csv yet`,
      seasons: availability,
    },

    relevance: {
      rule: "Any OUT/DOUBTFUL/QUESTIONABLE designation is shown. RESERVE players require offensive/defensive snap evidence.",
      reserveMinSnapPct: RESERVE_RELEVANCE_MIN_SNAP_PCT,
    },

    teams: built.teams,

    provenance: {
      retrievedAt: new Date().toISOString(),
      join: built.join,
      denominators: built.denominators,
      stats: built.stats,
      sourceFiles: built.sourceFiles,
    },
  };

  console.log(
    `[nfl:injuries] season=${built.season} week=${built.week} teams=${built.stats.teamsWithEntries} ` +
      `shown=${built.stats.entriesShown}/${built.stats.entriesForWeek} ` +
      `join=${built.join.coveragePct}% denominators=${built.denominators.unitsResolved}/${built.denominators.teamGames * 2}`
  );
  if (!currentAvailable) {
    console.log(`[nfl:injuries] ${CURRENT_SEASON} sources not yet published; artifact marked historical`);
  }

  if (args.dryRun) {
    console.log("[nfl:injuries] dry run; nothing written");
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
  console.log(`[nfl:injuries] wrote ${OUT_FILE}`);
}

main();
