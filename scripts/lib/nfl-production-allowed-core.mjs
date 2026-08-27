/**
 * Pure aggregation core for opponent-production-allowed (yardage, not fantasy
 * points). Shared by scripts/generate-nfl-production-allowed.mjs and its
 * test suite -- no filesystem/network access here.
 *
 * Source: nflverse `stats_player_week` (player-week box score), regular
 * season only (`season_type === "REG"`). Defensive production allowed for
 * team Y is derived from every OTHER team's offensive rows where
 * `opponent_team === Y` -- i.e. what opposing offenses did against Y, not
 * anything Y's own offense produced.
 *
 * Dimensions: team (defense, nflverse uppercase code) x market
 * (passing | rushing | receiving) x position x window (season | last5).
 *
 * Position slices, chosen for what the raw data can actually attribute
 * cleanly:
 *   passing:   QB   -- passing yards allowed is conceded almost entirely to
 *                       opposing quarterbacks; this is the conventional
 *                       "team pass yards allowed" figure.
 *   rushing:   ALL  -- team-wide rushing yards allowed (every ball-carrier
 *                       position), the conventional "team rush yards allowed".
 *              RB   -- position-specific rushing yards allowed to running
 *                       backs only, narrower and more relevant to RB rushing
 *                       props.
 *   receiving: WR, TE, RB -- position-specific receiving yards allowed. No
 *                       team-wide ALL slice is produced for receiving; each
 *                       slice is exactly what its position label claims.
 *
 * "last5" is each team's final five REG-season games in the source data,
 * ordered by week number (byes do not appear as rows, so this is always five
 * actual games, never five calendar weeks).
 */

export const PRODUCTION_ALLOWED_MARKET_POSITIONS = {
  passing: ["QB"],
  rushing: ["ALL", "RB"],
  receiving: ["WR", "TE", "RB"],
};

const YARD_COLUMN_BY_MARKET = {
  passing: "passing_yards",
  rushing: "rushing_yards",
  receiving: "receiving_yards",
};

const LAST5_GAME_COUNT = 5;

/**
 * @param {ReadonlyArray<Record<string, string>>} rows - parsed stats_player_week CSV rows (string cells).
 * @param {number} season
 * @returns {{ team: string, week: number, position: string, opponentTeam: string, passingYards: number, rushingYards: number, receivingYards: number }[]}
 */
export function normalizeStatRows(rows, season) {
  const out = [];
  for (const row of rows) {
    if (Number(row.season) !== season) continue;
    if (row.season_type !== "REG") continue;
    const opponentTeam = row.opponent_team;
    const week = Number(row.week);
    if (!opponentTeam || !Number.isInteger(week) || week < 1) continue;
    out.push({
      team: row.recent_team,
      week,
      position: row.position,
      opponentTeam,
      passingYards: Number(row.passing_yards) || 0,
      rushingYards: Number(row.rushing_yards) || 0,
      receivingYards: Number(row.receiving_yards) || 0,
    });
  }
  return out;
}

/** Distinct (defense team -> sorted week list) the team appeared as `opponent_team` for. */
export function buildDefenseWeekIndex(normalizedRows) {
  const weeksByTeam = new Map();
  for (const row of normalizedRows) {
    const set = weeksByTeam.get(row.opponentTeam) ?? new Set();
    set.add(row.week);
    weeksByTeam.set(row.opponentTeam, set);
  }
  const out = new Map();
  for (const [team, weeks] of weeksByTeam) {
    out.set(team, [...weeks].sort((a, b) => a - b));
  }
  return out;
}

/** Weeks belonging to a window for one team: every game (season) or the final five (last5). */
export function selectWindowWeeks(sortedWeeks, mode) {
  if (mode === "season") return sortedWeeks;
  if (mode === "last5") return sortedWeeks.slice(-LAST5_GAME_COUNT);
  throw new Error(`selectWindowWeeks: unknown mode "${mode}"`);
}

function yardsForRow(row, market, position) {
  if (market === "passing") return row.position === "QB" ? row.passingYards : 0;
  if (market === "rushing") {
    if (position === "ALL") return row.rushingYards;
    return row.position === position ? row.rushingYards : 0;
  }
  // receiving
  return row.position === position ? row.receivingYards : 0;
}

/**
 * Aggregate one team x market x position x window cell.
 * Returns null when the team has zero games in the window (never a
 * fabricated zero).
 */
export function aggregateCell(normalizedRows, team, weeksInWindow, market, position) {
  if (weeksInWindow.length === 0) return null;
  const weekSet = new Set(weeksInWindow);
  let totalYards = 0;
  for (const row of normalizedRows) {
    if (row.opponentTeam !== team) continue;
    if (!weekSet.has(row.week)) continue;
    totalYards += yardsForRow(row, market, position);
  }
  const gamesIncluded = weeksInWindow.length;
  return {
    yardsAllowedPerGame: Math.round((totalYards / gamesIncluded) * 10) / 10,
    totalYardsAllowed: Math.round(totalYards * 10) / 10,
    gamesIncluded,
    weeksIncluded: [...weeksInWindow],
  };
}

/**
 * Build the full artifact `teams` block for one season.
 * @returns {Record<string, Record<string, Record<string, Record<string, ReturnType<typeof aggregateCell>>>>>} team -> market -> position -> window -> cell
 */
export function buildProductionAllowedTeams(normalizedRows, teamAbbrs) {
  const defenseWeekIndex = buildDefenseWeekIndex(normalizedRows);
  const teams = {};

  for (const team of teamAbbrs) {
    const sortedWeeks = defenseWeekIndex.get(team) ?? [];
    if (sortedWeeks.length === 0) continue;

    const markets = {};
    for (const [market, positions] of Object.entries(PRODUCTION_ALLOWED_MARKET_POSITIONS)) {
      const byPosition = {};
      for (const position of positions) {
        const byWindow = {};
        for (const mode of ["season", "last5"]) {
          const weeksInWindow = selectWindowWeeks(sortedWeeks, mode);
          byWindow[mode] = aggregateCell(normalizedRows, team, weeksInWindow, market, position);
        }
        byPosition[position] = byWindow;
      }
      markets[market] = byPosition;
    }
    teams[team] = markets;
  }
  return teams;
}

export { YARD_COLUMN_BY_MARKET };
