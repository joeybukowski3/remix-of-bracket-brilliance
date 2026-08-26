/**
 * Phase 11A: rawEdgeYards bucketing for edge-value research. Bucket widths
 * are deliberately market-specific -- passing yardage swings are larger
 * than rushing/receiving, so a single bucket width would over-coarsen the
 * smaller markets. These are descriptive bucket boundaries only, not tuned
 * betting thresholds.
 */
import { americanRoi } from "./nfl-research-odds-math.mjs";

const BUCKET_WIDTH_YARDS = Object.freeze({ passing: 15, rushing: 7.5, receiving: 5 });

/** Symmetric buckets around 0, e.g. for width 5: [-inf,-10),[-10,-5),[-5,0),[0,5),[5,10),[10,inf). */
export function bucketizeEdge(rawEdgeYards, market) {
  const width = BUCKET_WIDTH_YARDS[market];
  if (width == null || rawEdgeYards == null || !Number.isFinite(rawEdgeYards)) return null;
  const index = Math.floor(rawEdgeYards / width);
  const low = index * width;
  const high = low + width;
  return `${low}..${high}`;
}

function roiForRow(row) {
  if (row.outcome == null || row.outcome === "push") return americanRoi(row.overPrice ?? row.underPrice, "push");
  const impliedSide = row.rawEdgeYards > 0 ? "over" : "under";
  const price = impliedSide === "over" ? row.overPrice : row.underPrice;
  if (price == null) return null;
  const result = row.outcome === impliedSide ? "win" : "loss";
  return americanRoi(price, result);
}

/**
 * Aggregates research rows into edge buckets, one market at a time (callers
 * should pre-filter to a single market before calling). Rows without a
 * graded `outcome` (actualYards missing) contribute to `n` but not to
 * hit-rate/ROI, which are computed over graded rows only.
 */
export function aggregateEdgeBuckets(rows, market) {
  const byBucket = new Map();
  for (const row of rows) {
    const bucket = bucketizeEdge(row.rawEdgeYards, market);
    if (bucket == null) continue;
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push(row);
  }

  const result = [];
  for (const [bucket, bucketRows] of byBucket) {
    const graded = bucketRows.filter((r) => r.outcome != null);
    const impliedOverRows = graded.filter((r) => r.rawEdgeYards > 0);
    const impliedUnderRows = graded.filter((r) => r.rawEdgeYards < 0);
    const overHits = impliedOverRows.filter((r) => r.outcome === "over").length;
    const underHits = impliedUnderRows.filter((r) => r.outcome === "under").length;
    const avgActualVsLine = graded.length
      ? graded.reduce((s, r) => s + (r.actualVsLine ?? 0), 0) / graded.length
      : null;
    const avgProjectionError = graded.length
      ? graded.reduce((s, r) => s + (r.projectionError ?? 0), 0) / graded.length
      : null;
    const rois = graded.map(roiForRow).filter((v) => v != null);
    const avgRoi = rois.length ? rois.reduce((s, v) => s + v, 0) / rois.length : null;

    result.push({
      bucket,
      n: bucketRows.length,
      gradedN: graded.length,
      overHitRate: impliedOverRows.length ? overHits / impliedOverRows.length : null,
      underHitRate: impliedUnderRows.length ? underHits / impliedUnderRows.length : null,
      avgActualVsLine,
      avgProjectionError,
      avgRoi,
    });
  }

  return result.sort((a, b) => parseFloat(a.bucket) - parseFloat(b.bucket));
}
