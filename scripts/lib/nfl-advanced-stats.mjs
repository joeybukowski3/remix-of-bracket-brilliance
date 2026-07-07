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

const round = (value, digits = 4) => Number(value.toFixed(digits));

function num(raw) {
  if (raw === "" || raw == null || raw === "NA") return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Aggregate regular-season advanced metrics per team from weekly rows.
 * Returns a Map keyed by site abbr, or null when csvText is null/empty
 * (season file unavailable — e.g. no games played yet).
 * Hard-fails on team codes that don't resolve to canonical teams.
 */
export function computeAdvancedTeamMetrics(csvText, season, teamsJson) {
  if (!csvText) return null;
  const rows = parseCsv(csvText).filter(
    (row) => Number(row.season) === season && row.season_type === "REG"
  );
  if (rows.length === 0) return null;

  const byNflverse = new Map(teamsJson.teams.map((team) => [team.nflverseAbbr, team]));

  // First pass: per-team-week offensive production (for the defensive join).
  const weekly = new Map(); // `${team}|${week}` -> { epa, plays, yards }
  const acc = new Map(); // site abbr -> accumulator

  for (const row of rows) {
    const team = byNflverse.get(row.team);
    if (!team) throw new Error(`Unknown nflverse team code "${row.team}" in stats_team_week ${season}`);
    if (!byNflverse.has(row.opponent_team)) {
      throw new Error(`Unknown opponent code "${row.opponent_team}" in stats_team_week ${season}`);
    }

    const offensiveEpa = num(row.passing_epa) + num(row.rushing_epa);
    const plays = num(row.attempts) + num(row.sacks_suffered) + num(row.carries);
    const yards = num(row.passing_yards) + num(row.rushing_yards);
    weekly.set(`${row.team}|${row.week}`, { epa: offensiveEpa, plays, yards });

    const current = acc.get(team.abbr) ?? {
      games: 0,
      offEpa: 0,
      offPlays: 0,
      offYards: 0,
      turnovers: 0,
      takeaways: 0,
    };
    current.games += 1;
    current.offEpa += offensiveEpa;
    current.offPlays += plays;
    current.offYards += yards;
    current.turnovers +=
      num(row.passing_interceptions) +
      num(row.sack_fumbles_lost) +
      num(row.rushing_fumbles_lost) +
      num(row.receiving_fumbles_lost);
    current.takeaways += num(row.def_interceptions) + num(row.fumble_recovery_opp);
    acc.set(team.abbr, current);
  }

  // Second pass: defense = what each opponent's offense did in that game.
  for (const row of rows) {
    const team = byNflverse.get(row.team);
    const opponentWeek = weekly.get(`${row.opponent_team}|${row.week}`);
    if (!opponentWeek) {
      throw new Error(
        `Missing opponent row for ${row.opponent_team} week ${row.week} (${season}) — malformed source file`
      );
    }
    const current = acc.get(team.abbr);
    current.defEpa = (current.defEpa ?? 0) + opponentWeek.epa;
    current.defPlays = (current.defPlays ?? 0) + opponentWeek.plays;
    current.defYards = (current.defYards ?? 0) + opponentWeek.yards;
  }

  const metrics = new Map();
  for (const [abbr, a] of acc) {
    metrics.set(abbr, {
      offensiveEpaPerPlay: a.offPlays > 0 ? round(a.offEpa / a.offPlays) : null,
      defensiveEpaPerPlay: a.defPlays > 0 ? round(a.defEpa / a.defPlays) : null,
      yardsPerPlay: a.offPlays > 0 ? round(a.offYards / a.offPlays, 2) : null,
      yardsAllowedPerPlay: a.defPlays > 0 ? round(a.defYards / a.defPlays, 2) : null,
      offensivePlays: a.offPlays,
      defensivePlays: a.defPlays ?? 0,
      turnovers: a.turnovers,
      takeaways: a.takeaways,
      turnoverDifferential: a.takeaways - a.turnovers,
    });
  }
  return metrics;
}
