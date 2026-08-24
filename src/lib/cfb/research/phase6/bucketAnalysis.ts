import { MIN_BUCKET_SAMPLE_SIZE } from "./config";
import { wilsonInterval } from "./statisticalUncertainty";

export type BucketDefinition = { label: string; min: number; max: number };

export type BucketResult = {
  label: string;
  n: number;
  hitRate: number | null;
  wilsonLow: number | null;
  wilsonHigh: number | null;
  meanEdgeMagnitude: number | null;
  /** Section 14/28: false when n < MIN_BUCKET_SAMPLE_SIZE — the caller must not treat this bucket as validated evidence. */
  sufficientSample: boolean;
};

/**
 * Generic edge-bucket analysis (Sections 14/15): buckets rows by
 * |edgeMagnitude|, reports the "selected side" hit rate (whichever side
 * the model favors more than the market) with a Wilson confidence
 * interval, and flags buckets below MIN_BUCKET_SAMPLE_SIZE as
 * insufficient rather than reporting a headline number from n=12.
 */
export function bucketByEdgeMagnitude<T>(
  rows: readonly T[],
  edgeMagnitude: (row: T) => number,
  hit: (row: T) => boolean | null,
  buckets: readonly BucketDefinition[],
): BucketResult[] {
  return buckets.map((bucket) => {
    const inBucket = rows.filter((r) => {
      const mag = Math.abs(edgeMagnitude(r));
      return mag >= bucket.min && mag < bucket.max;
    });
    const withOutcome = inBucket.filter((r) => hit(r) !== null);
    const hits = withOutcome.filter((r) => hit(r) === true).length;
    const n = withOutcome.length;
    const wilson = wilsonInterval(hits, n);
    return {
      label: bucket.label,
      n,
      hitRate: n === 0 ? null : hits / n,
      wilsonLow: wilson?.low ?? null,
      wilsonHigh: wilson?.high ?? null,
      meanEdgeMagnitude: inBucket.length === 0 ? null : inBucket.reduce((s, r) => s + Math.abs(edgeMagnitude(r)), 0) / inBucket.length,
      sufficientSample: n >= MIN_BUCKET_SAMPLE_SIZE,
    };
  });
}
