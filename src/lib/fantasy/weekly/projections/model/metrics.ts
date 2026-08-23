import { kendallRankCorrelation, spearmanRankCorrelation } from "../../backtest/metrics";
import type { CalibrationBucket, PointAccuracyMetrics, RankingSecondaryMetrics } from "./types";

/**
 * Point-accuracy metrics are PRIMARY (spec section 10); ranking metrics are
 * secondary and must never override point accuracy in model selection.
 */

export type ScoredRow = { actualFantasyPoints: number; predicted: number | null; playerId: string };

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pearson(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const meanA = mean(a)!;
  const meanB = mean(b)!;
  let numerator = 0;
  let sumA = 0;
  let sumB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const da = a[index] - meanA;
    const db = b[index] - meanB;
    numerator += da * db;
    sumA += da * da;
    sumB += db * db;
  }
  const denominator = Math.sqrt(sumA * sumB);
  return denominator ? numerator / denominator : null;
}

export function evaluatePointAccuracy(rows: readonly ScoredRow[]): PointAccuracyMetrics {
  const scored = rows.filter((row): row is ScoredRow & { predicted: number } => row.predicted != null);
  const errors = scored.map((row) => row.predicted - row.actualFantasyPoints);
  const absoluteErrors = errors.map((error) => Math.abs(error));
  return {
    rows: rows.length,
    scoredRows: scored.length,
    coverage: rows.length ? scored.length / rows.length : 0,
    mae: mean(absoluteErrors),
    rmse: absoluteErrors.length ? Math.sqrt(mean(errors.map((error) => error * error))!) : null,
    bias: mean(errors),
    medianAbsoluteError: median(absoluteErrors),
    pearson: pearson(scored.map((row) => row.actualFantasyPoints), scored.map((row) => row.predicted)),
  };
}

/** Fixed-width projected-point buckets (spec section 10). */
const CALIBRATION_BUCKET_WIDTH = 5;
const CALIBRATION_BUCKET_MAX = 40;

export function evaluateCalibration(rows: readonly ScoredRow[]): readonly CalibrationBucket[] {
  const scored = rows.filter((row): row is ScoredRow & { predicted: number } => row.predicted != null);
  const buckets: CalibrationBucket[] = [];
  for (let start = 0; start < CALIBRATION_BUCKET_MAX; start += CALIBRATION_BUCKET_WIDTH) {
    const end = start + CALIBRATION_BUCKET_WIDTH;
    const inBucket = scored.filter((row) => row.predicted >= start && (end >= CALIBRATION_BUCKET_MAX ? true : row.predicted < end));
    buckets.push({
      bucketLabel: end >= CALIBRATION_BUCKET_MAX ? `${start}+` : `${start}-${end}`,
      bucketMinProjected: start,
      bucketMaxProjected: end,
      rows: inBucket.length,
      meanProjected: mean(inBucket.map((row) => row.predicted)),
      meanActual: mean(inBucket.map((row) => row.actualFantasyPoints)),
    });
  }
  return buckets.filter((bucket) => bucket.rows > 0);
}

export function evaluateRankingSecondary(
  rows: readonly (ScoredRow & { season: number; week: number })[],
  topTierThreshold: number,
): RankingSecondaryMetrics {
  const groups = new Map<string, (ScoredRow & { season: number; week: number })[]>();
  for (const row of rows) {
    const key = `${row.season}|${row.week}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const spearmans: number[] = [];
  const kendalls: number[] = [];
  let hits = 0;
  let slots = 0;
  for (const group of groups.values()) {
    const scored = group.filter((row): row is typeof row & { predicted: number } => row.predicted != null);
    if (scored.length >= 2) {
      const spearman = spearmanRankCorrelation(scored.map((row) => row.actualFantasyPoints), scored.map((row) => row.predicted));
      const kendall = kendallRankCorrelation(scored.map((row) => row.actualFantasyPoints), scored.map((row) => row.predicted));
      if (spearman != null) spearmans.push(spearman);
      if (kendall != null) kendalls.push(kendall);
    }
    const tierSize = Math.min(topTierThreshold, group.length);
    const actualTop = new Set(
      [...group].sort((a, b) => b.actualFantasyPoints - a.actualFantasyPoints).slice(0, tierSize).map((row) => row.playerId),
    );
    const predictedTop = new Set(
      [...scored].sort((a, b) => b.predicted - a.predicted).slice(0, Math.min(tierSize, scored.length)).map((row) => row.playerId),
    );
    hits += [...predictedTop].filter((id) => actualTop.has(id)).length;
    slots += tierSize;
  }
  return {
    spearman: mean(spearmans),
    kendall: mean(kendalls),
    topTierHitRate: slots ? hits / slots : null,
    topTierThreshold,
  };
}
