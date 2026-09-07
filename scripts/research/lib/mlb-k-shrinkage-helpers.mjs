/**
 * RESEARCH ONLY -- study mlb-k-high-line-calibration-v2 (shrinkage experiment)
 *
 * Pure helpers for the pitcher-skill shrinkage experiment. Nothing here is
 * imported by production code; src/lib/mlb/kProjectionV2.ts is untouched.
 *
 * The single lever under test is alpha in
 *
 *   shrunkSkill = leagueKRate + alpha * (pitcherSkillRate - leagueKRate)
 *
 * Every other production component (opponent environment, matchup multiplier,
 * matchup clamp, K-rate clamp, projected batters faced) is frozen.
 *
 * HARD RULE: no alpha function in this file may read the market line. The
 * market line is an evaluation and bucketing variable only.
 */

// ---- production constants, mirrored read-only from src/lib/mlb/kProjectionV2.ts ----
export const PRODUCTION_ALPHA = 0.55;
export const OPPONENT_MATCHUP_MULTIPLIER = 0.75;
export const MIN_K_RATE = 0.1;
export const MAX_K_RATE = 0.4;

/**
 * Reference spread of (pitcherSkillRate - leagueKRate) used to express the
 * continuous and logistic skill forms in interpretable z units. Declared as a
 * fixed constant rather than fitted, so the alpha function never depends on
 * the evaluation sample.
 */
export const SKILL_EXCESS_REFERENCE_SD = 0.045;

/** Smallest pregame pool that may be used for an empirical percentile. */
export const MIN_PERCENTILE_POOL = 100;

export const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export const clamp01 = (value) => clamp(value, 0, 1);

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Recovers the league K-rate anchor the row was actually built against, from
 * the archived opponent environment rate and matchup adjustment:
 *   matchupAdjustment = (opponentEnvironmentRate - leagueKRate) * 0.75
 * Only valid while the adjustment is inside the +/-0.035 clamp; callers must
 * reject clamped rows (there are none in this archive).
 */
export function recoverLeagueAnchor(opponentEnvRate, matchupAdjustment) {
  const env = finiteOrNull(opponentEnvRate);
  const adj = finiteOrNull(matchupAdjustment);
  if (env === null || adj === null) return null;
  return env - adj / OPPONENT_MATCHUP_MULTIPLIER;
}

/** Replays the frozen production pipeline with a caller-supplied alpha. */
export function projectWithAlpha({ alpha, pitcherSkillRate, leagueAnchor, matchupAdjustment, projectedBF }) {
  const a = finiteOrNull(alpha);
  const skill = finiteOrNull(pitcherSkillRate);
  const league = finiteOrNull(leagueAnchor);
  const bf = finiteOrNull(projectedBF);
  if (a === null || skill === null || league === null || bf === null) return null;
  const shrunk = league + clamp01(a) * (skill - league);
  const kRate = clamp(shrunk + (finiteOrNull(matchupAdjustment) ?? 0), MIN_K_RATE, MAX_K_RATE);
  return { alpha: clamp01(a), shrunkKRate: shrunk, projectedKRate: kRate, projectedKs: kRate * bf };
}

// ---------------------------- VARIANT A: sample size ----------------------------

/**
 * alpha = BF / (BF + k), the standard beta-binomial shrinkage weight for a
 * rate observed over BF trials against a prior worth k trials.
 *
 * Fail-closed contract: when season BF is absent, negative or non-finite the
 * row falls back to the current production alpha (0.55), so an unavailable
 * input can never make a projection more aggressive than production is today.
 * A genuine BF of 0 is available information, not a missing input, and
 * correctly yields alpha 0 (full shrink to league).
 */
export function sampleSizeAlpha(seasonBattersFaced, k, { fallbackAlpha = PRODUCTION_ALPHA } = {}) {
  const kk = finiteOrNull(k);
  if (kk === null || kk <= 0) return { alpha: clamp01(fallbackAlpha), source: "fallback:invalid-k" };
  const bf = finiteOrNull(seasonBattersFaced);
  if (bf === null || bf < 0) return { alpha: clamp01(fallbackAlpha), source: "fallback:missing-bf" };
  return { alpha: clamp01(bf / (bf + kk)), source: "sample-size" };
}

// -------------------------- VARIANT B: skill dependent --------------------------

/**
 * Deterministic percentile of `value` inside an ascending-sorted pool, using
 * the midpoint of the tied rank block so equal values share one percentile.
 * Returns a number in [0, 1]; null for an empty pool.
 */
