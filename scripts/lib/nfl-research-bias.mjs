/**
 * Phase 11A: passing-model bias diagnostics (the mandatory ~+12.5-yard
 * bias test) plus a generic out-of-sample bias-correction evaluator.
 *
 * IMPORTANT: `evaluateBiasCorrection` only ever MEASURES whether a
 * constant correction fit on development rows improves validation-row
 * error -- it never mutates a projection value in production, and no
 * caller in this codebase may apply its output outside this research
 * context (see Phase 11A scope: no production correction in this phase).
 */
import { bias, mae, rmse } from "./nfl-research-metrics.mjs";

const LINE_BUCKET_WIDTH_YARDS = Object.freeze({ passing: 25, rushing: 10, receiving: 10 });
const EDGE_BUCKET_WIDTH_YARDS = Object.freeze({ passing: 15, rushing: 7.5, receiving: 5 });

function bucketize(value, width) {
  if (value == null || width == null || !Number.isFinite(value)) return null;
  const low = Math.floor(value / width) * width;
  return `${low}..${low + width}`;
}

/**
 * @param {readonly object[]} rows  Graded rows (actualYards present) for one market.
 * @param {string} market
 */
export function computeBiasReport(rows, market) {
  const graded = rows.filter((r) => r.actualYards != null);
  const actuals = graded.map((r) => r.actualYards);
  const projections = graded.map((r) => r.projectionYards);

  const overallBias = bias(actuals, projections);

  const byLineBucket = new Map();
  const byEdgeBucket = new Map();
  for (const row of graded) {
    const lineBucket = bucketize(row.sportsbookLine, LINE_BUCKET_WIDTH_YARDS[market]);
    const edgeBucket = bucketize(row.rawEdgeYards, EDGE_BUCKET_WIDTH_YARDS[market]);
    if (lineBucket) {
      if (!byLineBucket.has(lineBucket)) byLineBucket.set(lineBucket, []);
      byLineBucket.get(lineBucket).push(row);
    }
    if (edgeBucket) {
      if (!byEdgeBucket.has(edgeBucket)) byEdgeBucket.set(edgeBucket, []);
      byEdgeBucket.get(edgeBucket).push(row);
    }
  }

  const summarizeBucketMap = (map) =>
    [...map.entries()]
      .map(([label, bucketRows]) => ({
        bucket: label,
        n: bucketRows.length,
        bias: bias(bucketRows.map((r) => r.actualYards), bucketRows.map((r) => r.projectionYards)),
      }))
      .sort((a, b) => parseFloat(a.bucket) - parseFloat(b.bucket));

  const positiveEdgeRows = graded.filter((r) => r.rawEdgeYards > 0);
  const negativeEdgeRows = graded.filter((r) => r.rawEdgeYards < 0);
  const overHitsOnPositiveEdge = positiveEdgeRows.filter((r) => r.outcome === "over").length;
  const underHitsOnNegativeEdge = negativeEdgeRows.filter((r) => r.outcome === "under").length;

  return {
    market,
    n: graded.length,
    overallBias,
    biasByLineBucket: summarizeBucketMap(byLineBucket),
    biasByEdgeBucket: summarizeBucketMap(byEdgeBucket),
    positiveEdgeOverPerformance: {
      n: positiveEdgeRows.length,
      overHitRate: positiveEdgeRows.length ? overHitsOnPositiveEdge / positiveEdgeRows.length : null,
    },
    negativeEdgeUnderPerformance: {
      n: negativeEdgeRows.length,
      underHitRate: negativeEdgeRows.length ? underHitsOnNegativeEdge / negativeEdgeRows.length : null,
    },
  };
}

/**
 * Fits a constant additive correction (mean projection error) on
 * `developmentRows`, then evaluates it ONLY on `validationRows` -- never on
 * the same rows the correction was fit from. Returns before/after MAE/RMSE
 * on validation so the caller can judge whether the correction actually
 * helps out-of-sample, without ever applying it anywhere else.
 */
export function evaluateBiasCorrection(developmentRows, validationRows) {
  const devGraded = developmentRows.filter((r) => r.actualYards != null);
  const valGraded = validationRows.filter((r) => r.actualYards != null);
  if (devGraded.length === 0 || valGraded.length === 0) {
    return { evaluable: false, reason: "insufficient_graded_rows" };
  }

  // mean(projection - actual) on development == the constant to SUBTRACT from projection.
  const correction = bias(
    devGraded.map((r) => r.actualYards),
    devGraded.map((r) => r.projectionYards),
  );

  const valActuals = valGraded.map((r) => r.actualYards);
  const valProjections = valGraded.map((r) => r.projectionYards);
  const valCorrected = valProjections.map((p) => p - correction);

  return {
    evaluable: true,
    correction,
    developmentN: devGraded.length,
    validationN: valGraded.length,
    beforeCorrection: { mae: mae(valActuals, valProjections), rmse: rmse(valActuals, valProjections) },
    afterCorrection: { mae: mae(valActuals, valCorrected), rmse: rmse(valActuals, valCorrected) },
  };
}
