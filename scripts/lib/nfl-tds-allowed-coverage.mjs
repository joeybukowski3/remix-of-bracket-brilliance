import { defenseGamesByTeam, reportPlayerWeekCoverage } from "./nfl-allowed-by-position-coverage.mjs";

/**
 * Logs how the player-week cache lines up with completed games. Unplayed games
 * are never expected, and a FINAL game nflverse has not published yet is a
 * warning, not a failure: a lagging upstream game must not block publishing
 * the completed games that are available. Throws only on structural errors.
 */
export function requirePlayerWeekCoverage({ season, results, games, playerWeekRows }) {
  return reportPlayerWeekCoverage({ season, results, games, playerWeekRows }, `TDs Allowed ${season} player-week cache`);
}

/**
 * Problems (empty when valid) if the artifact's current-season sample does not
 * match the player-week cache it was built from. Every TDs category counts a
 * game whenever the defense faced any offensive row, so each category's
 * gamesSampled must equal the defense's game count in the cache.
 */
export function validateTdsAllowedArtifact(artifact, playerWeekRows) {
  const key = String(artifact?.season);
  const cacheGames = defenseGamesByTeam(playerWeekRows, { season: artifact?.season });
  const problems = [];
  if (!Array.isArray(artifact?.rows) || artifact.rows.length !== 32) problems.push("artifact must contain 32 team rows");
  for (const row of artifact?.rows ?? []) {
    const expected = cacheGames.get(row.team)?.size ?? 0;
    for (const [category, sample] of Object.entries(row.samples?.[key] ?? {})) {
      const sampled = sample?.gamesSampled ?? 0;
      if (sampled !== expected) problems.push(`${row.team} ${category}: ${sampled} games sampled, player-week cache has ${expected}`);
    }
  }
  return problems;
}