export function percentileInSortedPool(sortedPool, value) {
  if (!Array.isArray(sortedPool) || sortedPool.length === 0) return null;
  const v = finiteOrNull(value);
  if (v === null) return null;
  let below = 0;
  let equal = 0;
  for (const entry of sortedPool) {
    if (entry < v) below += 1;
    else if (entry === v) equal += 1;
  }
  return (below + equal / 2) / sortedPool.length;
}

/** Linear interpolation between two knots, clamped outside the span. */
function interpolate(x, x0, x1, y0, y1) {
  if (x1 === x0) return y1;
  const t = clamp01((x - x0) / (x1 - x0));
  return y0 + t * (y1 - y0);
}

/**
 * Piecewise percentile form. Monotone non-decreasing in percentile by
 * construction, provided the knot alphas are non-decreasing.
 *
 *   pct <  p60          -> baseAlpha
 *   p60 <= pct < p80    -> interpolate baseAlpha -> midAlpha
 *   p80 <= pct < p90    -> interpolate midAlpha  -> highAlpha
 *   pct >= p90          -> interpolate highAlpha -> topAlpha across p90..1
 *
 * Fail-closed: a null percentile (pool too small) returns baseAlpha.
 */
export function piecewisePercentileAlpha(
  percentile,
  {
    baseAlpha = PRODUCTION_ALPHA,
    midAlpha = 0.7,
    highAlpha = 0.85,
    topAlpha = 1.0,
    p60 = 0.6,
    p80 = 0.8,
    p90 = 0.9,
  } = {},
) {
  const pct = finiteOrNull(percentile);
  if (pct === null) return { alpha: clamp01(baseAlpha), source: "fallback:no-percentile" };
  if (pct < p60) return { alpha: clamp01(baseAlpha), source: "piecewise" };
  if (pct < p80) return { alpha: clamp01(interpolate(pct, p60, p80, baseAlpha, midAlpha)), source: "piecewise" };
  if (pct < p90) return { alpha: clamp01(interpolate(pct, p80, p90, midAlpha, highAlpha)), source: "piecewise" };
  return { alpha: clamp01(interpolate(pct, p90, 1, highAlpha, topAlpha)), source: "piecewise" };
}

/**
 * Continuous one-sided ramp on excess skill, in reference-SD units:
 *   z = (pitcherSkillRate - leagueKRate) / SKILL_EXCESS_REFERENCE_SD
 *   alpha = clamp01(baseAlpha + slope * max(0, z))
 *
 * One-sided on purpose: the audit found the miss is upper-tail compression, so
 * below-average pitchers keep the production alpha and are never shrunk harder.
 */
export function continuousSkillAlpha(
  pitcherSkillRate,
  leagueKRate,
  { baseAlpha = PRODUCTION_ALPHA, slope = 0.2, referenceSd = SKILL_EXCESS_REFERENCE_SD, twoSided = false } = {},
) {
  const skill = finiteOrNull(pitcherSkillRate);
  const league = finiteOrNull(leagueKRate);
  if (skill === null || league === null || !(referenceSd > 0)) {
    return { alpha: clamp01(baseAlpha), source: "fallback:missing-skill" };
  }
  const z = (skill - league) / referenceSd;
  const drive = twoSided ? z : Math.max(0, z);
  return { alpha: clamp01(baseAlpha + slope * drive), source: "continuous", z };
}

/**
 * Logistic form, kept interpretable: alpha rises from `low` to `high` around a
 * skill excess of `midpointZ` reference SDs with steepness `steepnessZ`.
 */
export function logisticSkillAlpha(
  pitcherSkillRate,
  leagueKRate,
  {
    low = PRODUCTION_ALPHA,
    high = 1.0,
    midpointZ = 1.0,
    steepnessZ = 0.6,
    referenceSd = SKILL_EXCESS_REFERENCE_SD,
  } = {},
) {
  const skill = finiteOrNull(pitcherSkillRate);
  const league = finiteOrNull(leagueKRate);
  if (skill === null || league === null || !(referenceSd > 0) || !(steepnessZ > 0)) {
    return { alpha: clamp01(low), source: "fallback:missing-skill" };
  }
  const z = (skill - league) / referenceSd;
  const logistic = 1 / (1 + Math.exp(-(z - midpointZ) / steepnessZ));
  return { alpha: clamp01(low + (high - low) * logistic), source: "logistic", z };
}

/**
 * Combined form: a sample-size alpha lifted modestly for high-skill pitchers.
 *   alpha = clamp01(alphaSampleSize + uplift * max(0, z))
 * Deliberately additive and one-sided so the sample-size term stays the base
 * and the skill term can only ever add reach, never remove it.
 */
