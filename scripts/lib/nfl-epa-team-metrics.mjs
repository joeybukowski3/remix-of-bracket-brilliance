/**
 * Team EPA metrics for the active power-rating model, backed by nflfastR
 * play-by-play (Phase 7B).
 *
 * This adapter exposes the same shape the v0.3 pipeline previously obtained
 * from scripts/lib/nfl-advanced-stats.mjs, so the migration is a source-
 * definition change only — the model's weights, opponent adjustment, recency
 * and scaling are untouched.
 *
 * Why the migration: the legacy stats_team_week EPA books QB scrambles as
 * rushing where nflfastR counts them as passing, and its play denominators
 * (attempts + sacks_suffered, carries) miss about 3.2% of eligible plays. That
 * produced a league EPA/play of +0.00747 against play-by-play's +0.01496 —
 * roughly a factor of two — and a materially different rush EPA distribution
 * (2025 Spearman 0.816, fourteen teams moving five or more rank places).
 *
 * The EPA definition itself lives in nfl-epa-core.mjs and is not restated here:
 * eligible plays are (pass == 1 OR rush == 1) AND epa present AND posteam
 * present AND two_point_attempt != 1, with nflfastR's own indicators
 * authoritative.
 *
 * Attribution: nflverse / nflfastR.
 */

import { indexTeamGames, opponentRecord, sumWindow } from "./nfl-epa-core.mjs";

/** Identifier for the EPA definition this adapter serves, recorded in provenance. */
export const NFL_MODEL_EPA_DEFINITION = "matchup-epa-v1";
export const NFL_MODEL_EPA_SOURCE = "nflverse play-by-play (nflfastR EPA)";
export const NFL_MODEL_EPA_CACHE_DIR = "data/nfl/nflverse/epa-team-game";

/**
 * Aggregate one team's selected records into the metric shape the rating
 * pipeline consumes.
 *
 * Numerators and denominators are summed across the selected games and divided
 * once. Per-game EPA/play values are never averaged — an equal-weight mean over
 * games is a different number and would be visible at the precision the model
 * carries.
 */
function metricsFor(records, index) {
  const offense = sumWindow(records);
  // Defence is the opponents' offensive production in those exact same games.
  const defense = sumWindow(records.map((record) => opponentRecord(index, record)));

  const offensiveEpaPerPlay = offense.offPlays > 0 ? offense.offEpa / offense.offPlays : null;
  const defensiveEpaPerPlay = defense.offPlays > 0 ? defense.offEpa / defense.offPlays : null;

  // Context fields the artifact publishes alongside the scored metrics. They
  // now use the same play-by-play definition as everything else, so a team's
  // pass and rush splits can no longer disagree with its overall EPA.
  const passingEpaPerPlay = offense.passPlays > 0 ? offense.passEpa / offense.passPlays : null;
  const rushingEpaPerPlay = offense.rushPlays > 0 ? offense.rushEpa / offense.rushPlays : null;
  const round4 = (value) => (value === null ? null : Number(value.toFixed(4)));

  return {
    offensiveEpaPerPlay,
    defensiveEpaPerPlay,
    netEpaPerPlay:
      offensiveEpaPerPlay === null || defensiveEpaPerPlay === null
        ? null
        : offensiveEpaPerPlay - defensiveEpaPerPlay,
    passingEpaPerPlay: round4(passingEpaPerPlay),
    rushingEpaPerPlay: round4(rushingEpaPerPlay),
    gamesRepresented: records.length,
    offensiveEpa: offense.offEpa,
    offensivePlays: offense.offPlays,
    defensiveEpa: defense.offEpa,
    defensivePlays: defense.offPlays,
  };
}

/**
 * Full-season team metrics for one season.
 *
 * @param {Array} records parsed compact EPA rows (all seasons is fine)
 * @param {{ season: number }} options
 * @returns {Map<string, object>} canonical team abbr -> metrics
 */
export function aggregatePbpTeamMetrics(records, { season }) {
  if (!Number.isInteger(season)) {
    throw new Error("aggregatePbpTeamMetrics: season must be an integer");
  }
  const seasonRecords = records.filter((record) => record.season === season);
  if (seasonRecords.length === 0) {
    throw new Error(`aggregatePbpTeamMetrics: no cached EPA rows for ${season}`);
  }
  const index = indexTeamGames(seasonRecords);

  const byTeam = new Map();
  for (const record of seasonRecords) {
    if (!byTeam.has(record.team)) byTeam.set(record.team, []);
    byTeam.get(record.team).push(record);
  }

  const out = new Map();
  for (const [team, teamRecords] of byTeam) {
    out.set(team, metricsFor(teamRecords, index));
  }
  return out;
}

/**
 * Metrics for an explicit set of `{ season, week, team }` selections.
 *
 * Mirrors the legacy team-week selector so the rolling final-eight window keeps
 * choosing exactly the same games; only the EPA underneath changes. A selection
 * that matches no cached row is a hard failure rather than a silently smaller
 * window.
 */
export function computePbpTeamMetricsForTeamWeeks(records, season, teamWeekKeys) {
  if (!Array.isArray(teamWeekKeys) || teamWeekKeys.length === 0) {
    throw new Error("computePbpTeamMetricsForTeamWeeks: teamWeekKeys must be a non-empty array");
  }
  const seasonRecords = records.filter((record) => record.season === season);
  const index = indexTeamGames(seasonRecords);
  const byKey = new Map(seasonRecords.map((record) => [`${record.season}|${record.week}|${record.team}`, record]));

  const selectedByTeam = new Map();
  for (const key of teamWeekKeys) {
    const lookup = `${key.season}|${key.week}|${key.team}`;
    const record = byKey.get(lookup);
    if (!record) {
      throw new Error(`No cached EPA row for ${key.team} in ${key.season} week ${key.week}`);
    }
    if (!selectedByTeam.has(key.team)) selectedByTeam.set(key.team, []);
    selectedByTeam.get(key.team).push(record);
  }

  const out = new Map();
  for (const [team, teamRecords] of selectedByTeam) {
    out.set(team, metricsFor(teamRecords, index));
  }
  return out;
}
