/**
 * mlb-hr-hand-split-shadow.mjs
 *
 * Phase 2 -- Batter platoon (vs-pitcher-hand) shadow signal for HR props
 * (SHADOW ONLY).
 *
 * Computes a bounded, shadow-only signal describing how much better or
 * worse a batter performs against the OPPOSING STARTER's throwing hand,
 * using the shrunk (empirical-Bayes-blended) metrics already computed by
 * the batter hand-split cache (see mlb-batter-hand-splits.mjs /
 * mlb-hand-split-shrinkage.mjs). This module does NOT re-derive
 * shrinkage -- it only consumes the cache's shrunk output for the side
 * matching the opposing pitcher's hand.
 *
 * This NEVER feeds computeCandidateHrScore() (mlb-hr-candidate-score.mjs)
 * or the live HR Quality Score (computeBatterHrScore in
 * generate-mlb-hr-props.mjs) -- it is an entirely separate, additively-
 * exposed field, gated behind ENABLE_HR_HAND_SPLIT_SHADOW and NOT wired
 * into any generator, archive, workflow, or public UI in this commit.
 *
 * Design (approved 2026-07-03):
 *   - Primary signal: shrunk OPS, converted to a bounded [15, 88] score
 *     around a documented approximate scoring-curve pivot (same
 *     bounded-curve convention as bullpenEraScore/bullpenHr9Score/etc. in
 *     mlb-ml-bullpen-shadow.mjs -- a fixed numeric anchor used ONLY to
 *     shape the score curve, NOT a substitute for missing raw data; no
 *     league-average data fallback is used anywhere in this pipeline,
 *     per the Phase 2 hand-split-cache approval).
 *   - Secondary signal: shrunk HR rate (HR per PA), scored the same way,
 *     weighted well below OPS so it only nudges the primary signal.
 *     SLG is never added as a separate factor -- OPS already embeds it,
 *     so adding SLG too would double-count the same underlying power/
 *     on-base information.
 *   - The final contribution is the blended score's deviation from
 *     neutral (50), bounded to +/-MAX_HAND_SPLIT_CONTRIBUTION points.
 *   - Missing hand-split data, a stale cache entry, an unknown/
 *     unconfirmed opposing pitcher hand, a split the cache itself marked
 *     unavailable (no trustworthy fallback existed at cache-build time),
 *     or malformed/unusable shrunk metrics all produce a NEUTRAL/NO-OP
 *     result: contribution is exactly 0 and `available` is false.
 *     Callers must never treat a missing-data result as "average platoon
 *     performance" implicitly -- the explicit `available`/`reason`
 *     fields make the distinction visible.
 */

import { MLB_HR_MODEL_VERSION, MLB_HR_HAND_SPLIT_SHADOW_VERSION } from "./mlb-hr-model-version.mjs";

/** Hard bound on how many points this component can move a downstream score by, in either direction. */
export const MAX_HAND_SPLIT_CONTRIBUTION = 8;

/**
 * Documented approximate scoring-curve anchors -- NOT a data fallback.
 * Used only to convert a real, present shrunk metric into a [15,88]
 * score, the same way LEAGUE_AVG_BULLPEN_HR9 etc. are used elsewhere in
 * this repo purely as curve pivots.
 */
const OPS_SCORE_PIVOT = 0.75;
const HR_RATE_SCORE_PIVOT = 0.03;

/** Relative weight of the primary (OPS) vs. secondary (HR rate) signal in the blended score. */
const OPS_WEIGHT = 0.75;
const HR_RATE_WEIGHT = 0.25;

const UNAVAILABLE_DATA_QUALITY = "unavailable";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round(value, decimals) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Same [15, 88] bounded curve-shape convention as bullpenEraScore/etc. in
// mlb-ml-bullpen-shadow.mjs: 50 at the pivot, scaled linearly on either
// side by a fixed divisor, clamped to [15, 88].
function scoreAroundPivot(value, pivot, aboveDivisor, belowDivisor) {
  if (value == null || !Number.isFinite(value)) return null;
  return value >= pivot
    ? clamp(50 + ((value - pivot) / aboveDivisor) * 38, 15, 88)
    : clamp(50 - ((pivot - value) / belowDivisor) * 35, 15, 88);
}

function opsScore(ops) {
  return scoreAroundPivot(ops, OPS_SCORE_PIVOT, 0.3, 0.25);
}

function hrRateScore(hrRate) {
  return scoreAroundPivot(hrRate, HR_RATE_SCORE_PIVOT, 0.03, 0.02);
}

function normalizeSelectedSide(pitcherHand) {
  const code = String(pitcherHand ?? "").trim().toUpperCase();
  if (code === "L") return "vsLeft";
  if (code === "R") return "vsRight";
  return null;
}