export function combinedAlpha({
  seasonBattersFaced,
  k,
  pitcherSkillRate,
  leagueKRate,
  uplift = 0.1,
  referenceSd = SKILL_EXCESS_REFERENCE_SD,
}) {
  const base = sampleSizeAlpha(seasonBattersFaced, k);
  const skill = finiteOrNull(pitcherSkillRate);
  const league = finiteOrNull(leagueKRate);
  if (skill === null || league === null || !(referenceSd > 0)) {
    return { alpha: base.alpha, source: base.source + "+fallback:missing-skill" };
  }
  const z = (skill - league) / referenceSd;
  return { alpha: clamp01(base.alpha + uplift * Math.max(0, z)), source: base.source + "+skill-uplift", z };
}

// ------------------------------ temporal splitting ------------------------------

/**
 * Splits rows by slate DATE, never by row index, so every row from a given
 * slate lands in exactly one side and no slate straddles the boundary.
 * `devFraction` is applied to the count of distinct dates.
 */
export function temporalSplit(rows, { devFraction = 0.6 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const dates = [...new Set(list.map((row) => row.slateDate))].sort();
  if (!dates.length) return { devDates: [], validationDates: [], development: [], validation: [], cutoffDate: null };
  const devCount = clamp(Math.round(dates.length * devFraction), 1, Math.max(1, dates.length - 1));
  const devDates = dates.slice(0, devCount);
  const validationDates = dates.slice(devCount);
  const devSet = new Set(devDates);
  return {
    devDates,
    validationDates,
    cutoffDate: devDates[devDates.length - 1],
    development: list.filter((row) => devSet.has(row.slateDate)),
    validation: list.filter((row) => !devSet.has(row.slateDate)),
  };
}

/**
 * Rolling-origin folds by slate date. Fold i trains on every slate strictly
 * before its origin and scores the next block of slates, so the scored window
 * never precedes or overlaps the training window.
 */
export function rollingOriginFolds(rows, { folds = 4, minTrainDates = 10 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const dates = [...new Set(list.map((row) => row.slateDate))].sort();
  if (dates.length <= minTrainDates || folds < 1) return [];
  const remaining = dates.length - minTrainDates;
  const step = Math.max(1, Math.floor(remaining / folds));
  const out = [];
  for (let i = 0; i < folds; i += 1) {
    const start = minTrainDates + i * step;
    const end = i === folds - 1 ? dates.length : Math.min(dates.length, start + step);
    if (start >= dates.length || start >= end) break;
    const trainDates = new Set(dates.slice(0, start));
    const testDates = new Set(dates.slice(start, end));
    out.push({
      fold: i + 1,
      trainRange: dates[0] + ".." + dates[start - 1],
      testRange: dates[start] + ".." + dates[end - 1],
      train: list.filter((row) => trainDates.has(row.slateDate)),
      test: list.filter((row) => testDates.has(row.slateDate)),
    });
  }
  return out;
}

/**
 * Leakage guard for any temporal split: every scored slate must come strictly
 * after every training slate.
 */
export function assertTemporalOrder(trainRows, testRows) {
  const trainDates = (Array.isArray(trainRows) ? trainRows : []).map((row) => row.slateDate).filter(Boolean);
  const testDates = (Array.isArray(testRows) ? testRows : []).map((row) => row.slateDate).filter(Boolean);
  if (!trainDates.length || !testDates.length) return { ok: true, violations: [], maxTrainDate: null };
  const maxTrain = trainDates.reduce((a, b) => (a > b ? a : b));
  const violations = [...new Set(testDates.filter((date) => date <= maxTrain))].sort();
  return { ok: violations.length === 0, violations, maxTrainDate: maxTrain };
}

// ------------------------------- candidate ranking -------------------------------

/**
 * Deterministic ranking. Sorts by each key in order; ties fall through to the
 * next key and finally to the candidate id, so the order never depends on the
 * input order or on sort stability.
 */
export function rankCandidates(candidates, keys) {
  const list = [...(Array.isArray(candidates) ? candidates : [])];
  const spec = Array.isArray(keys) ? keys : [];
  return list.sort((a, b) => {
    for (const entry of spec) {
      const direction = entry.direction || "asc";
      const av = finiteOrNull(a ? a[entry.key] : null);
      const bv = finiteOrNull(b ? b[entry.key] : null);
      if (av === null && bv === null) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av !== bv) return direction === "desc" ? bv - av : av - bv;
    }
    return String(a && a.id ? a.id : "").localeCompare(String(b && b.id ? b.id : ""));
  });
}
