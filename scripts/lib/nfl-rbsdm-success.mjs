/**
 * RBSDM success-rate ingestion helpers (Phase 3A).
 *
 * Pure logic only: week-range grouping, response validation, normalization and
 * ranking. No I/O and no network — the generator supplies fetched payloads so
 * everything here is unit testable against fixtures.
 *
 * Source: https://rbsdm.com/api/team-tiers (POST, JSON body). RBSDM publishes
 * finished success-rate percentages; this pipeline consumes them verbatim and
 * never recomputes success at the play level.
 *
 * Attribution: RBSDM / Ben Baldwin (https://rbsdm.com/stats, nflfastR).
 *
 * Why periods are never blended: RBSDM exposes the finished rate but not the
 * eligible-play denominator, so two season ranges cannot be combined exactly.
 * Rather than approximate, the analyzer displays the periods side by side.
 */

export const RBSDM_ENDPOINT = "https://rbsdm.com/api/team-tiers";
export const RBSDM_SOURCE_LABEL = "RBSDM (rbsdm.com/stats)";
export const RBSDM_ATTRIBUTION = "Ben Baldwin / RBSDM";

/** Analyzer metric key -> RBSDM response field. The only place they are tied. */
export const RBSDM_FIELD_MAP = Object.freeze({
  "off.successRate": "off_suc",
  "off.passSuccessRate": "off_pass_suc",
  "off.rushSuccessRate": "off_rush_suc",
  "def.successRateAllowed": "def_suc",
  "def.passSuccessRateAllowed": "def_pass_suc",
  "def.rushSuccessRateAllowed": "def_rush_suc",
});

export const RBSDM_METRIC_KEYS = Object.freeze(Object.keys(RBSDM_FIELD_MAP));
export const RBSDM_FIELDS = Object.freeze(Object.values(RBSDM_FIELD_MAP));

/** Ranking direction per metric; mirrored by the UI catalogue and asserted in tests. */
export const RBSDM_METRIC_DIRECTION = Object.freeze({
  "off.successRate": "higher-is-better",
  "off.passSuccessRate": "higher-is-better",
  "off.rushSuccessRate": "higher-is-better",
  "def.successRateAllowed": "lower-is-better",
  "def.passSuccessRateAllowed": "lower-is-better",
  "def.rushSuccessRateAllowed": "lower-is-better",
});

/** Period keys the analyzer can display. Never combined with one another. */
export const PERIOD_2025_LAST8 = "2025-last8";
export const PERIOD_2026_SEASON = "2026-season";
export const PERIOD_2026_LAST5 = "2026-last5";
/**
 * Full prior regular season (the /nfl/power-ratings "2025" tab). One request,
 * weeks 1..maxCompletedWeek, every team. Not shown in the matchup analyzer.
 */
export const PERIOD_2025_SEASON = "2025-season";

export const LAST8_GAME_COUNT = 8;
export const LAST5_GAME_COUNT = 5;

// ---------------------------------------------------------------------------
// Team mapping
// ---------------------------------------------------------------------------

/**
 * RBSDM team code -> canonical repo abbreviation.
 *
 * RBSDM uses the nflverse team codes, which teams.json already carries as
 * `nflverseAbbr`, so this reuses the repository's single canonical mapping
 * rather than introducing a second one. Validated to cover exactly 32 teams.
 */
export function buildRbsdmTeamMap(teamsJson) {
  const teams = teamsJson?.teams ?? [];
  if (teams.length !== 32) {
    throw new Error(`Expected 32 canonical teams, found ${teams.length}`);
  }
  const map = new Map();
  for (const team of teams) {
    if (!team.nflverseAbbr || !team.abbr) {
      throw new Error(`Team ${team.slug ?? "?"} is missing nflverseAbbr/abbr`);
    }
    if (map.has(team.nflverseAbbr)) {
      throw new Error(`Duplicate nflverse code ${team.nflverseAbbr}`);
    }
    map.set(team.nflverseAbbr, team.abbr);
  }
  if (map.size !== 32) throw new Error(`Team map covers ${map.size} codes, expected 32`);
  return map;
}

// ---------------------------------------------------------------------------
// Week-range grouping
// ---------------------------------------------------------------------------

/**
 * Group teams by the uniform RBSDM week range that reproduces each team's own
 * final N completed regular-season games.
 *
 * RBSDM accepts one week range per request, but a bye shifts a team's window
 * start. Because a team is simply absent from weeks it did not play, the range
 * [firstSelectedWeek, lastSelectedWeek] returns exactly that team's N games —
 * so teams sharing a range can be served by a single request, and each team's
 * value is only ever read from the request matching its own true window.
 *
 * `completedByTeam` is the Phase 2 completed-game index: chronologically
 * ordered, regular season only, finals only.
 */
export function groupTeamsByWeekRange(completedByTeam, { season, gameCount }) {
  const groups = new Map();
  const skipped = [];

  for (const [team, games] of completedByTeam) {
    const seasonGames = games.filter((g) => g.season === season);
    if (seasonGames.length < gameCount) {
      // Not enough completed games for this window yet (early season, or a
      // team with postponements). Recorded, never silently coerced.
      skipped.push({ team, completed: seasonGames.length, required: gameCount });
      continue;
    }
    const selected = seasonGames.slice(-gameCount);
    const weekMin = Math.min(...selected.map((g) => g.week));
    const weekMax = Math.max(...selected.map((g) => g.week));
    const key = `${weekMin}-${weekMax}`;

    if (!groups.has(key)) {
      groups.set(key, { season, weekMin, weekMax, teams: [], gameIdsByTeam: {} });
    }
    const group = groups.get(key);
    group.teams.push(team);
    group.gameIdsByTeam[team] = selected.map((g) => g.gameId);
  }

  const ordered = [...groups.values()].sort((a, b) => a.weekMin - b.weekMin || a.weekMax - b.weekMax);
  for (const group of ordered) group.teams.sort();
  return { groups: ordered, skipped };
}

