/**
 * mlb-k-workload-experiment.mjs  (calibration experiment 3, PURE)
 *
 * ANALYSIS ONLY. Instrumented re-implementation of the production workload
 * projection (`scripts/mlb-k/compute-workload-projection.mjs`,
 * WORKLOAD_MODEL_VERSION "mlb-k-workload-v2"). It reproduces the exact
 * expectedBF / expectedInnings the production module emits and, in addition,
 * exposes every intermediate quantity so the compression source can be measured
 * and small candidate changes can be evaluated without touching production.
 *
 * `decomposeWorkload` MUST stay numerically identical to
 * `computeWorkloadProjection().projection` for the shared inputs. A fidelity
 * test (mlb-k-workload-experiment.test.mjs) asserts this against the real module.
 *
 * Nothing here is imported by production. No I/O, no clock.
 */

export const WORKLOAD_EXPERIMENT_BASE_VERSION = "mlb-k-workload-v2";

/** Production ROLE_LIMITS (verbatim copy; production does not export them). */
export const ROLE_LIMITS = Object.freeze({
  starter: { defaultPitches: 86, pitchMin: 55, pitchMax: 115, bfMin: 12, bfMax: 30, ipMin: 3, ipMax: 8.5 },
  opener: { defaultPitches: 38, pitchMin: 15, pitchMax: 55, bfMin: 4, bfMax: 14, ipMin: 0.7, ipMax: 4 },
  reliever: { defaultPitches: 22, pitchMin: 8, pitchMax: 40, bfMin: 2, bfMax: 10, ipMin: 0.1, ipMax: 3 },
});

/** Production baseline weights / knobs under test. */
export const BASELINE_PARAMS = Object.freeze({
  pitchRecentWeightHi: 0.72, // recent pitch avg weight when samples >= 3
  pitchLeagueWeightHi: 0.28,
  pitchRecentWeightLo: 0.45, // recent pitch avg weight when samples < 3
  pitchLeagueWeightLo: 0.55,
  bfByPitchesWeight: 0.65, // weight on pitch-derived BF estimate
  bfRecentWeight: 0.35, // weight on recency-weighted recent BF
  ipRecentWeight: 0.7,
  ipFromBfWeight: 0.3,
  bfMinFactor: 1, // multiplies limits.bfMin (>1 tightens, <1 widens)
  bfMaxFactor: 1, // multiplies limits.bfMax
  pitchMaxFactor: 1,
  varianceInflation: 1, // post-clamp: mean + k*(expectedBF - mean); 1 = off
});

