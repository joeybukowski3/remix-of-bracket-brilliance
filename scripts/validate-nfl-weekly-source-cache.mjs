/**
 * Offline integrity validation for the committed nflverse team-week cache.
 *
 * This module never fetches data. It verifies the immutable source bytes,
 * provenance manifest, Phase 3 aggregation paths, and checked-in production
 * team-stat compatibility.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  NFL_TEAM_STATS_SOURCE_LABEL,
  aggregateAdvancedTeamMetrics,
  computeAdvancedTeamMetrics,
  nflTeamStatsUrl,
  parseAdvancedTeamStatRows,
} from "./lib/nfl-advanced-stats.mjs";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const NFL_WEEKLY_SOURCE_CACHE_SEASONS = Object.freeze([2022, 2023, 2024, 2025]);
export const NFL_WEEKLY_SOURCE_CACHE_RELATIVE_DIR =
  "data/nfl/nflverse/stats-team-week";
export const NFL_WEEKLY_SOURCE_MANIFEST_VERSION = "nfl-weekly-source-cache-v1";

export const NFL_WEEKLY_SOURCE_REQUIRED_HEADERS = Object.freeze([
  "season",
  "week",
  "season_type",
  "team",
  "opponent_team",
  "attempts",
  "sacks_suffered",
  "carries",
  "passing_yards",
  "rushing_yards",
  "passing_interceptions",
  "sack_fumbles_lost",
  "rushing_fumbles_lost",
  "receiving_fumbles_lost",
  "passing_epa",
  "rushing_epa",
  "def_interceptions",
  "fumble_recovery_opp",
]);

const NUMERIC_FIELDS = Object.freeze([
  "attempts",
  "sacks_suffered",
  "carries",
  "passing_yards",
  "rushing_yards",
  "passing_interceptions",
  "sack_fumbles_lost",
  "rushing_fumbles_lost",
  "receiving_fumbles_lost",
  "passing_epa",
  "rushing_epa",
  "def_interceptions",
  "fumble_recovery_opp",
]);

export const NFL_WEEKLY_SOURCE_LEGACY_FIELDS = Object.freeze([
  "offensiveEpaPerPlay",
  "defensiveEpaPerPlay",
  "yardsPerPlay",
  "yardsAllowedPerPlay",
  "offensivePlays",
  "defensivePlays",
  "turnovers",
  "takeaways",
  "turnoverDifferential",
]);

const FORBIDDEN_COLUMN =
  /(^|_)(betting|odds?|spread|moneyline|picks?|market|probability)($|_)/i;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function canonicalNflverseTeams(teamsJson) {
  invariant(
    Array.isArray(teamsJson?.teams) && teamsJson.teams.length === 32,
    "teams.json must contain 32 canonical teams"
  );
  return new Set(teamsJson.teams.map((team) => team.nflverseAbbr));
}

function plainLegacyMetrics(metrics) {
  return Object.fromEntries(
    [...metrics.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([team, values]) => [
        team,
        Object.fromEntries(
          NFL_WEEKLY_SOURCE_LEGACY_FIELDS.map((field) => [field, values[field]])
        ),
      ])
  );
}

function metricMismatches(expected, actual, labels) {
  const mismatches = [];
  for (const team of Object.keys(expected).sort((a, b) => a.localeCompare(b))) {
    for (const field of NFL_WEEKLY_SOURCE_LEGACY_FIELDS) {
      if (!Object.is(expected[team]?.[field], actual[team]?.[field])) {
        mismatches.push({
          team,
          field,
          [labels.expected]: expected[team]?.[field],
          [labels.actual]: actual[team]?.[field],
        });
      }
    }
  }
  return mismatches;
}

function assertFiniteNumbers(value, label) {
  if (typeof value === "number") {
    invariant(Number.isFinite(value), `${label} contains NaN or Infinity`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteNumbers(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertFiniteNumbers(entry, `${label}.${key}`);
    }
  }
}

/** Parse and validate one cached CSV without reading files or making network calls. */
export function analyzeNflWeeklySourceCsv(csvText, season, teamsJson) {
  invariant(typeof csvText === "string" && csvText.length > 0, `${season} CSV is empty`);
  invariant(
    Number.isInteger(season) && NFL_WEEKLY_SOURCE_CACHE_SEASONS.includes(season),
    `Unsupported cache season ${season}`
  );

  const rows = parseCsv(csvText);
  invariant(rows.length > 0, `${season} CSV parsed to zero rows`);
  const headerColumns = Object.keys(rows[0]);
  for (const field of NFL_WEEKLY_SOURCE_REQUIRED_HEADERS) {
    invariant(headerColumns.includes(field), `${season} CSV is missing required header ${field}`);
  }
  const forbiddenColumns = headerColumns.filter((column) => FORBIDDEN_COLUMN.test(column));
  invariant(
    forbiddenColumns.length === 0,
    `${season} CSV has forbidden columns: ${forbiddenColumns.join(", ")}`
  );

  const knownTeams = canonicalNflverseTeams(teamsJson);
  const seenKeys = new Set();
  const rawByKey = new Map();
  for (const [index, row] of rows.entries()) {
    const label = `${season} row ${index + 1}`;
    invariant(Number(row.season) === season, `${label} has unexpected season ${row.season}`);
    invariant(Number.isInteger(Number(row.week)) && Number(row.week) > 0, `${label} has invalid week`);
    for (const field of ["season_type", "team", "opponent_team"]) {
      invariant(isNonEmptyString(row[field]), `${label} is missing ${field}`);
    }
    invariant(knownTeams.has(row.team), `${label} has unknown team ${row.team}`);
    invariant(knownTeams.has(row.opponent_team), `${label} has unknown opponent ${row.opponent_team}`);
    for (const field of NUMERIC_FIELDS) {
      invariant(
        row[field] !== "" && row[field] !== "NA" && Number.isFinite(Number(row[field])),
        `${label} has invalid numeric ${field}=${row[field]}`
      );
    }

    const key = `${row.season}|${row.season_type}|${row.week}|${row.team}`;
    invariant(!seenKeys.has(key), `${season} CSV has duplicate key ${key}`);
    seenKeys.add(key);
    rawByKey.set(key, row);
  }

  for (const row of rows) {
    const opponentKey = `${row.season}|${row.season_type}|${row.week}|${row.opponent_team}`;
    const opponent = rawByKey.get(opponentKey);
    invariant(
      opponent && opponent.opponent_team === row.team,
      `${season} CSV is missing reciprocal opponent row for ${row.season_type} week ${row.week} ${row.team}-${row.opponent_team}`
    );
  }

  const seasonTypes = sortedUnique(rows.map((row) => row.season_type));
  invariant(seasonTypes.includes("REG"), `${season} CSV has no REG rows`);

  const normalizedRows = parseAdvancedTeamStatRows(csvText, teamsJson, { season });
  const regularRows = normalizedRows.filter((row) => row.seasonType === "REG");
  const teamWeekKeys = regularRows.map((row) => ({
    season: row.season,
    week: row.week,
    team: row.team,
  }));
  const subset = aggregateAdvancedTeamMetrics(normalizedRows, {
    season,
    teamsJson,
    teamWeekKeys,
  });
  const legacy = computeAdvancedTeamMetrics(csvText, season, teamsJson);
  invariant(legacy instanceof Map, `${season} legacy aggregation is unavailable`);
  invariant(legacy.size === 32, `${season} legacy aggregation produced ${legacy.size} teams`);
  invariant(subset.size === 32, `${season} subset aggregation produced ${subset.size} teams`);

  const legacyMetrics = plainLegacyMetrics(legacy);
  const subsetMetrics = plainLegacyMetrics(subset);
  const subsetMismatches = metricMismatches(legacyMetrics, subsetMetrics, {
    expected: "legacyValue",
    actual: "subsetValue",
  });
  invariant(
    subsetMismatches.length === 0,
    `${season} all-REG subset differs from legacy aggregation: ${JSON.stringify(subsetMismatches)}`
  );
  assertFiniteNumbers(legacyMetrics, `${season} legacy metrics`);
  assertFiniteNumbers(subsetMetrics, `${season} subset metrics`);

  return {
    season,
    rowCount: rows.length,
    headerColumns,
    seasonTypes,
    minimumWeek: Math.min(...rows.map((row) => Number(row.week))),
    maximumWeek: Math.max(...rows.map((row) => Number(row.week))),
    observedTeams: sortedUnique(rows.map((row) => row.team)),
    hasRegularSeason: true,
    hasPostseason: seasonTypes.includes("POST"),
    duplicateKeyCount: 0,
    reciprocalOpponentFailureCount: 0,
    legacyTeamCount: legacy.size,
    subsetTeamCount: subset.size,
    subsetMatchesLegacy: true,
    forbiddenColumns,
    legacyMetrics,
  };
}

