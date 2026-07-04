/**
 * mlb-phase2-shadow-comparison.mjs
 *
 * Phase 2 -- internal, shadow-only live-vs-shadow comparison reporting.
 * Pure helpers only: reads already-generated raw records (ml-picks-raw.json
 * picks[], hr-props-raw.json batters[]) and builds a comparison artifact.
 * No filesystem/network access here -- the CLI build script
 * (scripts/build-mlb-phase2-shadow-comparison.mjs) owns I/O.
 *
 * NEVER read by any live scoring path, generator, archive, grader, social
 * post, or public UI. This module only SUMMARIZES what the generators
 * already computed and attached under `phase2Shadow` -- it never
 * recomputes or second-guesses a live or shadow score.
 *
 * `liveTier` is the one derived (not directly copied) field in the
 * Moneyline record: the ML raw record does not currently expose a tier
 * string on the live pick itself (only pick/differential/confidence), so
 * this module derives it via the existing, already-tested
 * getEdgeTierKeyCore(confidence) from mlb-ml-edge-core.mjs -- the same
 * canonical tier logic every other ML shadow component already uses
 * (see parkShadowTier/projectedIpShadowTier). This is not a new/invented
 * tier concept, just applying the existing one to the live confidence
 * value for display parity with the shadow tiers.
 */

import { getEdgeTierKeyCore } from "./mlb-ml-edge-core.mjs";

export const SCHEMA_VERSION = "1.0.0";
const DEFAULT_TOP_MOVERS_LIMIT = 5;

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

function round(value, decimals) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** @returns {number|null} null for empty/all-non-finite input, never NaN. */
export function mean(values) {
  const filtered = (values ?? []).filter((v) => Number.isFinite(v));
  if (!filtered.length) return null;
  return filtered.reduce((sum, v) => sum + v, 0) / filtered.length;
}

/** @returns {number|null} null for empty/all-non-finite input, never NaN. */
export function median(values) {
  const filtered = (values ?? []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const mid = Math.floor(filtered.length / 2);
  return filtered.length % 2 === 0 ? (filtered[mid - 1] + filtered[mid]) / 2 : filtered[mid];
}

/** Bounded to [0,1]; 0 (never NaN/Infinity) for a zero/invalid denominator. */
export function safeRate(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.min(1, Math.max(0, numerator / denominator));
}

/** Average-rank method for ties, ascending (lowest value = rank 1). Used internally by spearmanCorrelation. */
function rankValues(values) {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) j += 1;
    const averageRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k += 1) ranks[order[k]] = averageRank;
    i = j + 1;
  }
  return ranks;
}

/**
 * Spearman rank correlation between two parallel numeric arrays, with
 * average-rank tie handling. Pairs with a non-finite x or y are dropped
 * first (both values must be present to compare that pair).
 *
 * @param {{x:number, y:number}[]} pairs
 * @returns {number|null} in [-1,1]; null when fewer than 2 valid pairs or
 *   either side has zero variance (undefined correlation, never
 *   fabricated as 0).
 */
export function spearmanCorrelation(pairs) {
  const valid = (pairs ?? []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (valid.length < 2) return null;
  const ranksX = rankValues(valid.map((p) => p.x));
  const ranksY = rankValues(valid.map((p) => p.y));
  const meanX = mean(ranksX);
  const meanY = mean(ranksY);
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let i = 0; i < valid.length; i += 1) {
    const dx = ranksX[i] - meanX;
    const dy = ranksY[i] - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) return null;
  return round(covariance / Math.sqrt(varianceX * varianceY), 4);
}

function sortStableDescendingByKey(items, keyFn) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = keyFn(b.item) - keyFn(a.item);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map((entry) => entry.item);
}

/** Largest |value| first, stable tiebreak by original order. */
export function selectTopMovers(records, { valueFn, limit = DEFAULT_TOP_MOVERS_LIMIT } = {}) {
  const withValue = records.filter((r) => Number.isFinite(valueFn(r)));
  return sortStableDescendingByKey(withValue, (r) => Math.abs(valueFn(r))).slice(0, limit);
}

/** Largest positive value first, stable tiebreak. Records with value <= 0 excluded. */
export function selectTopPositiveMovers(records, { valueFn, limit = DEFAULT_TOP_MOVERS_LIMIT } = {}) {
  const withValue = records.filter((r) => Number.isFinite(valueFn(r)) && valueFn(r) > 0);
  return sortStableDescendingByKey(withValue, (r) => valueFn(r)).slice(0, limit);
}

