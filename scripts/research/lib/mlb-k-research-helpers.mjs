/**
 * RESEARCH ONLY -- study mlb-k-high-line-calibration-v1
 *
 * Pure helpers for the high-line strikeout calibration audit. Nothing here is
 * imported by production code; the production projection path is untouched.
 */

/** Market K lines are half-integers in practice, but grade integer lines too. */
export const LINE_BUCKETS = [
  { key: "<=3.5", min: -Infinity, max: 3.5 },
  { key: "4.5", min: 3.51, max: 4.5 },
  { key: "5.5", min: 4.51, max: 5.5 },
  { key: "6.5", min: 5.51, max: 6.5 },
  { key: "7.5", min: 6.51, max: 7.5 },
  { key: "8.5+", min: 7.51, max: Infinity },
];

export function lineBucket(line) {
  if (line === null || line === undefined || !Number.isFinite(Number(line))) return null;
  const value = Number(line);
  for (const bucket of LINE_BUCKETS) {
    if (value >= bucket.min && value <= bucket.max) return bucket.key;
  }
  return null;
}

/** Which side the model recommends. Equality is a genuine no-play, not a lean. */
export function projectionDirection(projected, line) {
  if (!Number.isFinite(projected) || !Number.isFinite(line)) return null;
  if (projected > line) return "over";
  if (projected < line) return "under";
  return "neutral";
}

/** Grades a directional call. Actual exactly on an integer line is a push. */
export function gradeDirection(direction, actualKs, line) {
  if (direction !== "over" && direction !== "under") return null;
  if (!Number.isFinite(actualKs) || !Number.isFinite(line)) return null;
  if (actualKs === line) return "PUSH";
  const marketWentOver = actualKs > line;
  const won = direction === "over" ? marketWentOver : !marketWentOver;
  return won ? "WIN" : "LOSS";
}

/**
 * Exact additive split of projected-minus-actual strikeouts into a workload
 * term and a K-rate term.
 *
 *   projK - actualK
 *     = projRate * projBF - actualRate * actualBF
 *     = projRate * (projBF - actualBF)      <- workload error
 *     + actualBF * (projRate - actualRate)  <- K-rate error
 *
 * The two terms sum to the total error with no residual, by construction.
 * Returns null when the decomposition is not defined (missing or zero BF).
 */
export function decomposeWorkloadError({ projectedKRate, projectedBF, actualKs, actualBF }) {
  if (!Number.isFinite(projectedKRate) || !Number.isFinite(projectedBF)) return null;
  if (!Number.isFinite(actualKs) || !Number.isFinite(actualBF) || actualBF <= 0) return null;
  const actualKRate = actualKs / actualBF;
  const projectedKs = projectedKRate * projectedBF;
  const workloadError = projectedKRate * (projectedBF - actualBF);
  const kRateError = actualBF * (projectedKRate - actualKRate);
  return {
    projectedKs,
    actualKs,
    actualKRate,
    totalError: projectedKs - actualKs,
    workloadError,
    kRateError,
  };
}

/**
 * A row is usable only if the pregame snapshot carries a market line and a
 * projection, and the outcome came from an independent grading source. Rows
 * whose snapshot post-dates the slate are rejected outright.
 */
/** Strict numeric read: null / undefined / "" are absent, not zero. */
function strictNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isLeakageSafeRow(row) {
  if (!row) return false;
  if (strictNumber(row.kLine) === null) return false;
  if (strictNumber(row.v2ProjectedKs) === null) return false;
  // A genuine 0-strikeout outcome is valid and must survive this filter.
  if (strictNumber(row.actualKs) === null) return false;
  if (!row.slateDate || !row.snapshotAt) return false;
  const snapshotDate = String(row.snapshotAt).slice(0, 10);
  return snapshotDate <= String(row.slateDate);
}

export function filterLeakageSafe(rows) {
  return (Array.isArray(rows) ? rows : []).filter(isLeakageSafeRow);
}

// ---------- numeric utilities (all null-safe, none divide by zero) ----------

/**
 * Number(null) and Number("") are 0, not NaN, so null-ish entries have to be
 * dropped before coercion or they silently enter every average as a zero.
 */
