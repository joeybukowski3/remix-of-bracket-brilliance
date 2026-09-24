import { expectedFinalTeamGames, requireTeamGameCoverage } from "./nfl-current-season-coverage.mjs";

/** Distinct team-games present in the player-week cache for a season, keyed to canonical game ids. */
export function playerWeekTeamGames(playerWeekRows, season, results) {
  const gameIdByTeamWeek = new Map();
  for (const result of results) {
    if (result.seasonType !== "REG") continue;
    for (const team of [result.homeAbbr, result.awayAbbr]) gameIdByTeamWeek.set(`${result.week}|${team}`, result.gameId);
  }
  const included = new Map();
  for (const row of playerWeekRows) {
    if (row.season !== season) continue;
    const gameId = gameIdByTeamWeek.get(`${row.week}|${row.team}`) ?? `${season}_${row.week}_unscheduled`;
    included.set(`${gameId}|${row.team}`, { gameId, team: row.team });
  }
  return [...included.values()];
}

/** Fails when any completed REG game has no player-week rows. Unplayed games are never expected. */
export function requirePlayerWeekCoverage({ season, results, games, playerWeekRows }) {
  const expected = expectedFinalTeamGames(results, games);
  return requireTeamGameCoverage(expected, playerWeekTeamGames(playerWeekRows, season, results), `TDs Allowed ${season} player-week cache`);
}

/** Problems (empty when valid) if the artifact's current-season sample lags the completed games. */
export function validateTdsAllowedArtifact(artifact, results, games = null) {
  const key = String(artifact?.season);
  const expectedByTeam = new Map();
  for (const { team } of expectedFinalTeamGames(results, games)) expectedByTeam.set(team, (expectedByTeam.get(team) ?? 0) + 1);
  const problems = [];
  if (!Array.isArray(artifact?.rows) || artifact.rows.length !== 32) problems.push("artifact must contain 32 team rows");
  for (const row of artifact?.rows ?? []) {
    const expected = expectedByTeam.get(row.team) ?? 0;
    for (const [category, sample] of Object.entries(row.samples?.[key] ?? {})) {
      const sampled = sample?.gamesSampled ?? 0;
      if (sampled !== expected) problems.push(`${row.team} ${category}: ${sampled} games sampled, ${expected} completed`);
    }
  }
  return problems;
}
