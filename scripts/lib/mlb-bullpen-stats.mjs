/**
 * mlb-bullpen-stats.mjs
 *
 * Orchestration layer for the bullpen data pipeline. Combines the pure
 * modules (classification, season aggregate, workload/fatigue) with the
 * fetch layer to build one team's full bullpen-stats schema object, and
 * exposes a single entry point (buildBullpenStatsForTeam) for the CLI
 * build script.
 *
 * This module owns the persisted-schema shape for
 * public/data/mlb/team-bullpen-stats.json (see SCHEMA_VERSION). Fields
 * are only included when they can be honestly calculated from available
 * data; contributingPitcherIds from the season aggregate are stripped
 * before persisting (kept only for internal auditability during a run).
 */

import { buildRelieverPool, APPROXIMATION_METHOD } from "./mlb-bullpen-classification.mjs";
import { aggregateSeasonBullpenStats } from "./mlb-bullpen-season-aggregate.mjs";
import { computeBullpenWorkload, LAST7_WINDOW_DAYS } from "./mlb-bullpen-workload.mjs";
import {
  fetchTeamRosterPitchers,
  fetchSeasonPitchingStatsForPitchers,
  fetchRecentRelieverAppearances,
} from "./mlb-bullpen-fetch.mjs";

export const SCHEMA_VERSION = "1.0.0";
export const SOURCE = "mlb_stats_api";

function addDaysIso(dateStr, delta) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * Pure composition: given already-fetched raw inputs for one team,
 * builds the season-aggregate portion of the schema (classification +
 * aggregation). No network access here -- purely deterministic given
 * its inputs, which keeps it easy to test.
 *
 * @param {{ teamId: number, teamAbbr: string, season: number, rosterPitchers: object[], seasonStatsByPitcherId: Map }} input
 */
export function buildSeasonSection(input) {
  const { rosterPitchers, seasonStatsByPitcherId } = input;
  const pool = buildRelieverPool(rosterPitchers, seasonStatsByPitcherId);
  const aggregate = aggregateSeasonBullpenStats(pool.relieverPitcherIds, seasonStatsByPitcherId, {
    rosterPitcherCount: pool.rosterPitcherCount,
  });
  // contributingPitcherIds is retained internally (for auditability
  // during this run / for debugging) but not part of the persisted
  // public schema.
  const { contributingPitcherIds, ...publicAggregate } = aggregate;
  return {
    relieverPitcherIds: pool.relieverPitcherIds,
    relieverCount: pool.relieverPitcherIds.length,
    rosterPitcherCount: pool.rosterPitcherCount,
    approximationMethod: APPROXIMATION_METHOD,
    ...publicAggregate,
    _contributingPitcherIds: contributingPitcherIds,
  };
}

/**
 * Pure composition: given already-fetched recent appearances, builds the
 * workload/fatigue portion of the schema.
 *
 * @param {{ appearances: object[], asOfDate: string }} input
 */
export function buildWorkloadSection(input) {
  return computeBullpenWorkload(input.appearances, { asOfDate: input.asOfDate });
}

/**
 * Full end-to-end build for one team: fetches roster + season pitching
 * stats + recent schedule/boxscores, then composes the season and
 * workload sections into the persisted schema shape.
 *
 * @param {{ teamId: number, teamAbbr: string, season: number, asOfDate: string, sections: ("season"|"workload")[] }} params
 * @param {object} [fetchOptions] - passed through to the fetch layer (fetchImpl, timeoutMs, retries, concurrency)
 */
export async function fetchAndBuildTeamBullpenStats(params, fetchOptions = {}) {
  const { teamId, teamAbbr, season, asOfDate, sections = ["season", "workload"] } = params;
  const warnings = [];

  const rosterPitchers = await fetchTeamRosterPitchers(teamId, season, fetchOptions);
  const result = { teamId, teamAbbr, season, generatedAt: new Date().toISOString(), source: SOURCE };

  let relieverPitcherIds = [];

  if (sections.includes("season")) {
    const pitcherIds = rosterPitchers.map((p) => p.pitcherId).filter(Boolean);
    const { statsByPitcherId, failedPitcherIds } = await fetchSeasonPitchingStatsForPitchers(pitcherIds, season, fetchOptions);
    if (failedPitcherIds.length > 0) {
      warnings.push(`${failedPitcherIds.length} pitcher(s) failed season-stats fetch and are excluded from this refresh`);
    }
    const seasonSection = buildSeasonSection({ rosterPitchers, seasonStatsByPitcherId: statsByPitcherId });
    relieverPitcherIds = seasonSection.relieverPitcherIds;
    result.season = { ...seasonSection, generatedAt: result.generatedAt };
  }

  if (sections.includes("workload")) {
    // Workload needs to know the reliever pool even if the season
    // section wasn't refreshed this pass; callers refreshing workload
    // independently should pass known reliever IDs via params.
    const knownRelieverIds = relieverPitcherIds.length > 0 ? relieverPitcherIds : params.knownRelieverPitcherIds ?? [];
    if (knownRelieverIds.length === 0) {
      warnings.push("workload refresh skipped: no known reliever pool available (season data not yet fetched)");
    } else {
      const window = { startDate: addDaysIso(asOfDate, -LAST7_WINDOW_DAYS), endDate: addDaysIso(asOfDate, -1) };
      const { appearances, failedGamePks } = await fetchRecentRelieverAppearances(
        teamId,
        new Set(knownRelieverIds),
        window,
        fetchOptions
      );
      if (failedGamePks.length > 0) {
        warnings.push(`${failedGamePks.length} recent game(s) failed boxscore fetch and are excluded from workload`);
      }
      result.workload = { ...buildWorkloadSection({ appearances, asOfDate }), generatedAt: result.generatedAt };
    }
  }

  result.warnings = warnings;
  return result;
}

/**
 * Strips internal-only fields before writing the persisted cache file.
 */
export function toPersistableSchema(teamCacheEntry) {
  const { season, ...rest } = teamCacheEntry;
  if (!season) return { ...rest };
  const { _contributingPitcherIds, ...persistableSeason } = season;
  return { ...rest, season: persistableSeason };
}