/**
 * @param {object|null|undefined} batterHandSplits  A batter hand-split
 *   cache entry (see mlb-batter-hand-splits.mjs schema).
 * @param {string|null|undefined} opposingPitcherHand  The opposing
 *   starter's pitchHand.code ("L"/"R"). Missing/unrecognized -> unavailable.
 * @returns {{ available: boolean, reason: string, selectedSide: string|null }}
 */
export function classifyHandSplitAvailability(batterHandSplits, opposingPitcherHand) {
  if (!batterHandSplits) return { available: false, reason: "missing", selectedSide: null };
  if (batterHandSplits.freshnessStatus === "missing") return { available: false, reason: "missing", selectedSide: null };
  // Stale-fallback data is explicitly excluded, matching the bullpen
  // shadow's "missing, stale, or low-quality data must fall back" rule.
  if (batterHandSplits.freshnessStatus === "stale-fallback") return { available: false, reason: "stale", selectedSide: null };

  const selectedSide = normalizeSelectedSide(opposingPitcherHand);
  if (!selectedSide) return { available: false, reason: "unknown_pitcher_hand", selectedSide: null };

  const split = batterHandSplits.splits?.[selectedSide];
  if (!split || split.dataQuality === UNAVAILABLE_DATA_QUALITY || !split.shrunk) {
    return { available: false, reason: "split_unavailable", selectedSide };
  }

  return { available: true, reason: "ok", selectedSide };
}

/**
 * @param {object} [input]
 * @param {object|null} [input.batterHandSplits]  The batter's hand-split cache entry.
 * @param {string|null} [input.opposingPitcherHand]  Opposing starter's pitchHand.code.
 * @returns {object} bounded shadow result. `available: false` results
 *   always carry `handSplitShadowContribution: 0` (neutral/no-op).
 */
export function computeHrHandSplitShadow({ batterHandSplits = null, opposingPitcherHand = null } = {}) {
  const availability = classifyHandSplitAvailability(batterHandSplits, opposingPitcherHand);
  const split = availability.selectedSide ? batterHandSplits?.splits?.[availability.selectedSide] : null;

  const base = {
    liveModelVersion: MLB_HR_MODEL_VERSION,
    shadowExperimentVersion: MLB_HR_HAND_SPLIT_SHADOW_VERSION,
    shadowComponent: "hand-split",
    selectedSide: availability.selectedSide,
  };

  const unavailableResult = (reason) => ({
    ...base,
    available: false,
    reason,
    dataQuality: split?.dataQuality ?? null,
    sampleSizeTier: split?.sampleSizeTier ?? null,
    shrinkageWeight: split?.shrinkageWeight ?? null,
    fallbackUsed: split?.fallbackUsed ?? null,
    fallbackSource: split?.fallbackSource ?? null,
    raw: split?.raw ?? null,
    shrunk: split?.shrunk ?? null,
    opsScore: null,
    hrRateScore: null,
    handSplitShadowContribution: 0,
  });

  if (!availability.available) return unavailableResult(availability.reason);

  const opsComponent = opsScore(split.shrunk.ops);
  const hrRateComponent = hrRateScore(split.shrunk.hrRate);

  const validComponents = [
    opsComponent != null ? { value: opsComponent, weight: OPS_WEIGHT } : null,
    hrRateComponent != null ? { value: hrRateComponent, weight: HR_RATE_WEIGHT } : null,
  ].filter(Boolean);

  // Malformed/unusable shrunk metrics (e.g. both null) -- the split was
  // structurally "available" per the cache, but there is nothing numeric
  // to score. Neutral/no-op, same as any other unavailable reason.
  if (!validComponents.length) return unavailableResult("malformed_metrics");

  const totalWeight = validComponents.reduce((sum, c) => sum + c.weight, 0);
  const blendedScore = validComponents.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight;

  const deviation = blendedScore - 50;
  const rawContribution = (deviation / 38) * MAX_HAND_SPLIT_CONTRIBUTION;
  const contribution = clamp(rawContribution, -MAX_HAND_SPLIT_CONTRIBUTION, MAX_HAND_SPLIT_CONTRIBUTION);

  return {
    ...base,
    available: true,
    reason: "ok",
    dataQuality: split.dataQuality,
    sampleSizeTier: split.sampleSizeTier,
    shrinkageWeight: split.shrinkageWeight,
    fallbackUsed: split.fallbackUsed,
    fallbackSource: split.fallbackSource,
    raw: split.raw,
    shrunk: split.shrunk,
    opsScore: opsComponent,
    hrRateScore: hrRateComponent,
    handSplitShadowContribution: round(contribution, 2),
  };
}