/**
 * Season-to-date range for a season: week 1 through the last week in which any
 * completed game exists. Returns null when the season has no completed games.
 */
export function seasonToDateRange(completedByTeam, season) {
  let maxWeek = 0;
  const gameIdsByTeam = {};
  for (const [team, games] of completedByTeam) {
    const seasonGames = games.filter((g) => g.season === season);
    if (seasonGames.length === 0) continue;
    gameIdsByTeam[team] = seasonGames.map((g) => g.gameId);
    maxWeek = Math.max(maxWeek, ...seasonGames.map((g) => g.week));
  }
  if (maxWeek === 0) return null;
  return { season, weekMin: 1, weekMax: maxWeek, teams: Object.keys(gameIdsByTeam).sort(), gameIdsByTeam };
}

/** Completed regular-season game count per team for one season. */
export function completedGameCounts(completedByTeam, season) {
  const counts = {};
  for (const [team, games] of completedByTeam) {
    counts[team] = games.filter((g) => g.season === season).length;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

/**
 * The confirmed RBSDM request body. Regular season only: weeks_post_* stay
 * "None" so no postseason play can enter a sample.
 */
export function buildRbsdmPayload({ season, weekMin, weekMax }) {
  if (!Number.isInteger(season)) throw new Error(`Invalid season ${season}`);
  if (!Number.isInteger(weekMin) || !Number.isInteger(weekMax) || weekMin < 1 || weekMax < weekMin) {
    throw new Error(`Invalid week range ${weekMin}-${weekMax}`);
  }
  return {
    season_min: season,
    season_max: season,
    week_min: weekMin,
    week_max: weekMax,
    weeks_post_start: "None",
    weeks_post_end: "None",
    downs: [1, 2, 3, 4],
    quarters: [1, 2, 3, 4, 5],
    wp_filter: 0,
    exclude_turnovers: false,
  };
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

const FRACTION_MIN = 0;
const FRACTION_MAX = 1;

/**
 * Validate and normalize one RBSDM response.
 *
 * Rejects HTML error pages, empty bodies, unknown/duplicate teams, non-finite
 * values and fractions outside 0-1. Nothing is dropped silently: any anomaly
 * throws so the generator fails loudly and leaves the previous artifact intact.
 *
 * `requiredTeams` are the canonical abbreviations this request exists to serve;
 * every one of them must be present in the response.
 */
export function validateRbsdmResponse(payloadJson, { teamMap, requiredTeams, label }) {
  if (typeof payloadJson === "string") {
    throw new Error(`${label}: response was text, not JSON (likely an HTML error page)`);
  }
  if (!payloadJson || typeof payloadJson !== "object" || Array.isArray(payloadJson)) {
    throw new Error(`${label}: response is not a JSON object`);
  }
  const rows = payloadJson.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`${label}: response.rows is not an array`);
  }
  if (rows.length === 0) {
    throw new Error(`${label}: response contained zero rows`);
  }

  const byTeam = new Map();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object") {
      throw new Error(`${label}: row ${index} is not an object`);
    }
    const code = row.team_abbr;
    if (typeof code !== "string" || code.length === 0) {
      throw new Error(`${label}: row ${index} has no team_abbr`);
    }
    const abbr = teamMap.get(code);
    if (!abbr) {
      throw new Error(`${label}: unknown RBSDM team code "${code}"`);
    }
    if (byTeam.has(abbr)) {
      throw new Error(`${label}: duplicate team row for "${code}"`);
    }

    const values = {};
    for (const [metricKey, field] of Object.entries(RBSDM_FIELD_MAP)) {
      const raw = row[field];
      if (raw === null || raw === undefined) {
        values[metricKey] = null;
        continue;
      }
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw new Error(`${label}: ${code} field "${field}" is not a finite number (${JSON.stringify(raw)})`);
      }
      if (raw < FRACTION_MIN || raw > FRACTION_MAX) {
        throw new Error(`${label}: ${code} field "${field}" = ${raw} outside the 0-1 fraction range`);
      }
      values[metricKey] = raw;
    }
    byTeam.set(abbr, values);
  }

  const missing = (requiredTeams ?? []).filter((team) => !byTeam.has(team));
  if (missing.length > 0) {
    throw new Error(`${label}: response is missing required teams ${missing.join(", ")}`);
  }

  return { byTeam, teamsReturned: [...byTeam.keys()].sort() };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Competition ranking (1, 2, 2, 4) over unrounded source fractions, computed
 * independently for each period. Periods are never pooled into one population.
 * Teams without a value are excluded rather than ranked last.
 */
export function rankPeriodValues(valuesByTeam, direction) {
  const entries = Object.entries(valuesByTeam).filter(
    ([, v]) => v !== null && v !== undefined && Number.isFinite(v)
  );
  if (entries.length === 0) return {};

  const higherIsBetter = direction !== "lower-is-better";
  entries.sort((a, b) => (higherIsBetter ? b[1] - a[1] : a[1] - b[1]) || a[0].localeCompare(b[0]));

  const ranks = {};
  let previousValue = null;
  let previousRank = 0;
  entries.forEach(([team, value], index) => {
    const rank = previousValue !== null && value === previousValue ? previousRank : index + 1;
    ranks[team] = rank;
    previousValue = value;
    previousRank = rank;
  });
  return ranks;
}

/** Fraction (0.505) -> display percent number (50.5). Display rounding only. */
export function toPercent(fraction, decimals = 1) {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return null;
  const f = 10 ** decimals;
  return Math.round(fraction * 100 * f) / f;
}
