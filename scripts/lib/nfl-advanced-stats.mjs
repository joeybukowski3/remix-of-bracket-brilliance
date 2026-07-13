/**
 * Advanced team metrics from free nflverse team-week stats (PR-8).
 *
 * Source (no API key, ~185 KB per season):
 *   https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_<season>.csv
 *
 * Chosen as the lightest reliable source: one row per team-week with
 * offensive EPA (passing_epa + rushing_epa), yardage, play inputs and
 * turnover columns, plus opponent_team — which lets defensive EPA/yards be
 * derived by summing what each opponent's offense produced against a team.
 * Success rates are NOT in this source (they need full play-by-play, which
 * is too heavy for the default workflow) and stay null.
 *
 * No betting columns exist in this source; none are read anywhere.
 */

import { parseCsv } from "./nfl-schedules-results-core.mjs";

export const NFL_TEAM_STATS_SOURCE_LABEL = "nflverse (stats_team weekly release)";
export const nflTeamStatsUrl = (season) =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${season}.csv`;

const NUMERIC_FIELDS = [
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
];

const LEGACY_METRIC_KEYS = [
  "offensiveEpaPerPlay",
  "defensiveEpaPerPlay",
  "yardsPerPlay",
  "yardsAllowedPerPlay",
  "offensivePlays",
  "defensivePlays",
  "turnovers",
  "takeaways",
  "turnoverDifferential",
];

const round = (value, digits = 4) => Number(value.toFixed(digits));

function canonicalTeams(teamsJson) {
  const teams = teamsJson?.teams;
  if (!Array.isArray(teams) || teams.length !== 32) {
    throw new Error("teams.json is malformed: expected 32 canonical teams");
  }
  return teams;
}

function parseInteger(raw, field, label) {
  const value = Number(raw);
  if (raw === "" || raw == null || !Number.isInteger(value) || value < 1) {
    throw new Error(`Malformed ${field} "${raw ?? ""}" in ${label}`);
  }
  return value;
}

function parseFiniteNumber(raw, field, label) {
  if (raw === "" || raw == null || raw === "NA") {
    throw new Error(`Missing required numeric field "${field}" in ${label}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Malformed numeric field "${field}" value "${raw}" in ${label}`);
  }
  return value;
}

function sourceRowLabel(row, index) {
  return `stats_team row ${index + 1} (${row.season || "unknown season"}, week ${row.week || "unknown"}, ${row.team || "unknown team"})`;
}

/**
 * Parse team-week source rows into a normalized, reusable representation.
 * Omit filters to retain every season type; filters are applied before strict
 * validation so the legacy season/REG path keeps ignoring unrelated rows.
 */
export function parseAdvancedTeamStatRows(csvText, teamsJson, { season = null, seasonType = null } = {}) {
  if (!csvText) return [];
  const teams = canonicalTeams(teamsJson);
  const byNflverse = new Map(teams.map((team) => [team.nflverseAbbr, team]));
  const rawRows = parseCsv(csvText).filter(
    (row) =>
      (season == null || Number(row.season) === season) &&
      (seasonType == null || row.season_type === seasonType)
  );

  return rawRows.map((row, index) => {
    const label = sourceRowLabel(row, index);
    const normalizedSeason = parseInteger(row.season, "season", label);
    const week = parseInteger(row.week, "week", label);
    if (typeof row.season_type !== "string" || row.season_type.length === 0) {
      throw new Error(`Malformed season_type in ${label}`);
    }

    const team = byNflverse.get(row.team);
    if (!team) {
      throw new Error(`Unknown nflverse team code "${row.team}" in stats_team_week ${normalizedSeason}`);
    }
    const opponent = byNflverse.get(row.opponent_team);
    if (!opponent) {
      throw new Error(`Unknown opponent code "${row.opponent_team}" in stats_team_week ${normalizedSeason}`);
    }

    const numeric = Object.fromEntries(
      NUMERIC_FIELDS.map((field) => [field, parseFiniteNumber(row[field], field, label)])
    );

    return Object.freeze({
      season: normalizedSeason,
      week,
      seasonType: row.season_type,
      team: team.abbr,
      opponent: opponent.abbr,
      nflverseTeam: row.team,
      nflverseOpponent: row.opponent_team,
      attempts: numeric.attempts,
      sacksSuffered: numeric.sacks_suffered,
      carries: numeric.carries,
      passingYards: numeric.passing_yards,
      rushingYards: numeric.rushing_yards,
      passingInterceptions: numeric.passing_interceptions,
      sackFumblesLost: numeric.sack_fumbles_lost,
      rushingFumblesLost: numeric.rushing_fumbles_lost,
      receivingFumblesLost: numeric.receiving_fumbles_lost,
      passingEpa: numeric.passing_epa,
      rushingEpa: numeric.rushing_epa,
      defensiveInterceptions: numeric.def_interceptions,
      opponentFumbleRecoveries: numeric.fumble_recovery_opp,
      source: Object.freeze({ ...row }),
    });
  });
}

function normalizedRowKey(row) {
  return `${row.season}|${row.week}|${row.team}`;
}

function selectorKey(key) {
  return `${key.season}|${key.week}|${key.team}`;
}

function selectorLabel(key) {
  return `${key.season}:week-${key.week}:${key.team}`;
}

function validateSelectorKey(key, index, season, byAbbr) {
  if (!key || typeof key !== "object" || Array.isArray(key)) {
    throw new Error(`Selector key at index ${index} must be an object`);
  }
  if (!Number.isInteger(key.season) || key.season !== season) {
    throw new Error(`Selector key at index ${index} must use season ${season}`);
  }
  if (!Number.isInteger(key.week) || key.week < 1) {
    throw new Error(`Selector key at index ${index} has invalid week "${key.week}"`);
  }
  if (typeof key.team !== "string" || !byAbbr.has(key.team)) {
    throw new Error(`Unknown team abbreviation "${key.team}" in selector key at index ${index}`);
  }
}

function requireNormalizedRow(row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`Normalized stats row at index ${index} must be an object`);
  }
  const requiredStrings = ["seasonType", "team", "opponent", "nflverseTeam", "nflverseOpponent"];
  if (!Number.isInteger(row.season) || row.season < 1 || !Number.isInteger(row.week) || row.week < 1) {
    throw new Error(`Malformed normalized stats row at index ${index}`);
  }
  for (const field of requiredStrings) {
    if (typeof row[field] !== "string" || row[field].length === 0) {
      throw new Error(`Malformed normalized field "${field}" at row index ${index}`);
    }
  }
  const requiredNumbers = [
    "attempts",
    "sacksSuffered",
    "carries",
    "passingYards",
    "rushingYards",
    "passingInterceptions",
    "sackFumblesLost",
    "rushingFumblesLost",
    "receivingFumblesLost",
    "passingEpa",
    "rushingEpa",
    "defensiveInterceptions",
    "opponentFumbleRecoveries",
  ];
  for (const field of requiredNumbers) {
    if (typeof row[field] !== "number" || !Number.isFinite(row[field])) {
      throw new Error(`Malformed normalized numeric field "${field}" at row index ${index}`);
    }
  }
}

function addOffense(accumulator, row) {
  const passingPlays = row.attempts + row.sacksSuffered;
  const offensivePlays = passingPlays + row.carries;
  accumulator.gamesRepresented += 1;
  accumulator.weeksRepresented.push(row.week);
  accumulator.offEpa += row.passingEpa + row.rushingEpa;
  accumulator.passingEpa += row.passingEpa;
  accumulator.rushingEpa += row.rushingEpa;
  accumulator.offPlays += offensivePlays;
  accumulator.passingPlays += passingPlays;
  accumulator.rushingPlays += row.carries;
  accumulator.offYards += row.passingYards + row.rushingYards;
  accumulator.turnovers +=
    row.passingInterceptions +
    row.sackFumblesLost +
    row.rushingFumblesLost +
    row.receivingFumblesLost;
  accumulator.takeaways += row.defensiveInterceptions + row.opponentFumbleRecoveries;
}

function addDefense(accumulator, opponentRow) {
  accumulator.defEpa += opponentRow.passingEpa + opponentRow.rushingEpa;
  accumulator.defPlays += opponentRow.attempts + opponentRow.sacksSuffered + opponentRow.carries;
  accumulator.defYards += opponentRow.passingYards + opponentRow.rushingYards;
}

function ratioOrNull(numerator, denominator, digits = 4) {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  if (!Number.isFinite(value)) throw new Error("Advanced metric aggregation produced a non-finite value");
  return round(value, digits);
}

function emptyAccumulator() {
  return {
    gamesRepresented: 0,
    weeksRepresented: [],
    offEpa: 0,
    passingEpa: 0,
    rushingEpa: 0,
    offPlays: 0,
    passingPlays: 0,
    rushingPlays: 0,
    offYards: 0,
    defEpa: 0,
    defPlays: 0,
    defYards: 0,
    turnovers: 0,
    takeaways: 0,
  };
}

/**
 * Purely aggregate normalized rows for one season and season type.
 * `teamWeekKeys`, when supplied, must be non-empty canonical
 * `{ season, week, team }` keys. Opponent rows are lookup inputs for defense;
 * they need not also be selected for the opponent's own output.
 * Passing EPA/play uses attempts + sacks suffered; rushing EPA/play uses
 * carries. Overall offense keeps the legacy sum of those play denominators.
 */
export function aggregateAdvancedTeamMetrics(
  rows,
  { season, teamsJson, seasonType = "REG", teamWeekKeys = null } = {}
) {
  if (!Array.isArray(rows)) throw new Error("aggregateAdvancedTeamMetrics: rows must be an array");
  if (!Number.isInteger(season) || season < 1) {
    throw new Error("aggregateAdvancedTeamMetrics: season must be a positive integer");
  }
  if (typeof seasonType !== "string" || seasonType.length === 0) {
    throw new Error("aggregateAdvancedTeamMetrics: seasonType is required");
  }

  const teams = canonicalTeams(teamsJson);
  const byAbbr = new Map(teams.map((team) => [team.abbr, team]));
  const seasonRows = [];
  const rowByKey = new Map();
  rows.forEach((row, index) => {
    requireNormalizedRow(row, index);
    if (row.season !== season || row.seasonType !== seasonType) return;
    if (!byAbbr.has(row.team)) {
      throw new Error(`Unknown team abbreviation "${row.team}" in normalized stats rows`);
    }
    if (!byAbbr.has(row.opponent)) {
      throw new Error(`Unknown opponent abbreviation "${row.opponent}" in normalized stats rows`);
    }
    const key = normalizedRowKey(row);
    if (rowByKey.has(key)) {
      throw new Error(`Duplicate source row for ${selectorLabel(row)}`);
    }
    rowByKey.set(key, row);
    seasonRows.push(row);
  });

  let selectedRows;
  if (teamWeekKeys == null) {
    selectedRows = seasonRows;
  } else {
    if (!Array.isArray(teamWeekKeys) || teamWeekKeys.length === 0) {
      throw new Error("teamWeekKeys must be a non-empty array");
    }
    const seen = new Set();
    const missing = [];
    selectedRows = [];
    teamWeekKeys.forEach((key, index) => {
      validateSelectorKey(key, index, season, byAbbr);
      const normalizedKey = selectorKey(key);
      if (seen.has(normalizedKey)) {
        throw new Error(`Duplicate selector key ${selectorLabel(key)}`);
      }
      seen.add(normalizedKey);
      const row = rowByKey.get(normalizedKey);
      if (row) selectedRows.push(row);
      else missing.push(selectorLabel(key));
    });
    if (missing.length > 0) {
      throw new Error(`Missing requested team-week rows: ${missing.sort().join(", ")}`);
    }
  }

  if (selectedRows.length === 0) {
    if (teamWeekKeys == null) return new Map();
    throw new Error("Selected advanced-stat subset contains no rows");
  }

  selectedRows = selectedRows
    .slice()
    .sort((a, b) => a.week - b.week || a.team.localeCompare(b.team));
  const acc = new Map();
  for (const row of selectedRows) {
    const opponentKey = `${row.season}|${row.week}|${row.opponent}`;
    const opponentRow = rowByKey.get(opponentKey);
    if (!opponentRow) {
      throw new Error(
        `Missing opponent row for ${row.nflverseOpponent} week ${row.week} (${season}) — malformed source file`
      );
    }
    if (opponentRow.opponent !== row.team) {
      throw new Error(
        `Opponent row mismatch for ${row.nflverseTeam} week ${row.week} (${season}) — malformed source file`
      );
    }
    const current = acc.get(row.team) ?? emptyAccumulator();
    addOffense(current, row);
    addDefense(current, opponentRow);
    acc.set(row.team, current);
  }

  const metrics = new Map();
  for (const [abbr, a] of [...acc.entries()].sort(([aAbbr], [bAbbr]) => aAbbr.localeCompare(bAbbr))) {
    const offensiveEpaPerPlay = ratioOrNull(a.offEpa, a.offPlays);
    const defensiveEpaPerPlay = ratioOrNull(a.defEpa, a.defPlays);
    const netEpaPerPlay =
      offensiveEpaPerPlay == null || defensiveEpaPerPlay == null
        ? null
        : round(offensiveEpaPerPlay - defensiveEpaPerPlay);
    metrics.set(abbr, {
      offensiveEpaPerPlay,
      defensiveEpaPerPlay,
      yardsPerPlay: ratioOrNull(a.offYards, a.offPlays, 2),
      yardsAllowedPerPlay: ratioOrNull(a.defYards, a.defPlays, 2),
      offensivePlays: a.offPlays,
      defensivePlays: a.defPlays,
      turnovers: a.turnovers,
      takeaways: a.takeaways,
      turnoverDifferential: a.takeaways - a.turnovers,
      netEpaPerPlay,
      passingEpaPerPlay: ratioOrNull(a.passingEpa, a.passingPlays),
      rushingEpaPerPlay: ratioOrNull(a.rushingEpa, a.rushingPlays),
      passingPlays: a.passingPlays,
      rushingPlays: a.rushingPlays,
      gamesRepresented: a.gamesRepresented,
      weeksRepresented: [...a.weeksRepresented],
    });
  }
  return metrics;
}

/** Aggregate an explicit canonical season/week/team subset from CSV text. */
export function computeAdvancedTeamMetricsForTeamWeeks(csvText, season, teamsJson, teamWeekKeys) {
  if (!csvText) throw new Error(`Advanced stats source is empty for requested ${season} subset`);
  const rows = parseAdvancedTeamStatRows(csvText, teamsJson, { season, seasonType: "REG" });
  return aggregateAdvancedTeamMetrics(rows, { season, teamsJson, teamWeekKeys });
}

function legacyMetrics(metrics) {
  return new Map(
    [...metrics].map(([abbr, values]) => [
      abbr,
      Object.fromEntries(LEGACY_METRIC_KEYS.map((key) => [key, values[key]])),
    ])
  );
}

/**
 * Aggregate regular-season advanced metrics per team from weekly rows.
 * Returns a Map keyed by site abbr, or null when csvText is null/empty
 * (season file unavailable — e.g. no games played yet).
 * Hard-fails on team codes that don't resolve to canonical teams.
 *
 * This legacy full-season export intentionally retains its original signature
 * and nine-field value contract. Subset callers use the exports above.
 */
export function computeAdvancedTeamMetrics(csvText, season, teamsJson) {
  if (!csvText) return null;
  const rows = parseAdvancedTeamStatRows(csvText, teamsJson, { season, seasonType: "REG" });
  if (rows.length === 0) return null;
  return legacyMetrics(aggregateAdvancedTeamMetrics(rows, { season, teamsJson }));
}
