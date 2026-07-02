/**
 * mlb-ml-performance-summary.mjs
 *
 * Builds a compact, internal-only empirical performance summary from graded
 * Moneyline archive records: rolling W-L, CLV proxy statistics, and results
 * broken out by Edge Strength tier. Mirrors the structure of
 * mlb-hr-performance-summary.mjs, adapted to game-level win/loss/push
 * outcomes and the two CLV proxies documented in mlb-ml-grading.mjs.
 *
 * IMPORTANT: Edge Strength (`confidence`) is a bounded, linear score derived
 * from weighted factor differentials (see mlbModelEdge.ts /
 * mlb-ml-edge-core.mjs). It has NOT been calibrated against outcomes and
 * must not be interpreted as a win probability. This module reports
 * empirical outcome rates by tier -- what happened historically -- not a
 * validated forecast. See EDGE_STRENGTH_NOTE, always included in output.
 *
 * This file is infrastructure only. No public UI reads its output in
 * Phase 1 (see build-mlb-ml-performance-summary.mjs).
 */

import { getEdgeTierKeyCore } from "./mlb-ml-edge-core.mjs";

export const EDGE_STRENGTH_NOTE =
  "Edge Strength (confidence) reflects how strongly the factor model favors one side over the other. It is a bounded, linear score derived from weighted factor differentials -- it has NOT been calibrated against outcomes and must not be interpreted as a win probability. The rates below describe what happened in the graded sample, not a validated forecast.";

export const EDGE_TIERS = ["strong", "moderate", "slight", "coin-flip"];

const DECIDED_STATUSES = new Set(["win", "loss", "push"]);

function round(value, decimals) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values) {
  const filtered = values.filter((v) => v != null && Number.isFinite(v));
  return filtered.length ? filtered.reduce((sum, v) => sum + v, 0) / filtered.length : null;
}

/**
 * Summarizes CLV for a group of graded records for a single proxy
 * ("sportsbook" or "polymarket"), reading result.clv[proxyKey].
 */
function summarizeClv(records, proxyKey, deltaField) {
  const withClv = records
    .map((r) => r.result?.clv?.[proxyKey])
    .filter((clv) => clv != null && clv[deltaField] != null);
  if (withClv.length === 0) return null;
  const beatCloseCount = withClv.filter((clv) => clv.beatClose === true).length;
  return {
    sampleSize: withClv.length,
    [`avg${deltaField[0].toUpperCase()}${deltaField.slice(1)}`]: round(average(withClv.map((clv) => clv[deltaField])), 4),
    beatCloseRate: round((beatCloseCount / withClv.length) * 100, 1),
  };
}

/**
 * @param {object[]} records  archive records (any status)
 * @returns {object}  a summary block for this group of records
 */
export function summarizeRecordGroup(records) {
  const decided = records.filter((r) => DECIDED_STATUSES.has(r.result?.status));
  const wins = decided.filter((r) => r.result.status === "win").length;
  const losses = decided.filter((r) => r.result.status === "loss").length;
  const pushes = decided.filter((r) => r.result.status === "push").length;
  const decidedNonPush = wins + losses;
  const winPct = decidedNonPush > 0 ? round((wins / decidedNonPush) * 100, 1) : null;

  return {
    totalPicks: records.length,
    totalGraded: decided.length,
    wins,
    losses,
    pushes,
    winPct,
    sportsbookClv: summarizeClv(decided, "sportsbook", "impliedProbabilityDelta"),
    polymarketClv: summarizeClv(decided, "polymarket", "priceDelta"),
  };
}

/**
 * @param {object[]} records
 * @param {string} referenceDateIso  ISO date/time to measure "rolling N days" from (injectable for tests)
 * @returns {object}  performance summary, ready to be written to disk
 */
export function buildPerformanceSummary(records, referenceDateIso = new Date().toISOString()) {
  const now = new Date(referenceDateIso).getTime();
  const daysAgo = (n) => {
    const cutoff = now - n * 24 * 60 * 60 * 1000;
    return records.filter((r) => {
      const t = new Date(r.date).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= now;
    });
  };

  const overall = summarizeRecordGroup(records);
  const rolling7Day = summarizeRecordGroup(daysAgo(7));
  const rolling30Day = summarizeRecordGroup(daysAgo(30));

  const byEdgeTier = {};
  for (const tier of EDGE_TIERS) {
    byEdgeTier[tier] = summarizeRecordGroup(records.filter((r) => getEdgeTierKeyCore(r.confidence) === tier));
  }

  const otherStatuses = {
    pending: records.filter((r) => r.result?.status === "pending").length,
    postponed: records.filter((r) => r.result?.status === "postponed").length,
    cancelled: records.filter((r) => r.result?.status === "cancelled").length,
    unresolved: records.filter((r) => r.result?.status === "unresolved").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    note: EDGE_STRENGTH_NOTE,
    totalArchivedPicks: records.length,
    totalGradedPicks: overall.totalGraded,
    overall,
    rolling7Day,
    rolling30Day,
    byEdgeTier,
    otherStatuses,
  };
}