export function finite(values) {
  return (Array.isArray(values) ? values : [])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);
}

export function mean(values) {
  const list = finite(values);
  if (!list.length) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

export function median(values) {
  return quantile(values, 0.5);
}

export function quantile(values, q) {
  const list = finite(values).sort((a, b) => a - b);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const position = (list.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return list[lower];
  return list[lower] + (position - lower) * (list[upper] - list[lower]);
}

export function stdev(values) {
  const list = finite(values);
  if (list.length < 2) return null;
  const m = list.reduce((sum, value) => sum + value, 0) / list.length;
  const variance = list.reduce((sum, value) => sum + (value - m) ** 2, 0) / (list.length - 1);
  return Math.sqrt(variance);
}

export function rmse(errors) {
  const list = finite(errors);
  if (!list.length) return null;
  return Math.sqrt(list.reduce((sum, value) => sum + value ** 2, 0) / list.length);
}

export function correlation(pairs) {
  const valid = (Array.isArray(pairs) ? pairs : []).filter(
    ([a, b]) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)),
  );
  if (valid.length < 3) return null;
  const xs = valid.map(([a]) => Number(a));
  const ys = valid.map(([, b]) => Number(b));
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx <= 0 || dy <= 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** Simple OLS y = intercept + slope * x, with the standard error of the slope. */
export function linearRegression(pairs) {
  const valid = (Array.isArray(pairs) ? pairs : []).filter(
    ([a, b]) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)),
  );
  if (valid.length < 3) return null;
  const xs = valid.map(([a]) => Number(a));
  const ys = valid.map(([, b]) => Number(b));
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx <= 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sse += (ys[i] - (intercept + slope * xs[i])) ** 2;
  }
  const n = xs.length;
  const slopeStdError = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : null;
  return {
    n,
    slope,
    intercept,
    slopeStdError,
    tStat: slopeStdError && slopeStdError > 0 ? slope / slopeStdError : null,
    r: correlation(valid),
  };
}

/** Deterministic bootstrap: a fixed-seed LCG, so reruns reproduce exactly. */
export function bootstrapMeanCi(values, { iterations = 2000, seed = 20260906, alpha = 0.05 } = {}) {
  const list = finite(values);
  if (list.length < 2) return null;
  let state = seed >>> 0;
  // Take the HIGH bits: the low bits of an LCG modulo 2^32 have very short
  // periods (bit k repeats every 2^(k+1) draws), so `state % n` degenerates to
  // a fixed cycle whenever n is a power of two -- every resample then contains
  // each element exactly once and the bootstrap CI collapses onto the mean.
  const nextIndex = (bound) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * bound);
  };
  const means = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let sum = 0;
    for (let i = 0; i < list.length; i += 1) sum += list[nextIndex(list.length)];
    means.push(sum / list.length);
  }
  means.sort((a, b) => a - b);
  return {
    mean: mean(list),
    lower: quantile(means, alpha / 2),
    upper: quantile(means, 1 - alpha / 2),
    iterations,
  };
}

/** American odds to implied probability, vig included. */
export function americanToImpliedProbability(odds) {
  if (odds === null || odds === undefined || odds === "") return null;
  const value = Number(String(odds).replace("+", ""));
  if (!Number.isFinite(value) || value === 0) return null;
  return value > 0 ? 100 / (value + 100) : -value / (-value + 100);
}

/** K rate over a window of start logs, pooled (total K / total BF), not a mean of rates. */
export function windowKRate(starts, count) {
  if (!Array.isArray(starts)) return null;
  const window = starts.slice(0, count);
  let k = 0;
  let bf = 0;
  for (const start of window) {
    const startK = Number(start?.k);
    const startBf = Number(start?.bf);
    if (!Number.isFinite(startK) || !Number.isFinite(startBf) || startBf <= 0) continue;
    k += startK;
    bf += startBf;
  }
  if (bf <= 0) return null;
  return k / bf;
}

export function windowAverage(starts, count, field) {
  if (!Array.isArray(starts)) return null;
  return mean(starts.slice(0, count).map((start) => start?.[field]));
}
