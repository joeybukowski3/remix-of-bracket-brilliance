export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

export function mae(errors: readonly number[]): number | null {
  return mean(errors.map((v) => Math.abs(v)));
}

export function stdDev(values: readonly number[]): number | null {
  const m = mean(values);
  if (m === null || values.length < 2) return null;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Pearson correlation; null when either series has zero variance or fewer than 2 paired points. */
export function correlation(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export function groupBy<T, K>(rows: readonly T[], keyFn: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const arr = map.get(key) ?? [];
    arr.push(row);
    map.set(key, arr);
  }
  return map;
}

/** Assigns each value to a decile 0-9 by rank (0 = lowest decile). Ties broken by stable input order. Returns a map value -> decile index for the SAME array position. */
export function assignDeciles(values: readonly (number | null)[], decileCount = 10): (number | null)[] {
  const indexed = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  const sorted = [...indexed].sort((a, b) => a.v - b.v);
  const result: (number | null)[] = values.map(() => null);
  sorted.forEach((item, rank) => {
    const decile = Math.min(decileCount - 1, Math.floor((rank / sorted.length) * decileCount));
    result[item.i] = decile;
  });
  return result;
}

export type BucketDef = { label: string; min: number; max: number };

export function bucketFor(value: number, buckets: readonly BucketDef[]): string | null {
  for (const b of buckets) {
    if (value >= b.min && value < b.max) return b.label;
  }
  return null;
}