/** Most negative value first, stable tiebreak. Records with value >= 0 excluded. */
export function selectTopNegativeMovers(records, { valueFn, limit = DEFAULT_TOP_MOVERS_LIMIT } = {}) {
  const withValue = records.filter((r) => Number.isFinite(valueFn(r)) && valueFn(r) < 0);
  return sortStableDescendingByKey(withValue, (r) => -valueFn(r)).slice(0, limit);
}

/** Counts of each distinct value (stringified; null/undefined bucketed as "null"). */
export function buildDataQualityDistribution(values) {
  const distribution = {};
  for (const value of values ?? []) {
    const key = value == null ? "null" : String(value);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  return distribution;
}

/** Simple numeric-distribution summary; a well-formed zero-count shape for empty/all-non-finite input. */
export function buildContributionDistribution(values) {
  const filtered = (values ?? []).filter((v) => Number.isFinite(v));
  if (!filtered.length) return { count: 0, mean: null, median: null, min: null, max: null };
  return {
    count: filtered.length,
    mean: round(mean(filtered), 3),
    median: round(median(filtered), 3),
    min: Math.min(...filtered),
    max: Math.max(...filtered),
  };
}

// ---------------------------------------------------------------------------
// Moneyline
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {object} pick  One entry from ml-picks-raw.json's picks[].
 * @param {{ date?: string|null }} [context]
 * @returns {object|null} null if the pick is too malformed to identify (missing gameId/gameKey).
 */
export function buildMoneylineComparisonRecord(pick, { date = null } = {}) {
  if (!isPlainObject(pick) || pick.gameId == null || !pick.gameKey) return null;

  const shadow = isPlainObject(pick.phase2Shadow) ? pick.phase2Shadow : null;
  const liveConfidence = Number.isFinite(pick.confidence) ? pick.confidence : null;
  const liveDifferential = Number.isFinite(pick.differential) ? pick.differential : null;
  const liveTier = liveConfidence != null ? getEdgeTierKeyCore(liveConfidence) : null;

  const projectedIpShadow = shadow?.projectedIpShadow ?? null;
  const parkShadow = shadow?.parkShadow ?? null;
  const awayBullpenShadow = projectedIpShadow?.awayBullpenShadow ?? null;
  const homeBullpenShadow = projectedIpShadow?.homeBullpenShadow ?? null;

  const combinedShadowPick = shadow?.combinedShadowPick ?? null;
  const combinedShadowDifferential = Number.isFinite(shadow?.combinedShadowDifferential) ? shadow.combinedShadowDifferential : null;
  const combinedShadowTier = shadow?.combinedShadowTier ?? null;

  const differentialDelta =
    combinedShadowDifferential != null && liveDifferential != null ? round(combinedShadowDifferential - liveDifferential, 2) : null;

  return {
    date,
    gameId: pick.gameId,
    gameKey: pick.gameKey,
    livePick: pick.pick ?? null,
    liveDifferential,
    liveTier,
    liveConfidenceOrEdgeStrength: liveConfidence,
    projectedIpShadow,
    parkShadow,
    bullpenShadow: shadow ? { away: awayBullpenShadow, home: homeBullpenShadow } : null,
    combinedShadowPick,
    combinedShadowDifferential,
    combinedShadowTier,
    pickFlip: shadow ? Boolean(shadow.pickFlipped) : false,
    differentialDelta,
    componentAvailability: shadow
      ? {
          projectedIp: shadow.enabledComponents?.projectedIp ?? false,
          park: shadow.enabledComponents?.park ?? false,
          bullpenAway: awayBullpenShadow?.available ?? null,
          bullpenHome: homeBullpenShadow?.available ?? null,
        }
      : null,
    componentDataQuality: shadow
      ? {
          park: parkShadow?.parkDataQuality ?? null,
          bullpenAway: awayBullpenShadow?.dataQuality ?? null,
          bullpenHome: homeBullpenShadow?.dataQuality ?? null,
        }
      : null,
    componentContributions: shadow
      ? {
          bullpenAway: Number.isFinite(awayBullpenShadow?.contribution) ? awayBullpenShadow.contribution : null,
          bullpenHome: Number.isFinite(homeBullpenShadow?.contribution) ? homeBullpenShadow.contribution : null,
        }
      : null,
    productionModelVersion: shadow?.liveModelVersion ?? null,
    shadowExperimentVersion: shadow?.shadowExperimentVersion ?? null,
    hasShadow: shadow != null,
  };
}

/**
 * @param {object[]} picks  ml-picks-raw.json's picks[] (may be empty/absent).
 * @param {{ date?: string|null }} [context]
 * @returns {{ records: object[], summary: object, skippedCount: number }}
 */
export function buildMoneylineComparison(picks, { date = null } = {}) {
  const input = Array.isArray(picks) ? picks : [];
  let skippedCount = 0;
  const records = [];
  for (const pick of input) {
    const record = buildMoneylineComparisonRecord(pick, { date });
    if (record) records.push(record);
    else skippedCount += 1;
  }

  const totalRecords = records.length;
  const withShadow = records.filter((r) => r.hasShadow);
  const recordsWithShadow = withShadow.length;
  const recordsWithoutShadow = totalRecords - recordsWithShadow;
  const flips = withShadow.filter((r) => r.pickFlip);
  const deltas = withShadow.map((r) => r.differentialDelta).filter((v) => Number.isFinite(v));
  const absDeltas = deltas.map((v) => Math.abs(v));

  const summary = {
    totalRecords,
    recordsWithShadow,
    recordsWithoutShadow,
    shadowAvailabilityRate: round(safeRate(recordsWithShadow, totalRecords), 4),
    pickFlipCount: flips.length,
    pickFlipRate: round(safeRate(flips.length, recordsWithShadow), 4),
    averageAbsoluteDifferentialDelta: round(mean(absDeltas), 3),
    medianAbsoluteDifferentialDelta: round(median(absDeltas), 3),
    maxAbsoluteDifferentialDelta: absDeltas.length ? Math.max(...absDeltas) : null,
    topMovers: selectTopMovers(withShadow, { valueFn: (r) => r.differentialDelta }).map((r) => ({
      gameKey: r.gameKey,
      differentialDelta: r.differentialDelta,
      pickFlip: r.pickFlip,
    })),
    componentAvailabilityRates: {
      projectedIp: round(safeRate(withShadow.filter((r) => r.componentAvailability?.projectedIp).length, recordsWithShadow), 4),
      park: round(safeRate(withShadow.filter((r) => r.componentAvailability?.park).length, recordsWithShadow), 4),
      bullpenAway: round(safeRate(withShadow.filter((r) => r.componentAvailability?.bullpenAway === true).length, recordsWithShadow), 4),
      bullpenHome: round(safeRate(withShadow.filter((r) => r.componentAvailability?.bullpenHome === true).length, recordsWithShadow), 4),
    },
    componentDataQualityDistribution: {
      park: buildDataQualityDistribution(withShadow.map((r) => r.componentDataQuality?.park)),
      bullpenAway: buildDataQualityDistribution(withShadow.map((r) => r.componentDataQuality?.bullpenAway)),
      bullpenHome: buildDataQualityDistribution(withShadow.map((r) => r.componentDataQuality?.bullpenHome)),
    },
    componentContributionDistribution: {
      bullpenAway: buildContributionDistribution(withShadow.map((r) => r.componentContributions?.bullpenAway)),
      bullpenHome: buildContributionDistribution(withShadow.map((r) => r.componentContributions?.bullpenHome)),
    },
  };

  return { records, summary, skippedCount };
}

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------

/**
 * Computes a stable, deterministic shadow rank across a slate of batters.
 * Only batters with a finite combinedShadowScore participate; higher
 * score ranks better (rank 1 = best). Ties are broken first by the
 * existing live rank (ascending), then by playerId (ascending) for full
 * determinism regardless of input order.
 *
 * @param {object[]} batters  Raw batter records (each may or may not have phase2Shadow).
 * @returns {Map<number, number>} original-array-index -> shadowRank (1-based)
 */
export function computeShadowRanks(batters) {
  const candidates = batters
    .map((batter, index) => ({
      index,
      playerId: Number.isFinite(batter?.playerId) ? batter.playerId : null,
      liveRank: Number.isFinite(batter?.hrScoreRank) ? batter.hrScoreRank : null,
      combinedShadowScore: Number.isFinite(batter?.phase2Shadow?.combinedShadowScore) ? batter.phase2Shadow.combinedShadowScore : null,
    }))
    .filter((c) => c.combinedShadowScore != null);

  const ranked = candidates.sort((a, b) => {
    if (b.combinedShadowScore !== a.combinedShadowScore) return b.combinedShadowScore - a.combinedShadowScore;
    const liveA = a.liveRank ?? Infinity;
    const liveB = b.liveRank ?? Infinity;
    if (liveA !== liveB) return liveA - liveB;
    const idA = a.playerId ?? Infinity;
    const idB = b.playerId ?? Infinity;
    return idA - idB;
  });

  const shadowRankByIndex = new Map();
  ranked.forEach((candidate, position) => shadowRankByIndex.set(candidate.index, position + 1));
  return shadowRankByIndex;
}

/**
 * @param {object} batter  One entry from hr-props-raw.json's batters[].
 * @param {{ date?: string|null, shadowRank?: number|null }} [context]
 * @returns {object|null} null if the batter is too malformed to identify (missing playerId/gameId).
 */
export function buildHrComparisonRecord(batter, { date = null, shadowRank = null } = {}) {
  if (!isPlainObject(batter) || batter.playerId == null || batter.gameId == null) return null;

  const shadow = isPlainObject(batter.phase2Shadow) ? batter.phase2Shadow : null;
  const liveScore = Number.isFinite(batter.hrScore) ? batter.hrScore : null;
  const liveRank = Number.isFinite(batter.hrScoreRank) ? batter.hrScoreRank : null;
  const combinedShadowScore = Number.isFinite(shadow?.combinedShadowScore) ? shadow.combinedShadowScore : null;

  const scoreDelta = combinedShadowScore != null && liveScore != null ? round(combinedShadowScore - liveScore, 2) : null;
  // Positive rankMovement = moved UP (toward rank 1) in the shadow ranking.
  const rankMovement = shadowRank != null && liveRank != null ? liveRank - shadowRank : null;

  return {
    date,
    playerId: batter.playerId,
    playerName: batter.player ?? null,
    gameId: batter.gameId,
    gameKey: batter.gameKey ?? null,
    liveScore,
    liveRank,
    bullpenShadow: shadow?.bullpenShadow ?? null,
    handSplitShadow: shadow?.handSplitShadow ?? null,
    combinedShadowScore,
    shadowRank,
    rankMovement,
    scoreDelta,
    componentAvailability: shadow?.componentAvailability ?? null,
    componentDataQuality: shadow?.componentDataQuality ?? null,
    componentContributions: shadow?.componentContributions ?? null,
    productionModelVersion: shadow?.liveModelVersion ?? null,
    shadowExperimentVersion: shadow?.shadowExperimentVersion ?? null,
    hasShadow: shadow != null,
  };
}

/**
 * @param {object[]} batters  hr-props-raw.json's batters[] (may be empty/absent).
 * @param {{ date?: string|null }} [context]
 * @returns {{ records: object[], summary: object, skippedCount: number }}
 */
export function buildHrComparison(batters, { date = null } = {}) {
  const input = Array.isArray(batters) ? batters : [];
  const shadowRankByIndex = computeShadowRanks(input);

  let skippedCount = 0;
  const records = [];
  input.forEach((batter, index) => {
    const record = buildHrComparisonRecord(batter, { date, shadowRank: shadowRankByIndex.get(index) ?? null });
    if (record) records.push(record);
    else skippedCount += 1;
  });

  const totalRecords = records.length;
  const withShadow = records.filter((r) => r.hasShadow);
  const recordsWithShadow = withShadow.length;
  const recordsWithoutShadow = totalRecords - recordsWithShadow;

  const rankMovements = withShadow.map((r) => r.rankMovement).filter((v) => Number.isFinite(v));
  const absRankMovements = rankMovements.map((v) => Math.abs(v));
  const scoreDeltas = withShadow.map((r) => r.scoreDelta).filter((v) => Number.isFinite(v));
  const absScoreDeltas = scoreDeltas.map((v) => Math.abs(v));

  const spearmanPairs = records
    .filter((r) => Number.isFinite(r.liveScore) && Number.isFinite(r.combinedShadowScore))
    .map((r) => ({ x: r.liveScore, y: r.combinedShadowScore }));

  const summary = {
    totalRecords,
    recordsWithShadow,
    recordsWithoutShadow,
    shadowAvailabilityRate: round(safeRate(recordsWithShadow, totalRecords), 4),
    liveVsShadowSpearman: spearmanCorrelation(spearmanPairs),
    averageAbsoluteRankMovement: round(mean(absRankMovements), 3),
    medianAbsoluteRankMovement: round(median(absRankMovements), 3),
    maxRankMovement: rankMovements.length ? Math.max(...rankMovements) : null,
    averageAbsoluteScoreDelta: round(mean(absScoreDeltas), 3),
    topPositiveMovers: selectTopPositiveMovers(withShadow, { valueFn: (r) => r.rankMovement }).map((r) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      rankMovement: r.rankMovement,
      liveRank: r.liveRank,
      shadowRank: r.shadowRank,
    })),
    topNegativeMovers: selectTopNegativeMovers(withShadow, { valueFn: (r) => r.rankMovement }).map((r) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      rankMovement: r.rankMovement,
      liveRank: r.liveRank,
      shadowRank: r.shadowRank,
    })),
    componentAvailabilityRates: {
      bullpen: round(safeRate(withShadow.filter((r) => r.componentAvailability?.bullpen === true).length, recordsWithShadow), 4),
      handSplit: round(safeRate(withShadow.filter((r) => r.componentAvailability?.handSplit === true).length, recordsWithShadow), 4),
    },
    componentDataQualityDistribution: {
      bullpen: buildDataQualityDistribution(withShadow.map((r) => r.componentDataQuality?.bullpen)),
      handSplit: buildDataQualityDistribution(withShadow.map((r) => r.componentDataQuality?.handSplit)),
    },
    componentContributionDistribution: {
      bullpen: buildContributionDistribution(withShadow.map((r) => r.componentContributions?.bullpen)),
      handSplit: buildContributionDistribution(withShadow.map((r) => r.componentContributions?.handSplit)),
    },
  };

  return { records, summary, skippedCount };
}

