/**
 * Coverage checks shared by the "Allowed by Position" generators (Fantasy
 * Points Allowed, TDs Allowed). All inputs are the exact normalized
 * HistoricalPlayerWeek rows the generator consumed (see
 * scripts/lib/nflAllowedByPositionIo.ts), so a check always describes the
 * cache the artifact was built from.
 *
 * Policy (partial-week refreshes):
 *   - ERROR: a player-week team-week that is not on the schedule at all
 *     (mis-keyed/impossible data) or malformed results.
 *   - WARNING only: a game FINAL in results.json whose stats nflverse has not
 *     published yet, or a game present in the cache that results.json does not
 *     yet mark FINAL. Either is a provider lag between two independent
 *     upstreams; it must never block publishing the games that ARE available.
 *   - Unplayed/postponed games are never expected.
 */
import { expectedFinalTeamGames } from "./nfl-current-season-coverage.mjs";

const teamWeekKey = (week, team) => `${week}|${team}`;

/** Distinct REG team-games present in the player-week rows for one season, keyed to schedule game ids. */
function cacheTeamGames(playerWeekRows, season, games) {
  const gameIdByTeamWeek = new Map();
  for (const game of games) {
    if (game.seasonType !== "REG") continue;
    for (const team of [game.homeAbbr, game.awayAbbr]) gameIdByTeamWeek.set(teamWeekKey(game.week, team), game.gameId);
  }
  const included = new Map();
  const unscheduled = new Set();
  for (const row of playerWeekRows) {
    if (row.season !== season) continue;
    const gameId = gameIdByTeamWeek.get(teamWeekKey(row.week, row.team));
    if (!gameId) {
      unscheduled.add(`week ${row.week} ${row.team}`);
      continue;
    }
    included.set(`${gameId}|${row.team}`, { gameId, team: row.team, week: row.week });
  }
  return { included: [...included.values()], unscheduled: [...unscheduled].sort() };
}

/**
 * Classifies how the player-week cache lines up with the schedule/results.
 * Returns { summary, errors, warnings }; never throws on provider lag.
 */
export function classifyPlayerWeekCoverage({ season, results, games, playerWeekRows }) {
  const expected = expectedFinalTeamGames(results, games);
  const { included, unscheduled } = cacheTeamGames(playerWeekRows, season, games);
  const key = (row) => `${row.gameId}|${row.team}`;
  const includedKeys = new Set(included.map(key));
  const expectedKeys = new Set(expected.map(key));
  const gameIdOf = (entry) => entry.split("|")[0];
  const missingFinal = [...new Set(expected.filter((row) => !includedKeys.has(key(row))).map((row) => row.gameId))].sort();
  const notYetFinal = [...new Set(included.filter((row) => !expectedKeys.has(key(row))).map(key).map(gameIdOf))].sort();

  const errors = [];
  if (unscheduled.length) errors.push(`player-week rows for unscheduled team-weeks: ${unscheduled.slice(0, 8).join(", ")}`);
  const warnings = [];
  if (missingFinal.length) warnings.push(`FINAL in results but not yet in the nflverse player-week cache (upstream lag): ${missingFinal.join(", ")}`);
  if (notYetFinal.length) warnings.push(`in the player-week cache but not yet FINAL in results.json (results lag): ${notYetFinal.join(", ")}`);

  const cacheGamesByWeek = {};
  for (const row of included) (cacheGamesByWeek[row.week] ??= new Set()).add(row.gameId);
  return {
    summary: {
      season,
      finalGames: new Set(expected.map((row) => row.gameId)).size,
      cacheGames: new Set(included.map((row) => row.gameId)).size,
      cacheGamesByWeek: Object.fromEntries(Object.entries(cacheGamesByWeek).map(([week, ids]) => [week, ids.size])),
      missingFinalGameIds: missingFinal,
      notYetFinalGameIds: notYetFinal,
    },
    errors,
    warnings,
  };
}

/** Logs coverage (GitHub annotation for warnings) and throws only on structural errors. */
export function reportPlayerWeekCoverage(input, label) {
  const result = classifyPlayerWeekCoverage(input);
  console.log(`[nfl:coverage] ${label} ${JSON.stringify(result.summary)}`);
  for (const warning of result.warnings) console.warn(`::warning title=${label}::${warning}`);
  if (result.errors.length) throw new Error(`${label}: ${result.errors.join("; ")}`);
  return result;
}

/**
 * Defense games per team present in the rows: team -> Set("season|week").
 * Keyed on the offensive row's opponent (the defense), optionally restricted
 * to one position -- the same grouping the aggregators use.
 */
export function defenseGamesByTeam(playerWeekRows, { position = null, season = null } = {}) {
  const byTeam = new Map();
  for (const row of playerWeekRows) {
    if (position && row.position !== position) continue;
    if (season != null && row.season !== season) continue;
    if (!byTeam.has(row.opponent)) byTeam.set(row.opponent, new Set());
    byTeam.get(row.opponent).add(`${row.season}|${row.week}`);
  }
  return byTeam;
}

/** Problems (empty when valid) with the ranks within one sample/position column. */
export function rankProblems(cells, label) {
  const problems = [];
  const ranked = cells.filter((cell) => cell.sample.rank != null);
  const ranks = ranked.map((cell) => cell.sample.rank).sort((a, b) => a - b);
  if (new Set(ranks).size !== ranks.length || ranks.some((rank, index) => rank !== index + 1)) {
    problems.push(`${label}: ranks are not a unique 1..${ranks.length} sequence`);
  }
  for (const { team, sample } of cells) {
    if ((sample.rank == null) !== (sample.gamesSampled === 0)) problems.push(`${label} ${team}: rank must be null exactly when no games are sampled`);
  }
  return problems;
}
