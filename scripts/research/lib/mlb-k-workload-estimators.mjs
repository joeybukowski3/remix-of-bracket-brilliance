/**
 * RESEARCH ONLY -- study mlb-k-archive-outcome-repair-and-workload-dispersion-v1
 *
 * Leakage-safe workload estimators for the batters-faced dispersion audit.
 * Nothing here is imported by production; scripts/mlb-k/compute-workload-projection.mjs
 * is read for its constants only and is not modified.
 *
 * EVERY estimator in this file reads only pregame fields:
 *   row.recentStarts  (newest first, as archived)
 *   row.seasonBattersFaced / row.seasonGamesStarted (pregame season totals)
 *   row.inBfPerInning, row.inPitchCountTrend
 * None of them may read row.kLine, row.oddsOver, row.oddsUnder, row.actualKs,
 * row.actualBF or row.actualIP. The market line is an evaluation variable only.
 */
import { mean, median, quantile, stdev } from "./mlb-k-research-helpers.mjs";

// ---- production workload constants, mirrored read-only ----
export const STARTER_BF_MIN = 12;
export const STARTER_BF_MAX = 30;
export const STARTER_IP_MIN = 3;
export const STARTER_IP_MAX = 8.5;

const finiteOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Pulls a numeric field out of archived recent starts, newest first, keeping
 * only positive readings. A zero is a missing reading in this archive (the
 * detail artifact writes 0 when batters faced or pitch count was unavailable),
 * not a real 0-batter start.
 */
export function startSeries(row, field, limit = 5) {
  const starts = Array.isArray(row?.recentStarts) ? row.recentStarts.slice(0, limit) : [];
  return starts.map((start) => finiteOrNull(start?.[field])).filter((value) => value !== null && value > 0);
}

/** Recency weights matching production: newest start carries the most weight. */
export function recencyWeightedMean(valuesNewestFirst) {
  const values = Array.isArray(valuesNewestFirst) ? valuesNewestFirst : [];
  if (!values.length) return null;
  let total = 0;
  let weight = 0;
  for (let i = 0; i < values.length; i += 1) {
    const w = values.length - i;
    total += values[i] * w;
    weight += w;
  }
  return weight > 0 ? total / weight : null;
}

/** Exponentially weighted mean, newest first. halfLife is in starts. */
export function ewmaMean(valuesNewestFirst, { halfLife = 2 } = {}) {
  const values = Array.isArray(valuesNewestFirst) ? valuesNewestFirst : [];
  if (!values.length) return null;
  const decay = Math.pow(0.5, 1 / Math.max(1e-9, halfLife));
  let total = 0;
  let weight = 0;
  for (let i = 0; i < values.length; i += 1) {
    const w = Math.pow(decay, i);
    total += values[i] * w;
    weight += w;
  }
  return weight > 0 ? total / weight : null;
}

