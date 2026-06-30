/**
 * mlb-hr-candidate-score.mjs
 *
 * Candidate/shadow HR scoring formula for parallel, non-public research.
 * This NEVER replaces or feeds into the live HR Quality Score
 * (computeBatterHrScore in generate-mlb-hr-props.mjs) and is NEVER
 * displayed publicly. It is archived daily alongside the live score so
 * the two can be compared once enough graded outcomes exist.
 *
 * Structure (per audit recommendation, current-data only):
 *   Hitter Power Profile:  35%  (barrel%, hard-hit%, ISO, xBA)
 *   Recent Form:           20%  (L7 HR, L30 HR)
 *   Pitcher Vulnerability:  30%  (pitcher HR-vs rating, xERA, regression, pitcher FB%)
 *   Environment:            15%  (park factor, weather boost)
 *
 * Explicitly excludes: sportsbook odds, market value, event-level metrics
 * (pulled-air%, no-doubter contact) that are not yet integrated.
 */

import { MLB_HR_CANDIDATE_MODEL_VERSION } from "./mlb-hr-model-version.mjs";

export const CANDIDATE_WEIGHTS = {
  barrelRate: 0.14,
  hardHitRate: 0.10,
  iso: 0.06,
  xba: 0.05,
  last7HR: 0.10,
  last30HR: 0.10,
  pitcherHrVs: 0.16,
  pitcherXera: 0.08,
  pitcherRegression: 0.04,
  pitcherFlyBallRate: 0.02,
  parkFactor: 0.10,
  weatherBoost: 0.05,
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeRange(value, lo, hi, invert = false) {
  if (value == null || !Number.isFinite(value)) return null;
  const pct = clamp(((value - lo) / (hi - lo)) * 100, 0, 100);
  return invert ? 100 - pct : pct;
}

/**
 * @param {object} player  Validated batter row with barrelRate, hardHitRate, iso, xba,
 *                          last7HR, last30HR, opposingPitcherHrVs, pitcherXera,
 *                          pitcherRegressionScore, pitcherFlyBallRate, parkFactor, weatherBoost
 * @returns {{ candidateHrQualityScore: number|null, candidateModelVersion: string, componentScores: object }}
 */
export function computeCandidateHrScore(player) {
  const componentNorm = {
    barrelRate: normalizeRange(player.barrelRate, 3, 20),
    hardHitRate: normalizeRange(player.hardHitRate, 25, 60),
    iso: normalizeRange(player.iso, 0.10, 0.32),
    xba: normalizeRange(player.xba, 0.18, 0.34),
    last7HR: normalizeRange(player.last7HR, 0, 4),
    last30HR: normalizeRange(player.last30HR, 0, 10),
    pitcherHrVs: clamp(player.opposingPitcherHrVs ?? 50, 0, 100),
    pitcherXera: normalizeRange(player.pitcherXera, 2.5, 6.0), // higher xERA = more hittable = higher score
    pitcherRegression: normalizeRange(player.pitcherRegressionScore, -2, 2),
    pitcherFlyBallRate: normalizeRange(player.pitcherFlyBallRate, 30, 50),
    parkFactor: normalizeRange(player.parkFactor, 0.85, 1.40),
    weatherBoost: normalizeRange(player.weatherBoost, -6, 6),
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(CANDIDATE_WEIGHTS)) {
    const val = componentNorm[key];
    if (val != null && Number.isFinite(val)) {
      weightedSum += weight * val;
      totalWeight += weight;
    }
  }

  if (totalWeight < 0.5) {
    return { candidateHrQualityScore: null, candidateModelVersion: MLB_HR_CANDIDATE_MODEL_VERSION, componentScores: componentNorm };
  }

  const candidateHrQualityScore = Math.round((weightedSum / totalWeight) * 10) / 10;
  return { candidateHrQualityScore, candidateModelVersion: MLB_HR_CANDIDATE_MODEL_VERSION, componentScores: componentNorm };
}

/** Rank an array of rows with candidateHrQualityScore descending. Returns index->rank Map. */
export function rankCandidateScores(rows) {
  const ranked = rows
    .map((r, i) => ({ i, score: r.candidateHrQualityScore ?? -1 }))
    .sort((a, b) => b.score - a.score);
  const rankMap = new Map();
  ranked.forEach((r, idx) => rankMap.set(r.i, idx + 1));
  return rankMap;
}