// ---------------------------------------------------------------------------
// Top-level artifact
// ---------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {object|null} [input.mlRaw]  Parsed ml-picks-raw.json (or null if missing/unavailable).
 * @param {object|null} [input.hrRaw]  Parsed hr-props-raw.json (or null if missing/unavailable).
 * @param {string} [input.generatedAt]  Injectable for deterministic tests; defaults to now.
 * @returns {object} the full comparison artifact.
 */
export function buildPhase2ShadowComparison({ mlRaw = null, hrRaw = null, generatedAt = new Date().toISOString() } = {}) {
  const warnings = [];
  if (!mlRaw) warnings.push("ml-picks-raw.json unavailable or unreadable; moneyline section is empty.");
  if (!hrRaw) warnings.push("hr-props-raw.json unavailable or unreadable; hr section is empty.");

  const moneylineResult = buildMoneylineComparison(mlRaw?.picks, { date: mlRaw?.date ?? null });
  const hrResult = buildHrComparison(hrRaw?.batters, { date: hrRaw?.date ?? null });

  if (moneylineResult.skippedCount > 0) {
    warnings.push(`${moneylineResult.skippedCount} moneyline record(s) skipped: missing gameId/gameKey.`);
  }
  if (hrResult.skippedCount > 0) {
    warnings.push(`${hrResult.skippedCount} hr record(s) skipped: missing playerId/gameId.`);
  }

  return {
    generatedAt,
    schemaVersion: SCHEMA_VERSION,
    moneyline: { records: moneylineResult.records, summary: moneylineResult.summary },
    hr: { records: hrResult.records, summary: hrResult.summary },
    summary: {
      generatedAt,
      moneylineSourceGeneratedAt: mlRaw?.generatedAt ?? null,
      hrSourceGeneratedAt: hrRaw?.generatedAt ?? null,
      warnings,
      experimentalNote:
        "Phase 2 shadow results (projected-IP, park, bullpen, hand-split, and their combined scores) are experimental and shadow-only. They do not affect, and are never read by, any live model, ranking, archive, grader, public UI, or social post.",
    },
    notes: [
      "liveTier (Moneyline) is derived via the existing getEdgeTierKeyCore(confidence) function, not emitted directly by the generator.",
      "Moneyline bullpen shadow data is sourced from projectedIpShadow.away/homeBullpenShadow (the bullpen shadow has no standalone top-level field in the ML composition layer).",
      "HR shadowRank only ranks batters with a finite combinedShadowScore; batters without shadow data receive shadowRank: null and are excluded from rank-movement statistics.",
    ],
  };
}