/** Symmetric trimmed mean; falls back to the plain mean when too few points. */
export function trimmedMean(values, { trim = 0.2 } = {}) {
  const sorted = (Array.isArray(values) ? values : []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const drop = Math.floor(sorted.length * trim);
  if (drop === 0 || sorted.length - 2 * drop < 1) return mean(sorted);
  return mean(sorted.slice(drop, sorted.length - drop));
}

/** Winsorized mean: tail values are pulled to the quantile, never discarded. */
export function winsorizedMean(values, { limit = 0.2 } = {}) {
  const sorted = (Array.isArray(values) ? values : []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const low = quantile(sorted, limit);
  const high = quantile(sorted, 1 - limit);
  if (low === null || high === null) return mean(sorted);
  return mean(sorted.map((v) => Math.min(high, Math.max(low, v))));
}

/**
 * A start is "clearly non-representative" when it is far below the pitcher's
 * own other recent starts -- an injury exit or an ejection, not a workload
 * signal. Defined relative to the MEDIAN of the OTHER starts so one short
 * outing cannot define its own baseline, and only ever applied when enough
 * other starts remain to judge against.
 */
export function flagShortStarts(valuesNewestFirst, { ratio = 0.5, minOthers = 3 } = {}) {
  const values = (Array.isArray(valuesNewestFirst) ? valuesNewestFirst : []).filter((v) => Number.isFinite(v));
  return values.map((value, index) => {
    const others = values.filter((_, i) => i !== index);
    if (others.length < minOthers) return false;
    const reference = median(others);
    return reference !== null && reference > 0 && value < ratio * reference;
  });
}

export function excludeShortStarts(valuesNewestFirst, options = {}) {
  const values = (Array.isArray(valuesNewestFirst) ? valuesNewestFirst : []).filter((v) => Number.isFinite(v));
  const flags = flagShortStarts(values, options);
  const kept = values.filter((_, i) => !flags[i]);
  // Never return an empty series: if every start looked short, none of them were.
  return kept.length ? kept : values;
}

/** Pregame season batters faced per start, when both totals are available. */
export function seasonBfPerStart(row) {
  const bf = finiteOrNull(row?.seasonBattersFaced);
  const gs = finiteOrNull(row?.seasonGamesStarted);
  if (bf === null || gs === null || gs <= 0) return null;
  return bf / gs;
}

const clampStarterBf = (value) =>
  value === null ? null : Math.min(STARTER_BF_MAX, Math.max(STARTER_BF_MIN, value));

/**
 * The catalogue of leakage-safe batters-faced estimators under comparison.
 * "model" is the archived production projection, carried through unchanged as
 * the incumbent; every other entry is a research-only alternative.
 *
 * Each estimator returns null when its inputs are unavailable, and the study
 * scores every estimator on the SAME rows so the comparison is like for like.
 */
export const BF_ESTIMATORS = Object.freeze({
  model: (row) => finiteOrNull(row?.v2ProjectedBF),
  seasonPerStart: (row) => seasonBfPerStart(row),
  last3Mean: (row) => mean(startSeries(row, "bf", 3)),
  last5Mean: (row) => mean(startSeries(row, "bf", 5)),
  last5Median: (row) => median(startSeries(row, "bf", 5)),
  last5RecencyWeighted: (row) => recencyWeightedMean(startSeries(row, "bf", 5)),
  last5Ewma: (row) => ewmaMean(startSeries(row, "bf", 5), { halfLife: 2 }),
  last5TrimmedMean: (row) => trimmedMean(startSeries(row, "bf", 5), { trim: 0.2 }),
  last5WinsorizedMean: (row) => winsorizedMean(startSeries(row, "bf", 5), { limit: 0.2 }),
  last5ShortExcludedMean: (row) => mean(excludeShortStarts(startSeries(row, "bf", 5))),
});

export const IP_ESTIMATORS = Object.freeze({
  model: (row) => finiteOrNull(row?.v2ProjectedInnings),
  last3Mean: (row) => mean(startSeries(row, "ip", 3)),
  last5Mean: (row) => mean(startSeries(row, "ip", 5)),
  last5Median: (row) => median(startSeries(row, "ip", 5)),
  last5RecencyWeighted: (row) => recencyWeightedMean(startSeries(row, "ip", 5)),
  last5Ewma: (row) => ewmaMean(startSeries(row, "ip", 5), { halfLife: 2 }),
  last5TrimmedMean: (row) => trimmedMean(startSeries(row, "ip", 5), { trim: 0.2 }),
  last5WinsorizedMean: (row) => winsorizedMean(startSeries(row, "ip", 5), { limit: 0.2 }),
  last5ShortExcludedMean: (row) => mean(excludeShortStarts(startSeries(row, "ip", 5))),
});

// ------------------------------- candidate variants -------------------------------

/**
 * Research-only candidate workload projections. Each one is a modification of
 * the archived production BF, expressed as a pure function of that BF plus
 * pregame-only inputs, so the incumbent stays the reference point.
 */

/**
 * Robust short-start handling: replaces the recent-start component of the
 * production blend with a short-start-excluded mean, then re-applies the
 * production 0.35 recent weight and the starter clamp.
 *
 * The archived expectedBF is 0.65 * bfByPitches + 0.35 * recentBfMean, so the
 * pitch-derived half is left untouched rather than re-derived from inputs the
 * archive does not carry.
 */
export function robustShortStartBf(row) {
  const modelBf = finiteOrNull(row?.v2ProjectedBF);
  const series = startSeries(row, "bf", 5);
  if (modelBf === null || series.length < 3) return modelBf;
  const recentMean = mean(series);
  const robustMean = mean(excludeShortStarts(series));
  if (recentMean === null || robustMean === null) return modelBf;
  return clampStarterBf(modelBf + 0.35 * (robustMean - recentMean));
}

/**
 * Season blend: pulls the projection part of the way toward the pitcher's own
 * season batters faced per start. Season BF/start is a wider-dispersion,
 * lower-estimation-variance summary of true workload level than five starts.
 */
export function seasonBlendBf(row, { weight = 0.3 } = {}) {
  const modelBf = finiteOrNull(row?.v2ProjectedBF);
  const seasonBf = seasonBfPerStart(row);
  if (modelBf === null) return null;
  if (seasonBf === null) return modelBf;
  return clampStarterBf((1 - weight) * modelBf + weight * seasonBf);
}

/**
 * Variance-aware recent weighting: when a pitcher's recent batters-faced
 * readings are stable, trust the recent mean more; when they are volatile,
 * stay with the production blend. Volatility is the coefficient of variation
 * of the pitcher's own recent starts, so the rule needs no league-wide fit and
 * cannot leak an outcome.
 */
export function volatilityWeightedBf(row, { maxShift = 0.35, cvReference = 0.25 } = {}) {
  const modelBf = finiteOrNull(row?.v2ProjectedBF);
  const series = startSeries(row, "bf", 5);
  if (modelBf === null || series.length < 3) return modelBf;
  const m = mean(series);
  const sd = stdev(series);
  if (m === null || sd === null || m <= 0) return modelBf;
  const cv = sd / m;
  const trust = Math.max(0, Math.min(1, 1 - cv / cvReference));
  return clampStarterBf(modelBf + maxShift * trust * (m - modelBf));
}

/**
 * Sample-size weighting: blends toward season BF/start in proportion to how
 * much season evidence exists, in the same beta-binomial spirit the shrinkage
 * study settled on for K rate. Fail-closed to the model projection.
 */
export function sampleSizeBlendBf(row, { k = 10 } = {}) {
  const modelBf = finiteOrNull(row?.v2ProjectedBF);
  const seasonBf = seasonBfPerStart(row);
  const gs = finiteOrNull(row?.seasonGamesStarted);
  if (modelBf === null) return null;
  if (seasonBf === null || gs === null || gs < 0) return modelBf;
  const weight = gs / (gs + k);
  return clampStarterBf((1 - weight) * modelBf + weight * seasonBf);
}

export const BF_CANDIDATES = Object.freeze({
  production: (row) => finiteOrNull(row?.v2ProjectedBF),
  robustShortStart: (row) => robustShortStartBf(row),
  seasonBlend20: (row) => seasonBlendBf(row, { weight: 0.2 }),
  seasonBlend30: (row) => seasonBlendBf(row, { weight: 0.3 }),
  seasonBlend50: (row) => seasonBlendBf(row, { weight: 0.5 }),
  volatilityWeighted: (row) => volatilityWeightedBf(row),
  sampleSizeBlend: (row) => sampleSizeBlendBf(row, { k: 10 }),
  robustPlusSeason30: (row) => {
    const robust = robustShortStartBf(row);
    const seasonBf = seasonBfPerStart(row);
    if (robust === null) return null;
    if (seasonBf === null) return robust;
    return clampStarterBf(0.7 * robust + 0.3 * seasonBf);
  },
});

// ------------------------------- workload dispersion -------------------------------

/** Pitcher-specific recent BF spread, shrunk toward a league SD. */
export function shrunkWorkloadSd(row, { leagueSd, k = 3 } = {}) {
  const series = startSeries(row, "bf", 5);
  const own = stdev(series);
  if (!Number.isFinite(leagueSd)) return own;
  if (own === null) return leagueSd;
  const n = series.length;
  const weight = n / (n + k);
  return weight * own + (1 - weight) * leagueSd;
}

/**
 * Expected strikeouts integrated over a symmetric workload distribution.
 *
 * With a constant K rate, E[K] = rate * E[BF] EXACTLY: the workload spread
 * cancels. This helper exists to demonstrate that, not to exploit it -- any
 * movement it produces comes only from the starter BF clamp truncating the
 * distribution, which is a real but small effect.
 */
export function expectedKsOverWorkload({ kRate, expectedBf, workloadSd, nodes = 5, clampBf = true }) {
  const rate = finiteOrNull(kRate);
  const bf = finiteOrNull(expectedBf);
  const sd = finiteOrNull(workloadSd);
  if (rate === null || bf === null) return null;
  if (sd === null || sd <= 0) return rate * bf;
  // Fixed symmetric nodes in SD units, with fixed weights. Deterministic.
  const offsets = [-2, -1, 0, 1, 2].slice(0, nodes);
  const weights = [0.05, 0.25, 0.4, 0.25, 0.05].slice(0, nodes);
  let total = 0;
  let weightSum = 0;
  for (let i = 0; i < offsets.length; i += 1) {
    const raw = bf + offsets[i] * sd;
    const node = clampBf ? Math.min(STARTER_BF_MAX, Math.max(STARTER_BF_MIN, raw)) : raw;
    total += weights[i] * rate * node;
    weightSum += weights[i];
  }
  return weightSum > 0 ? total / weightSum : null;
}
