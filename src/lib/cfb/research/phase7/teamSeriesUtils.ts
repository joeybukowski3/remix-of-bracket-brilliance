import { groupBy } from "./statsUtils";
import type { MissDatasetRow } from "./types";

export type TeamSignedObservation = {
  teamExternalId: string;
  season: number;
  week: number;
  value: number;
};

/**
 * Builds one signed, team-attributed observation per (game, side), sorted
 * chronologically per team. `valueFn` receives the row and whether the team
 * was home (so callers can flip sign for the away side, e.g. margin
 * residual is symmetric around the home team's perspective).
 */
export function buildTeamSeries(
  rows: readonly MissDatasetRow[],
  homeTeamIdFn: (row: MissDatasetRow) => string,
  awayTeamIdFn: (row: MissDatasetRow) => string,
  valueFn: (row: MissDatasetRow, isHome: boolean) => number | null,
): Map<string, TeamSignedObservation[]> {
  const observations: TeamSignedObservation[] = [];
  for (const row of rows) {
    const homeValue = valueFn(row, true);
    if (homeValue !== null) {
      observations.push({ teamExternalId: homeTeamIdFn(row), season: row.season, week: row.week, value: homeValue });
    }
    const awayValue = valueFn(row, false);
    if (awayValue !== null) {
      observations.push({ teamExternalId: awayTeamIdFn(row), season: row.season, week: row.week, value: awayValue });
    }
  }
  const byTeam = groupBy(observations, (o) => o.teamExternalId);
  for (const [, series] of byTeam) series.sort((a, b) => a.season - b.season || a.week - b.week);
  return byTeam;
}

/** Lag-1 (consecutive-appearance) paired values across ALL teams pooled, plus per-team correlations for teams with >= minGames observations. */
export function lag1Pairs(byTeam: ReadonlyMap<string, readonly TeamSignedObservation[]>): { current: number[]; next: number[] } {
  const current: number[] = [];
  const next: number[] = [];
  for (const [, series] of byTeam) {
    for (let i = 0; i < series.length - 1; i += 1) {
      current.push(series[i].value);
      next.push(series[i + 1].value);
    }
  }
  return { current, next };
}

export function longestSameDirectionStreak(values: readonly number[]): number {
  let longest = 0;
  let current = 0;
  let lastSign = 0;
  for (const v of values) {
    const sign = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (sign !== 0 && sign === lastSign) current += 1;
    else current = sign === 0 ? 0 : 1;
    lastSign = sign;
    longest = Math.max(longest, current);
  }
  return longest;
}
