/**
 * mlb-batter-hand-splits.mjs
 *
 * Orchestration layer for the batter hand-split data pipeline. Combines
 * the fetch layer (mlb-hand-split-fetch.mjs) with the pure shrinkage
 * formula (mlb-hand-split-shrinkage.mjs) to build one player's full
 * hand-split cache entry, and exposes a single entry point
 * (fetchAndBuildPlayerHandSplits) for the CLI build script.
 *
 * This module owns the persisted-schema shape for
 * public/data/mlb/batter-hand-splits-cache.json (see SCHEMA_VERSION).
 *
 * Fallback source: the SAME player's current-season overall hitting line
 * (fetched alongside the splits) -- NOT a static or dynamic league-average
 * baseline. Per Phase 2 hand-split-cache approval (2026-07-02): "Do not
 * add or fabricate static league-average vs-hand baselines in this
 * implementation." If the batter's own overall-season data isn't
 * available/trustworthy, the split for that side is marked unavailable
 * (neutral/no-op) rather than falling back to any invented number.
 */

import { fetchBatterHandSplits, fetchBatterOverallSeasonStats } from "./mlb-hand-split-fetch.mjs";
import { shrinkSplitMetrics } from "./mlb-hand-split-shrinkage.mjs";

export const SCHEMA_VERSION = "1.0.0";
export const SOURCE = "mlb_stats_api";

/**
 * Builds the persisted split record for one side (vsLeft or vsRight),
 * given the raw split metrics (may be null -- zero appearances against
 * this hand) and the batter's overall-season fallback metrics.
 */
function buildSplitRecord(rawMetrics, fallbackMetrics) {
  const shrinkResult = shrinkSplitMetrics({ raw: rawMetrics ?? { plateAppearances: 0 }, fallback: fallbackMetrics });

  return {
    plateAppearances: rawMetrics?.plateAppearances ?? 0,
    atBats: rawMetrics?.atBats ?? null,
    hits: rawMetrics?.hits ?? null,
    homeRuns: rawMetrics?.homeRuns ?? null,
    walks: rawMetrics?.walks ?? null,
    strikeouts: rawMetrics?.strikeouts ?? null,
    battingAverage: rawMetrics?.battingAverage ?? null,
    onBasePercentage: rawMetrics?.onBasePercentage ?? null,
    sluggingPercentage: rawMetrics?.sluggingPercentage ?? null,
    ops: rawMetrics?.ops ?? null,
    hrRate: rawMetrics?.hrRate ?? null,
    sampleSizeTier: shrinkResult.sampleSizeTier,
    // dataQuality mirrors the sample-size tier when a shrunk estimate is
    // actually available; "unavailable" when there's no trustworthy
    // fallback to blend toward (see mlb-hand-split-shrinkage.mjs).
    dataQuality: shrinkResult.available ? shrinkResult.sampleSizeTier : "unavailable",
    shrinkageApplied: shrinkResult.shrinkageApplied,
    shrinkageWeight: shrinkResult.shrinkageWeight,
    fallbackUsed: shrinkResult.fallbackUsed,
    fallbackSource: shrinkResult.fallbackSource,
    raw: rawMetrics ?? null,
    shrunk: shrinkResult.shrunk,
  };
}

/**
 * Pure composition: given already-fetched raw splits + overall stats for
 * one player, builds the persisted per-player schema entry. No network
 * access here -- deterministic given its inputs, which keeps it easy to
 * test with fixtures.
 *
 * @param {object} input
 * @param {number} input.playerId
 * @param {number} input.season
 * @param {{ vsLeft: object|null, vsRight: object|null }} input.splits
 * @param {object|null} input.overall
 */
export function buildPlayerHandSplitEntry({ playerId, season, splits, overall }) {
  const warnings = [];
  if (!overall) warnings.push("overall season stats unavailable; hand-split fallback disabled for this player");

  return {
    playerId,
    season,
    source: SOURCE,
    warnings,
    splits: {
      vsLeft: buildSplitRecord(splits?.vsLeft ?? null, overall),
      vsRight: buildSplitRecord(splits?.vsRight ?? null, overall),
    },
  };
}

/**
 * Full end-to-end build for one player: fetches hand splits + overall
 * season stats, then composes them into the persisted schema shape.
 *
 * @param {number} playerId
 * @param {number} season
 * @param {object} [fetchOptions] - passed through to the fetch layer (fetchImpl, timeoutMs, retries, concurrency)
 */
export async function fetchAndBuildPlayerHandSplits(playerId, season, fetchOptions = {}) {
  const [splits, overall] = await Promise.all([
    fetchBatterHandSplits(playerId, season, fetchOptions),
    fetchBatterOverallSeasonStats(playerId, season, fetchOptions),
  ]);
  return buildPlayerHandSplitEntry({ playerId, season, splits, overall });
}
