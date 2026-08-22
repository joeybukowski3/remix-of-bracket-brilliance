import type { ScorePrediction } from "../phase4/types";
import { computeDistributionStats } from "./residualStats";

export type TotalBucketDiagnostic = { bucketLabel: string; n: number; meanResidual: number | null; residualSd: number | null };

export type TotalDiagnosticsReport = {
  n: number;
  meanPredictedTotal: number | null;
  meanActualTotal: number | null;
  sdPredictedTotal: number | null;
  sdActualTotal: number | null;
  predictedQuantiles: { p10: number | null; p50: number | null; p90: number | null };
  actualQuantiles: { p10: number | null; p50: number | null; p90: number | null };
  byPredictedTotalBucket: TotalBucketDiagnostic[];
  byWeekSegment: TotalBucketDiagnostic[];
  bySeason: TotalBucketDiagnostic[];
};

function quantileOf(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

function bucketStats(label: string, rows: readonly ScorePrediction[]): TotalBucketDiagnostic {
  const residuals = rows.map((r) => (r.projectedTotal as number) - (r.actualTotal as number));
  const stats = computeDistributionStats(residuals);
  return { bucketLabel: label, n: rows.length, meanResidual: stats.mean, residualSd: stats.sd };
}

/**
 * Section 2: quantifies WHY total predictions are poorly calibrated —
 * compares predicted vs actual total spread (variance-compression check),
 * then breaks residual variance down by predicted-total bucket, week
 * segment, and season to localize the problem rather than guessing at it.
 */
export function diagnoseTotalCalibration(predictions: readonly ScorePrediction[]): TotalDiagnosticsReport {
  const rows = predictions.filter(
    (p) => p.projectedTotal !== null && p.actualTotal !== null && p.matchupPopulation === "fbs_vs_fbs",
  );
  const predicted = rows.map((r) => r.projectedTotal as number).sort((a, b) => a - b);
  const actual = rows.map((r) => r.actualTotal as number).sort((a, b) => a - b);
  const predictedStats = computeDistributionStats(predicted);
  const actualStats = computeDistributionStats(actual);

  const totalBuckets = [
    { label: "<45", filter: (v: number) => v < 45 },
    { label: "45-55", filter: (v: number) => v >= 45 && v < 55 },
    { label: "55-65", filter: (v: number) => v >= 55 && v < 65 },
    { label: ">=65", filter: (v: number) => v >= 65 },
  ];
  const byPredictedTotalBucket = totalBuckets.map((b) =>
    bucketStats(b.label, rows.filter((r) => b.filter(r.projectedTotal as number))),
  );

  const weekSegments = [
    { label: "1-4", filter: (w: number) => w <= 4 },
    { label: "5-8", filter: (w: number) => w >= 5 && w <= 8 },
    { label: "9+", filter: (w: number) => w >= 9 },
  ];
  const byWeekSegment = weekSegments.map((s) => bucketStats(s.label, rows.filter((r) => s.filter(r.week))));

  const seasons = [...new Set(rows.map((r) => r.season))].sort((a, b) => a - b);
  const bySeason = seasons.map((s) => bucketStats(String(s), rows.filter((r) => r.season === s)));

  return {
    n: rows.length,
    meanPredictedTotal: predictedStats.mean,
    meanActualTotal: actualStats.mean,
    sdPredictedTotal: predictedStats.sd,
    sdActualTotal: actualStats.sd,
    predictedQuantiles: { p10: quantileOf(predicted, 0.1), p50: quantileOf(predicted, 0.5), p90: quantileOf(predicted, 0.9) },
    actualQuantiles: { p10: quantileOf(actual, 0.1), p50: quantileOf(actual, 0.5), p90: quantileOf(actual, 0.9) },
    byPredictedTotalBucket,
    byWeekSegment,
    bySeason,
  };
}
