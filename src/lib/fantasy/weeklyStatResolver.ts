/**
 * Turns the generated NFL matchup artifacts into the single
 * `TeamStatResolver` the Week-1 rankings table calls per cell.
 *
 * No statistic is computed here. Each artifact is precomputed for all 32 teams
 * and every sample window, so this is a lookup, a format and a percentile —
 * exactly the pattern `matchupMetricsData.ts` and `epaData.ts` already
 * establish.
 *
 * Window selection reuses canonical policy rather than hardcoding a literal:
 *   - EPA and conventional metrics use the site default sample window
 *     (`DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS` -> "season-blend"), which is the
 *     rolling eight-game blend. With no completed 2026 games that window is
 *     each team's final eight games of 2025, and it swaps itself over as the
 *     season progresses without any change here.
 *   - Success rate uses `resolveSuccessPeriods`, asked for a single team, and
 *     takes the most current period that policy allows.
 *
 * PERCENTILES are computed against the artifact's own team keys — the unique
 * 32-team population — never against the player rows on screen, which would
 * weight a team by how many of its players happen to be ranked. Each column's
 * population is built once, memoised, and shared by every row on that team.
 *
 * Every failure is soft. A missing artifact, an unknown team or an absent
 * metric resolves to null and the cell renders "N/A"; the page never blocks on
 * optional enrichment.
 */

import { computeTeamPercentiles, type TeamMetricValue } from "@/lib/fantasy/teamPercentiles";
import type {
  TeamStatResolver,
  TeamStatValue,
  WeeklyStatColumn,
} from "@/lib/fantasy/weeklyRankings";
import { WEEKLY_RANKINGS_SEASON } from "@/lib/fantasy/weeklyRankings";
import { formatEpa, type EpaArtifact } from "@/lib/nfl/epaData";
import {
  artifactWindowId,
  formatMetricValue,
  type MatchupMetricsArtifact,
} from "@/lib/nfl/matchupMetricsData";
import { DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS } from "@/lib/nfl/matchupSampleWindow";
import {
  completedGamesFor,
  formatSuccessRate,
  resolveSuccessPeriods,
  type SuccessPeriodKey,
  type SuccessRatesArtifact,
} from "@/lib/nfl/successRateData";

/** The artifact window both the EPA and conventional-metric lookups read. */
export const WEEKLY_STAT_WINDOW_ID = artifactWindowId(DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS);

export type WeeklyStatArtifacts = {
  epa: EpaArtifact | null;
  metrics: MatchupMetricsArtifact | null;
  success: SuccessRatesArtifact | null;
};

/** A raw metric read, before a percentile is attached. */
type RawStat = { display: string; raw: number; rank: number | null };

/**
 * The success-rate period this page shows for one team: the most current
 * period the shared transition policy permits at that team's completed-game
 * count. Preseason (0 completed) resolves to the 2025 last-eight sample.
 */
export function resolveSuccessPeriodFor(
  artifact: SuccessRatesArtifact | null,
  teamAbbr: string,
): SuccessPeriodKey {
  const completed = completedGamesFor(artifact, WEEKLY_RANKINGS_SEASON, teamAbbr);
  // The policy returns periods most-current first once the season is under way,
  // and the prior-season sample first while it is still young, so the head of
  // the list is always the right single value for a one-column display.
  return resolveSuccessPeriods(completed, completed)[0];
}

export function createWeeklyStatResolver(artifacts: WeeklyStatArtifacts): TeamStatResolver {
  const epaTeams = artifacts.epa?.windows?.[WEEKLY_STAT_WINDOW_ID]?.teams ?? null;
  const metricTeams = artifacts.metrics?.windows?.[WEEKLY_STAT_WINDOW_ID]?.teams ?? null;

  /** One raw read, shared by the per-cell lookup and the population build. */
  function readRaw(teamAbbr: string, column: WeeklyStatColumn): RawStat | null {
    if (!teamAbbr) return null;

    if (column.source === "epa") {
      const tuple = epaTeams?.[teamAbbr]?.metrics?.[column.metricKey];
      if (!tuple) return null;
      const [value, rank] = tuple;
      if (value == null || !Number.isFinite(value)) return null;
      return { display: formatEpa(value), raw: value, rank: rank ?? null };
    }

    if (column.source === "metrics") {
      const tuple = metricTeams?.[teamAbbr]?.metrics?.[column.metricKey];
      if (!tuple) return null;
      const [value, rank] = tuple;
      if (value == null || !Number.isFinite(value)) return null;
      return {
        display: formatMetricValue(column.metricKey, value),
        raw: value,
        rank: rank ?? null,
      };
    }

    const period = resolveSuccessPeriodFor(artifacts.success, teamAbbr);
    const value = artifacts.success?.periods?.[period]?.[teamAbbr]?.metrics?.[column.metricKey];
    if (!value || !Number.isFinite(value.pct)) return null;
    return { display: formatSuccessRate(value), raw: value.pct, rank: value.rank ?? null };
  }

  /** The unique team population backing a column's percentiles. */
  function teamUniverse(source: WeeklyStatColumn["source"]): string[] {
    if (source === "epa") return Object.keys(epaTeams ?? {});
    if (source === "metrics") return Object.keys(metricTeams ?? {});
    const teams = new Set<string>();
    for (const period of Object.values(artifacts.success?.periods ?? {})) {
      for (const abbr of Object.keys(period ?? {})) teams.add(abbr);
    }
    return [...teams];
  }

  // Memoised per column so the 32-team population is built once, not per row.
  const percentileCache = new Map<string, Map<string, number>>();
  function percentilesFor(column: WeeklyStatColumn): Map<string, number> {
    const cacheKey = `${column.source}:${column.metricKey}:${column.direction}`;
    const cached = percentileCache.get(cacheKey);
    if (cached) return cached;

    const population: TeamMetricValue[] = teamUniverse(column.source).map((teamAbbr) => ({
      teamAbbr,
      value: readRaw(teamAbbr, column)?.raw ?? null,
    }));
    const percentiles = computeTeamPercentiles(population, column.direction);
    percentileCache.set(cacheKey, percentiles);
    return percentiles;
  }

  return (teamAbbr: string, column: WeeklyStatColumn): TeamStatValue | null => {
    const stat = readRaw(teamAbbr, column);
    if (!stat) return null;
    return { ...stat, percentile: percentilesFor(column).get(teamAbbr) ?? null };
  };
}