function validateManifestShape(manifest) {
  invariant(
    manifest?.schemaVersion === NFL_WEEKLY_SOURCE_MANIFEST_VERSION,
    `manifest schemaVersion must be ${NFL_WEEKLY_SOURCE_MANIFEST_VERSION}`
  );
  invariant(Array.isArray(manifest.files), "manifest files must be an array");
  invariant(
    manifest.files.length === NFL_WEEKLY_SOURCE_CACHE_SEASONS.length,
    `manifest must contain ${NFL_WEEKLY_SOURCE_CACHE_SEASONS.length} files`
  );
  const seasons = manifest.files.map((entry) => entry.season);
  invariant(
    JSON.stringify(seasons) === JSON.stringify(NFL_WEEKLY_SOURCE_CACHE_SEASONS),
    "manifest seasons must be ordered 2022 through 2025"
  );
}

function compareProductionMetrics(rootDir, season, legacyMetrics) {
  const artifactPath = join(
    rootDir,
    "public",
    "data",
    "nfl",
    String(season),
    "team-stats.json"
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  invariant(Array.isArray(artifact.teamStats), `${season} team-stats.json is malformed`);
  const production = Object.fromEntries(
    artifact.teamStats.map((team) => [
      team.abbr,
      Object.fromEntries(
        NFL_WEEKLY_SOURCE_LEGACY_FIELDS.map((field) => [field, team[field]])
      ),
    ])
  );
  return metricMismatches(legacyMetrics, production, {
    expected: "newlyAggregatedValue",
    actual: "checkedInArtifactValue",
  }).map((mismatch) => ({ season, ...mismatch }));
}

/** Validate all committed cache files, manifest entries, and production parity. */
export function validateNflWeeklySourceCache({ rootDir = ROOT } = {}) {
  const cacheDir = join(rootDir, ...NFL_WEEKLY_SOURCE_CACHE_RELATIVE_DIR.split("/"));
  const manifestPath = join(cacheDir, "manifest.json");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  validateManifestShape(manifest);
  invariant(
    !/(^|["\s])[A-Za-z]:[\\/]/m.test(manifestBytes.toString("utf8")),
    "manifest must not contain local absolute paths"
  );

  const teamsJson = JSON.parse(
    readFileSync(join(rootDir, "public", "data", "nfl", "teams.json"), "utf8")
  );
  const files = [];
  const productionMismatches = [];

  for (const entry of manifest.files) {
    const { season } = entry;
    const expectedFilename = `stats_team_week_${season}.csv`;
    invariant(entry.filename === expectedFilename, `${season} manifest filename is invalid`);
    invariant(entry.sourceUrl === nflTeamStatsUrl(season), `${season} source URL is not canonical`);
    invariant(
      entry.sourceLabel === NFL_TEAM_STATS_SOURCE_LABEL,
      `${season} source label is invalid`
    );
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(entry.retrievedDateUtc), `${season} retrieval date is invalid`);

    const filePath = join(cacheDir, entry.filename);
    const sourceBytes = readFileSync(filePath);
    invariant(sourceBytes.length > 0, `${season} source file is empty`);
    const checksumBefore = sha256(sourceBytes);
    invariant(sourceBytes.length === entry.byteSize, `${season} byte size does not match manifest`);
    invariant(checksumBefore === entry.sha256, `${season} SHA-256 does not match manifest`);

    const csvText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
    const analysis = analyzeNflWeeklySourceCsv(csvText, season, teamsJson);
    const checksumAfter = sha256(readFileSync(filePath));
    invariant(checksumAfter === checksumBefore, `${season} source bytes changed during validation`);
    invariant(analysis.rowCount === entry.rowCount, `${season} row count does not match manifest`);
    invariant(
      JSON.stringify(analysis.headerColumns) === JSON.stringify(entry.headerColumns),
      `${season} header columns do not match manifest`
    );
    invariant(
      JSON.stringify(analysis.seasonTypes) === JSON.stringify(entry.seasonTypes),
      `${season} season types do not match manifest`
    );
    invariant(analysis.minimumWeek === entry.minimumWeek, `${season} minimum week mismatch`);
    invariant(analysis.maximumWeek === entry.maximumWeek, `${season} maximum week mismatch`);
    invariant(
      JSON.stringify(analysis.observedTeams) === JSON.stringify(entry.observedTeams),
      `${season} observed teams do not match manifest`
    );

    const mismatches = compareProductionMetrics(rootDir, season, analysis.legacyMetrics);
    productionMismatches.push(...mismatches);
    files.push({
      season,
      filename: entry.filename,
      sourceUrl: entry.sourceUrl,
      byteSize: sourceBytes.length,
      sha256: checksumBefore,
      rowCount: analysis.rowCount,
      headerColumnCount: analysis.headerColumns.length,
      seasonTypes: analysis.seasonTypes,
      minimumWeek: analysis.minimumWeek,
      maximumWeek: analysis.maximumWeek,
      observedTeamCount: analysis.observedTeams.length,
      hasRegularSeason: analysis.hasRegularSeason,
      hasPostseason: analysis.hasPostseason,
      duplicateKeyCount: analysis.duplicateKeyCount,
      reciprocalOpponentFailureCount: analysis.reciprocalOpponentFailureCount,
      legacyTeamCount: analysis.legacyTeamCount,
      subsetTeamCount: analysis.subsetTeamCount,
      subsetMatchesLegacy: analysis.subsetMatchesLegacy,
      forbiddenColumns: analysis.forbiddenColumns,
      sourceUnmodified: checksumAfter === checksumBefore,
      productionMismatchCount: mismatches.length,
    });
  }

  invariant(
    productionMismatches.length === 0,
    `Cached sources differ from checked-in team-stats.json: ${JSON.stringify(productionMismatches)}`
  );
  const result = {
    valid: true,
    manifestVersion: manifest.schemaVersion,
    cacheDirectory: NFL_WEEKLY_SOURCE_CACHE_RELATIVE_DIR,
    files,
    productionMismatches,
  };
  assertFiniteNumbers(result, "validation result");
  return result;
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
  try {
    console.log(JSON.stringify(validateNflWeeklySourceCache(), null, 2));
  } catch (error) {
    console.error(`[nfl:weekly-source-cache] FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
