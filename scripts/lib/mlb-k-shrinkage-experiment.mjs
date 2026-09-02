/**
 * mlb-k-shrinkage-experiment.mjs  (calibration experiment 1, PURE)
 *
 * Analysis-only reconstruction of the V2 Projected-K output under a single
 * controlled change: shrink the pitcher skill term toward the contemporaneous
 * league K rate before the matchup adjustment and clamp are applied.
 *
 *   pitcherSkillAdjusted = leagueKRate + alpha * (pitcherSkillRate - leagueKRate)
 *   projectedKRate       = clamp(pitcherSkillAdjusted + matchupAdjustment, MIN, MAX)
 *   projectedStrikeouts  = projectedKRate * projectedBattersFaced
 *
 * This mirrors src/lib/mlb/kProjectionV2.ts exactly for the two lines that the
 * change touches (matchupAdjustment does NOT depend on pitcherSkillRate, only a
 * null guard, so it is reused verbatim from the stored decomposition). At
 * alpha = 1.0 this reproduces the production V2 projection to within the
 * 4-decimal rounding of the persisted decomposition — the runner asserts that.
 *
 * NOTHING here is imported by production. No I/O, no clock.
 */

export const V2_MIN_K_RATE = 0.1;
export const V2_MAX_K_RATE = 0.4;
export const V2_DEFAULT_LEAGUE_K_RATE = 0.225;

/** Default shrinkage grid for experiment 1. 1.0 is the untouched baseline. */
export const DEFAULT_ALPHA_GRID = [1.0, 0.9, 0.8, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Recompute one row's V2 projected strikeouts with the pitcher skill term
 * shrunk toward league by `alpha`.
 *
 * @param {object} row  a dataset.jsonl row from build-mlb-k-backtest-dataset
 * @param {number} alpha shrinkage strength (1 = baseline, <1 = shrink spread)
 * @returns {{ projectedStrikeouts: number|null, projectedKRate: number|null,
 *   skillRate: number|null, skillAdjusted: number|null, leagueKRate: number,
 *   clampBound: "min"|"max"|null }}
 */
export function shrinkRow(row, alpha) {
  const skill = Number.isFinite(row?.v2?.pitcherSkillRate) ? row.v2.pitcherSkillRate : null;
  const bf = Number.isFinite(row?.v2?.projectedBattersFaced) ? row.v2.projectedBattersFaced : null;
  const matchup = Number.isFinite(row?.v2?.matchupAdjustment) ? row.v2.matchupAdjustment : 0;
  const leagueKRate = Number.isFinite(row?.inputs?.league?.kRate)
    ? row.inputs.league.kRate
    : V2_DEFAULT_LEAGUE_K_RATE;

  if (skill == null || bf == null) {
    return { projectedStrikeouts: null, projectedKRate: null, skillRate: skill, skillAdjusted: null, leagueKRate, clampBound: null };
  }

  const skillAdjusted = leagueKRate + alpha * (skill - leagueKRate);
  const rawKRate = skillAdjusted + matchup;
  const projectedKRate = clamp(rawKRate, V2_MIN_K_RATE, V2_MAX_K_RATE);
  const clampBound = rawKRate < V2_MIN_K_RATE ? "min" : rawKRate > V2_MAX_K_RATE ? "max" : null;

  return {
    projectedStrikeouts: projectedKRate * bf,
    projectedKRate,
    skillRate: skill,
    skillAdjusted,
    leagueKRate,
    clampBound,
  };
}