function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRate(value) {
  const parsed = toFiniteNumber(value);
  if (parsed == null) return null;
  return parsed > 1.5 ? parsed / 100 : parsed;
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function weightedAverage(entries) {
  let total = 0;
  let weight = 0;
  for (const entry of entries) {
    if (!Number.isFinite(entry?.value) || !Number.isFinite(entry?.weight) || entry.weight <= 0) continue;
    total += entry.value * entry.weight;
    weight += entry.weight;
  }
  return weight > 0 ? total / weight : null;
}

function recentWeightedAverage(appearances, key) {
  const valid = appearances
    .map((appearance, index) => ({ value: toFiniteNumber(appearance?.[key]), weight: index + 1 }))
    .filter((entry) => Number.isFinite(entry.value));
  return weightedAverage(valid);
}

function recentWeightedAverageMeta(appearances, key) {
  const used = appearances
    .map((appearance, index) => ({ value: toFiniteNumber(appearance?.[key]), weight: index + 1 }))
    .filter((entry) => Number.isFinite(entry.value));
  return { value: weightedAverage(used), n: used.length };
}

/** Production `classifyWorkloadRole`, verbatim. */
export function classifyWorkloadRole(workloadData = {}) {
  const counts = workloadData?.completeness?.counts ?? {};
  const currentAppearances = toFiniteNumber(counts.currentSeasonAppearances, 0);
  const currentStarts = toFiniteNumber(counts.currentSeasonStarterAppearances, 0);
  const currentReliefAppearances = toFiniteNumber(counts.currentSeasonReliefAppearances, 0);
  const starterSamples = Array.isArray(workloadData?.starts) ? workloadData.starts : [];
  const recentStarterIp = recentWeightedAverage(starterSamples, "inningsPitched");
  const reliefShare = currentAppearances > 0 ? currentReliefAppearances / currentAppearances : 0;
  if (currentAppearances >= 3 && currentStarts <= 1 && reliefShare >= 0.7) return "reliever";
  if (currentStarts >= 2 && recentStarterIp != null && recentStarterIp <= 2.5) return "opener";
  return "starter";
}

/**
 * Instrumented decomposition. Returns { projection, decomp } where
 * projection.{expectedBF, expectedInnings} match production exactly at
 * BASELINE_PARAMS, and decomp exposes every intermediate.
 *
 * @param {object} args same shape production `computeWorkloadProjection` takes
 * @param {object} params override of BASELINE_PARAMS knobs
 */
export function decomposeWorkload(
  { workloadData = {}, opponent = {}, league = {}, context = {} } = {},
  params = BASELINE_PARAMS,
) {
  const p = { ...BASELINE_PARAMS, ...params };
  const starts = Array.isArray(workloadData?.starts) ? workloadData.starts : [];
  const recentAppearances = Array.isArray(workloadData?.recentAppearances) ? workloadData.recentAppearances : [];
  const role = context.role ?? classifyWorkloadRole(workloadData);
  const limits = ROLE_LIMITS[role] ?? ROLE_LIMITS.starter;
  const samples = role === "reliever"
    ? recentAppearances
    : role === "opener"
      ? (starts.length ? starts : recentAppearances)
      : starts;

  const leaguePitches = role === "reliever"
    ? toFiniteNumber(league.relieverAveragePitches, limits.defaultPitches)
    : role === "opener"
      ? toFiniteNumber(league.openerAveragePitches, limits.defaultPitches)
      : toFiniteNumber(league.starterAveragePitches, limits.defaultPitches);
  const leaguePpa = toFiniteNumber(league.pitchesPerPA, 3.9);
  const opponentSeasonPpa = toFiniteNumber(opponent.seasonPitchesPerPA);
  const opponentRecentPpa = toFiniteNumber(opponent.recent14PitchesPerPA);
  const opponentPpa = weightedAverage([
    { value: opponentSeasonPpa, weight: 0.75 },
    { value: opponentRecentPpa, weight: 0.25 },
  ]) ?? leaguePpa;

  const pitchMeta = recentWeightedAverageMeta(samples, "pitches");
  const bfMeta = recentWeightedAverageMeta(samples, "battersFaced");
  const ipMeta = recentWeightedAverageMeta(samples, "inningsPitched");
  const recentPitchAverage = pitchMeta.value;
  const recentBfAverage = bfMeta.value;
  const recentIpAverage = ipMeta.value;

  const enoughSamples = samples.length >= 3;
  const pitchRecentWeight = enoughSamples ? p.pitchRecentWeightHi : p.pitchRecentWeightLo;
  const pitchLeagueWeight = enoughSamples ? p.pitchLeagueWeightHi : p.pitchLeagueWeightLo;

  const pitchMax = limits.pitchMax * p.pitchMaxFactor;
  const expectedPitchLimitRaw = weightedAverage([
    { value: recentPitchAverage, weight: pitchRecentWeight },
    { value: leaguePitches, weight: pitchLeagueWeight },
  ]) ?? leaguePitches;
  const expectedPitchLimit = clamp(expectedPitchLimitRaw, limits.pitchMin, pitchMax);
  const pitchClampHit = expectedPitchLimit !== expectedPitchLimitRaw;

  const expectedBFByPitches = expectedPitchLimit / Math.max(3.2, opponentPpa);
  const bfMin = limits.bfMin * p.bfMinFactor;
  const bfMax = limits.bfMax * p.bfMaxFactor;
  const expectedBFRaw = weightedAverage([
    { value: expectedBFByPitches, weight: p.bfByPitchesWeight },
    { value: recentBfAverage, weight: p.bfRecentWeight },
  ]) ?? expectedBFByPitches;
  let expectedBF = clamp(expectedBFRaw, bfMin, bfMax);
  const bfClampHitPreInflate = expectedBF !== expectedBFRaw;

  const expectedInnings = clamp(
    weightedAverage([
      { value: recentIpAverage, weight: p.ipRecentWeight },
      { value: expectedBF * toFiniteNumber(league.outsPerBF, 0.72) / 3, weight: p.ipFromBfWeight },
    ]) ?? expectedBF * 0.72 / 3,
    limits.ipMin,
    limits.ipMax,
  );

  return {
    projection: {
      role,
      expectedBF: round(expectedBF, 3),
      expectedInnings: round(expectedInnings, 3),
      expectedPitchLimit: round(expectedPitchLimit, 2),
    },
    decomp: {
      role,
      samplesLength: samples.length,
      enoughSamples,
      limits,
      leaguePitches,
      leaguePpa: round(leaguePpa, 4),
      opponentPpa: round(opponentPpa, 4),
      opponentSeasonPpa: round(opponentSeasonPpa, 4),
      opponentRecentPpa: round(opponentRecentPpa, 4),
      recentPitchAverage: round(recentPitchAverage, 3),
      recentPitchN: pitchMeta.n,
      recentBfAverage: round(recentBfAverage, 3),
      recentBfN: bfMeta.n,
      recentIpAverage: round(recentIpAverage, 3),
      recentIpN: ipMeta.n,
      expectedPitchLimitRaw: round(expectedPitchLimitRaw, 3),
      expectedPitchLimit: round(expectedPitchLimit, 3),
      pitchClampHit,
      expectedBFByPitches: round(expectedBFByPitches, 3),
      expectedBFRaw: round(expectedBFRaw, 3),
      expectedBF: round(expectedBF, 3),
      bfClampHit: bfClampHitPreInflate,
      expectedInnings: round(expectedInnings, 3),
    },
  };
}

/**
 * Re-derive expectedBF / expectedInnings for one persisted decomp row under a
 * candidate parameter set. Operates purely on the stored `decomp` block so the
 * full backtest does not have to be re-run per candidate.
 *
 * The pitch->BF path, the BF blend, the caps and an optional post-clamp
 * variance-inflation term are all reconstructed from stored intermediates.
 * `roleMeanBF` is the (dev-set) mean expectedBF for this row's role, needed only
 * when varianceInflation != 1.
 */
export function reprojectFromDecomp(decomp, params = BASELINE_PARAMS, roleMeanBF = null) {
  if (!decomp) return { expectedBF: null, expectedInnings: null };
  const p = { ...BASELINE_PARAMS, ...params };
  const limits = decomp.limits ?? ROLE_LIMITS.starter;
  const enoughSamples = decomp.enoughSamples;
  const pitchRecentWeight = enoughSamples ? p.pitchRecentWeightHi : p.pitchRecentWeightLo;
  const pitchLeagueWeight = enoughSamples ? p.pitchLeagueWeightHi : p.pitchLeagueWeightLo;

  const pitchMax = limits.pitchMax * p.pitchMaxFactor;
  const pitchLimitRaw = weightedAverage([
    { value: decomp.recentPitchAverage, weight: pitchRecentWeight },
    { value: decomp.leaguePitches, weight: pitchLeagueWeight },
  ]) ?? decomp.leaguePitches;
  const pitchLimit = clamp(pitchLimitRaw, limits.pitchMin, pitchMax);

  const opponentPpa = Number.isFinite(decomp.opponentPpa) ? decomp.opponentPpa : decomp.leaguePpa;
  const bfByPitches = pitchLimit / Math.max(3.2, opponentPpa);

  const bfMin = limits.bfMin * p.bfMinFactor;
  const bfMax = limits.bfMax * p.bfMaxFactor;
  const bfRaw = weightedAverage([
    { value: bfByPitches, weight: p.bfByPitchesWeight },
    { value: decomp.recentBfAverage, weight: p.bfRecentWeight },
  ]) ?? bfByPitches;
  let expectedBF = clamp(bfRaw, bfMin, bfMax);

  if (p.varianceInflation !== 1 && Number.isFinite(roleMeanBF)) {
    expectedBF = clamp(roleMeanBF + p.varianceInflation * (expectedBF - roleMeanBF), bfMin, bfMax);
  }

  const expectedInnings = clamp(
    weightedAverage([
      { value: decomp.recentIpAverage, weight: p.ipRecentWeight },
      { value: expectedBF * 0.72 / 3, weight: p.ipFromBfWeight },
    ]) ?? expectedBF * 0.72 / 3,
    limits.ipMin,
    limits.ipMax,
  );

  return { expectedBF: round(expectedBF, 3), expectedInnings: round(expectedInnings, 3) };
}

export { normalizeRate, weightedAverage, clamp };
