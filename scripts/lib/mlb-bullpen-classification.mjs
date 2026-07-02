/**
 * mlb-bullpen-classification.mjs
 *
 * Pure reliever-pool classification.
 *
 * MLB StatsAPI has no clean "bullpen-only" stat split -- a pitcher's
 * season pitching line mixes any starts and relief appearances together.
 * This repo uses a documented, repository-approved approximation instead
 * of pretending to have an exact bullpen split:
 *
 *   RELIEVER_POOL_APPROXIMATION: a pitcher is included in a team's
 *   "reliever pool" if and only if gamesStarted === 0 for the season.
 *   Any pitcher with one or more starts (a "swingman" who both started
 *   and relieved) is EXCLUDED from the pool for the whole season, even
 *   though some of their appearances were relief outings.
 *
 * This is a real approximation, not an exact bullpen-only split -- see
 * APPROXIMATION_METHOD / APPROXIMATION_DESCRIPTION below, which callers
 * should persist alongside any output derived from this classification.
 * Team-wide pitching aggregates (i.e. summing every pitcher on a roster,
 * starters included) must never be labeled as bullpen data; this module
 * exists specifically to isolate the reliever-pool subset first.
 */

export const APPROXIMATION_METHOD = "reliever-pool-approximation-gamesStarted-zero";

export const APPROXIMATION_DESCRIPTION =
  "Reliever pool = pitchers with 0 season starts (gamesStarted === 0). " +
  "Pitchers with 1+ starts (including swingmen who also relieved) are " +
  "excluded from the pool for the full season. This is an approximation " +
  "of bullpen-only performance, not an exact per-appearance split.";

/**
 * @typedef {object} PitcherSeasonStat
 * @property {number|null} gamesStarted
 * @property {number|null} gamesPlayed
 */

/**
 * Classifies a single pitcher into the reliever pool given their season
 * pitching totals.
 *
 * @param {PitcherSeasonStat|null|undefined} seasonStat
 * @returns {"reliever"|"excluded-starter-or-swingman"|"missing-stats"}
 */
export function classifyPitcherRole(seasonStat) {
  if (!seasonStat || seasonStat.gamesStarted === null || seasonStat.gamesStarted === undefined) {
    return "missing-stats";
  }
  const gamesStarted = Number(seasonStat.gamesStarted);
  if (!Number.isFinite(gamesStarted)) return "missing-stats";
  return gamesStarted === 0 ? "reliever" : "excluded-starter-or-swingman";
}

/**
 * @typedef {object} RosterPitcher
 * @property {number} pitcherId
 */

/**
 * Builds a team's reliever pool from its roster and per-pitcher season
 * stats, using the gamesStarted === 0 approximation.
 *
 * @param {RosterPitcher[]} rosterPitchers - every pitcher on the active roster
 * @param {Map<number, PitcherSeasonStat>} seasonStatsByPitcherId
 * @returns {{
 *   relieverPitcherIds: number[],
 *   excludedPitcherIds: number[],
 *   missingStatsPitcherIds: number[],
 *   rosterPitcherCount: number,
 *   approximationMethod: string,
 * }}
 */
export function buildRelieverPool(rosterPitchers, seasonStatsByPitcherId) {
  const relieverPitcherIds = [];
  const excludedPitcherIds = [];
  const missingStatsPitcherIds = [];

  for (const pitcher of rosterPitchers ?? []) {
    const pitcherId = Number(pitcher?.pitcherId);
    if (!Number.isFinite(pitcherId) || pitcherId <= 0) continue;
    const seasonStat = seasonStatsByPitcherId?.get(pitcherId);
    const role = classifyPitcherRole(seasonStat);
    if (role === "reliever") relieverPitcherIds.push(pitcherId);
    else if (role === "excluded-starter-or-swingman") excludedPitcherIds.push(pitcherId);
    else missingStatsPitcherIds.push(pitcherId);
  }

  return {
    relieverPitcherIds,
    excludedPitcherIds,
    missingStatsPitcherIds,
    rosterPitcherCount: (rosterPitchers ?? []).length,
    approximationMethod: APPROXIMATION_METHOD,
  };
}
