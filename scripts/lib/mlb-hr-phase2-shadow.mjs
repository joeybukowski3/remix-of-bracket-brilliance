/**
 * mlb-hr-phase2-shadow.mjs
 *
 * Phase 2 HR shadow COMPOSITION LAYER. Combines the existing HR bullpen
 * shadow (mlb-hr-bullpen-shadow.mjs) and the hand-split shadow
 * (mlb-hr-hand-split-shadow.mjs) into one combined shadow HR score,
 * without ever touching the live HR Quality Score (computeBatterHrScore
 * in generate-mlb-hr-props.mjs). Mirrors the Moneyline composition layer
 * (mlb-ml-phase2-shadow.mjs) in spirit: each component is independent,
 * additive, and bounded; disabling a component -- by flag OR by that
 * component's own data being unavailable -- simply drops its
 * contribution to exactly 0. It never blocks the other component or the
 * live score.
 *
 * NEVER read by any live scoring path. NEVER displayed publicly. NOT YET
 * wired into generate-mlb-hr-props.mjs, the archive, or workflows -- the
 * caller is responsible for supplying opposingBullpen/opposingStarter/
 * batterHandSplits/opposingPitcherHand explicitly (a later, separately
 * approved wiring commit).
 */

import { computeHrBullpenShadow } from "./mlb-hr-bullpen-shadow.mjs";
import { computeHrHandSplitShadow } from "./mlb-hr-hand-split-shadow.mjs";
import { MLB_HR_MODEL_VERSION, MLB_HR_PHASE2_SHADOW_VERSION } from "./mlb-hr-model-version.mjs";

/** The repository's valid HR Quality Score range (see computeBatterHrScore / computeWeightedScore). */
const VALID_SCORE_MIN = 0;
const VALID_SCORE_MAX = 100;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round(value, decimals) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * @param {number} liveHrScore  The batter's already-computed live HR
 *   Quality Score (computeBatterHrScore's return value) -- passed
 *   through untouched, never recomputed here.
 * @param {object} [options]
 * @param {object|null} [options.opposingBullpen]  See mlb-hr-bullpen-shadow.mjs.
 * @param {object|null} [options.opposingStarter]  See mlb-hr-bullpen-shadow.mjs.
 * @param {object|null} [options.batterHandSplits]  See mlb-hr-hand-split-shadow.mjs.
 * @param {string|null} [options.opposingPitcherHand]  See mlb-hr-hand-split-shadow.mjs.
 * @param {{ ENABLE_HR_BULLPEN_SHADOW?: boolean, ENABLE_HR_HAND_SPLIT_SHADOW?: boolean }} [options.flags]
 *   Typically the result of getPhase2Flags() from mlb-phase2-flags.mjs.
 *   Both default to false if omitted -- this function itself has no
 *   opinion on defaults; it does exactly what the flags it's given say.
 * @returns {object}
 */
export function computeHrPhase2Shadow(liveHrScore, options = {}) {
  const {
    opposingBullpen = null,
    opposingStarter = null,
    batterHandSplits = null,
    opposingPitcherHand = null,
    flags = {},
  } = options;

  const bullpenEnabled = flags.ENABLE_HR_BULLPEN_SHADOW === true;
  const handSplitEnabled = flags.ENABLE_HR_HAND_SPLIT_SHADOW === true;

  const bullpenShadow = bullpenEnabled ? computeHrBullpenShadow({ opposingBullpen, opposingStarter }) : null;
  const handSplitShadow = handSplitEnabled
    ? computeHrHandSplitShadow({ batterHandSplits, opposingPitcherHand })
    : null;

  const bullpenContribution = bullpenShadow?.bullpenHrShadowContribution ?? 0;
  const handSplitContribution = handSplitShadow?.handSplitShadowContribution ?? 0;

  // When both components are disabled (flags off) or both unavailable
  // (data missing/stale/invalid), bullpenContribution and
  // handSplitContribution are both exactly 0, so this reduces to
  // round(clamp(liveHrScore, 0, 100), 1) -- byte-identical to the
  // pre-Phase-2 live score (already in [0,100] and already rounded to 1
  // decimal by the generator).
  const combinedShadowScore = round(clamp(liveHrScore + bullpenContribution + handSplitContribution, VALID_SCORE_MIN, VALID_SCORE_MAX), 1);

  return {
    liveModelVersion: MLB_HR_MODEL_VERSION,
    shadowExperimentVersion: MLB_HR_PHASE2_SHADOW_VERSION,

    enabledComponents: {
      bullpen: bullpenEnabled,
      handSplit: handSplitEnabled,
    },

    // -- live score, untouched --
    live: {
      hrScore: liveHrScore,
    },

    // -- per-component shadow results (null when that component was disabled) --
    bullpenShadow,
    handSplitShadow,

    componentAvailability: {
      bullpen: bullpenShadow?.available ?? null,
      handSplit: handSplitShadow?.available ?? null,
    },
    componentDataQuality: {
      bullpen: bullpenShadow?.dataQuality ?? null,
      handSplit: handSplitShadow?.dataQuality ?? null,
    },
    componentContributions: {
      bullpen: bullpenContribution,
      handSplit: handSplitContribution,
    },

    combinedShadowScore,
  };
}
