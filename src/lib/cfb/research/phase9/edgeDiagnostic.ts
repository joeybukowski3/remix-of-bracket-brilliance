import { computeSpreadEdgeRows } from "../phase6/spreadEdge";
import { computeTotalEdgeRows } from "../phase6/totalEdge";
import { computeMoneylineEdgeRows } from "../phase6/moneylineEdge";
import { bucketByEdgeMagnitude } from "../phase6/bucketAnalysis";
import { computeMoneylineRoi } from "../phase6/roiAnalysis";
import { MONEYLINE_EV_THRESHOLDS, PROBABILITY_EDGE_BUCKETS, SPREAD_EDGE_BUCKETS } from "../phase6/config";
import type { MarketModelJoinRow } from "../phase6/types";

/**
 * Sections 16/17/18 — diagnostic-only re-check using Phase 6's EXISTING
 * predeclared buckets/thresholds (imported verbatim, never retuned here —
 * Section 15's hard rule). Reuses Phase 6's own edge-computation, bucket,
 * and ROI functions unmodified.
 */
export function buildEdgeDiagnostics(joinRows: readonly MarketModelJoinRow[]) {
  const spreadRows = computeSpreadEdgeRows(joinRows, "LATEST_OBSERVED");
  const totalRows = computeTotalEdgeRows(joinRows, "LATEST_OBSERVED");
  const moneylineRows = computeMoneylineEdgeRows(joinRows);

  const spreadBuckets = bucketByEdgeMagnitude(
    spreadRows,
    (r) => r.homeSpreadEdgePoints,
    (r) => (r.homeCovered === null ? null : r.homeSpreadEdgePoints >= 0 ? r.homeCovered : !r.homeCovered),
    SPREAD_EDGE_BUCKETS,
  );

  const totalBuckets = bucketByEdgeMagnitude(
    totalRows,
    (r) => r.totalEdgePoints,
    (r) => (r.wentOver === null ? null : r.totalEdgePoints >= 0 ? r.wentOver : !r.wentOver),
    SPREAD_EDGE_BUCKETS,
  );

  const moneylineBuckets = bucketByEdgeMagnitude(
    moneylineRows,
    (r) => r.homeProbabilityEdge,
    (r) => (r.homeProbabilityEdge >= 0 ? r.homeWon : !r.homeWon),
    PROBABILITY_EDGE_BUCKETS,
  );

  const moneylineRoiByThreshold = MONEYLINE_EV_THRESHOLDS.map((threshold) => ({ threshold, roi: computeMoneylineRoi(moneylineRows, threshold) }));

  return {
    spread: { n: spreadRows.length, buckets: spreadBuckets },
    total: { n: totalRows.length, buckets: totalBuckets },
    moneyline: { n: moneylineRows.length, buckets: moneylineBuckets, roiByThreshold: moneylineRoiByThreshold },
  };
}
