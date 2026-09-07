/**
 * mlb-k-projection-v3 -- strikeout projection composition.
 *
 * NEW module. src/lib/mlb/kProjectionV2.ts and every v2 script are untouched;
 * v2 and v3 are reproducible side by side and v2 remains production until a
 * promotion is explicitly authorised.
 *
 * WHAT v3 CHANGES, AND WHAT IT DOES NOT
 * -------------------------------------
 * Changed:
 *   1. Workload. Projected innings and batters faced come from the v3 workload
 *      model (neutral baseline + regime + site + opponent-SP effect) instead of
 *      the v2 pitch-count blend.
 *   2. Pitcher-skill shrinkage. alpha is the sample-size rule
 *      seasonBF / (seasonBF + 125) instead of the fixed 0.55, which the prior
 *      shrinkage research showed over-compresses established elite pitchers.
 *
 * Unchanged, and deliberately so: every K-rate component. Season K skill,
 * recent K skill regression, whiff-supported K rate, opponent season and recent
 * K rate, projected lineup K rate, handedness splits, the opponent matchup
 * multiplier and the matchup clamp all remain exactly what v2 computes. v3
 * consumes v2's own pitcherSkillRate and matchupAdjustment rather than
 * recomputing them, so a K-rate change cannot slip in unnoticed.
 *
 * The identity this relies on is exact. v2 computes
 *   projectedKRate = clamp(league + 0.55 * (skill - league) + matchup, 0.1, 0.4)
 * where `matchup` depends only on the opponent environment and the league
 * anchor, and `skill` is computed before any shrinkage. Substituting a
 * different alpha therefore reproduces the pipeline exactly; the prior
 * shrinkage study verified this replay to a maximum absolute error of 0.
 *
 * NO MARKET INPUT. The Vegas line never enters this module. It is an
 * evaluation and bucketing variable only.
 */

export const K_PROJECTION_V3_MODEL_VERSION = "mlb-k-projection-v3";

/** Mirrored read-only from src/lib/mlb/kProjectionV2.ts. */
export const MIN_K_RATE = 0.1;
export const MAX_K_RATE = 0.4;
export const PRODUCTION_ALPHA = 0.55;

/**
 * Prior strength of the sample-size shrinkage rule, in batters faced. Selected
 * by the prior shrinkage study (mlb-k-high-line-calibration-v2) over a grid,
 * on leakage-safe forward performance.
 */
export const SAMPLE_SIZE_ALPHA_K = 125;

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const clamp01 = (value) => clamp(value, 0, 1);

/**
 * alpha = BF / (BF + k), the beta-binomial shrinkage weight for a rate observed
 * over BF trials against a prior worth k trials.
 *
 * Fail-closed: when season BF is absent, negative or non-finite the row falls
 * back to the production alpha, so a missing input can never make a projection
 * more aggressive than production is today. A genuine BF of 0 is available
 * information, not a missing input, and correctly yields alpha 0.
 */
export function sampleSizeAlpha(seasonBattersFaced, k = SAMPLE_SIZE_ALPHA_K, { fallbackAlpha = PRODUCTION_ALPHA } = {}) {
  const kk = finite(k);
  if (kk === null || kk <= 0) return { alpha: clamp01(fallbackAlpha), source: "fallback:invalid-k" };
  const bf = finite(seasonBattersFaced);
  if (bf === null || bf < 0) return { alpha: clamp01(fallbackAlpha), source: "fallback:missing-season-bf" };
  return { alpha: clamp01(bf / (bf + kk)), source: "sample-size" };
}

/**
 * Applies the v3 shrinkage and workload to v2's own K-rate components.
 *
 * @param {object} input
 * @param {number} input.pitcherSkillRate    v2 raw blended pitcher K skill, pre-shrinkage
 * @param {number} input.leagueKRate         contemporaneous league K rate anchor
 * @param {number|null} input.matchupAdjustment v2 opponent matchup adjustment
 * @param {number|null} input.seasonBattersFaced pregame season BF, for alpha
 * @param {number} input.projectedBattersFaced   v3 projected BF
 * @param {number} input.projectedInnings        v3 projected IP
 * @param {number} [input.alphaK]                shrinkage prior strength
 */
export function projectStrikeoutsV3(input = {}) {
  const skill = finite(input.pitcherSkillRate);
  const league = finite(input.leagueKRate);
  const matchup = finite(input.matchupAdjustment) ?? 0;
  const bf = finite(input.projectedBattersFaced);
  const ip = finite(input.projectedInnings);

  const { alpha, source } = sampleSizeAlpha(input.seasonBattersFaced, input.alphaK ?? SAMPLE_SIZE_ALPHA_K);

  if (skill === null || league === null) {
    return {
      modelVersion: K_PROJECTION_V3_MODEL_VERSION,
      projectedStrikeouts: null,
      projectedKRate: null,
      projectedBattersFaced: bf,
      projectedInnings: ip,
      pitcherSkillRate: skill,
      pitcherSkillRateShrunk: null,
      shrinkageAlpha: alpha,
      shrinkageAlphaSource: source,
      matchupAdjustment: matchup,
      warnings: ["Pitcher skill rate or league anchor unavailable; v3 cannot project."],
    };
  }

  const shrunk = league + alpha * (skill - league);
  const kRate = clamp(shrunk + matchup, MIN_K_RATE, MAX_K_RATE);

  return {
    modelVersion: K_PROJECTION_V3_MODEL_VERSION,
    projectedStrikeouts: bf === null ? null : kRate * bf,
    projectedKRate: kRate,
    projectedBattersFaced: bf,
    projectedInnings: ip,
    pitcherSkillRate: skill,
    pitcherSkillRateShrunk: shrunk,
    shrinkageAlpha: alpha,
    shrinkageAlphaSource: source,
    matchupAdjustment: matchup,
    warnings: bf === null ? ["Projected batters faced unavailable; strikeouts not projected."] : [],
  };
}

export default projectStrikeoutsV3;
