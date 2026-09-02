/**
 * mlb-k-opponent-experiment.mjs  (calibration experiment 2, PURE)
 *
 * Analysis-only reconstruction of the Projected-K V2.1 output under a controlled
 * change to the opponent-environment matchup term ONLY:
 *
 *   matchupAdjustment = clamp((opponentEnvironmentRate - leagueKRate) * mult,
 *                             -clampAbs, +clampAbs)
 *   projectedKRate    = clamp(pitcherSkillRateShrunk + matchupAdjustment, 0.10, 0.40)
 *   projectedStrikeouts = projectedKRate * projectedBattersFaced
 *
 * V2.1 production values: mult = 0.45, clampAbs = 0.035. The pitcher-skill term
 * (already league-shrunk at alpha 0.55) is reused verbatim from the persisted
 * V2.1 decomposition — this experiment does not touch it. Rows where V2.1
 * produced no opponent environment (matchupAdjustment null) are invariant across
 * the grid and carried through with adj = 0, exactly as V2.1 does.
 *
 * NOTHING here is imported by production. No I/O, no clock.
 */

export const V2_MIN_K_RATE = 0.1;
export const V2_MAX_K_RATE = 0.4;
export const V2_DEFAULT_LEAGUE_K_RATE = 0.225;

/** V2.1 production matchup parameters. */
export const BASELINE_MULTIPLIER = 0.45;
export const BASELINE_CLAMP_ABS = 0.035;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Recompute one row's V2.1 projected strikeouts with the opponent matchup term
 * rebuilt from (multiplier, clampAbs). Pitcher skill (shrunk) is untouched.
 *
 * @param {object} row a dataset.jsonl row (built from V2.1 production code)
 * @param {number} multiplier opponent-environment multiplier (V2.1 = 0.45)
 * @param {number} clampAbs symmetric matchup clamp bound (V2.1 = 0.035)
 * @returns {{ projectedStrikeouts:number|null, projectedKRate:number|null,
 *   matchupAdjustment:number|null, matchupRaw:number|null, clampHit:boolean,
 *   opponentEnvironmentRate:number|null }}
 */
export function reprojectRow(row, multiplier, clampAbs) {
  const shrunk = Number.isFinite(row?.v2?.pitcherSkillRateShrunk) ? row.v2.pitcherSkillRateShrunk : null;
  const bf = Number.isFinite(row?.v2?.projectedBattersFaced) ? row.v2.projectedBattersFaced : null;
  const oppEnv = Number.isFinite(row?.v2?.opponentEnvironmentRate) ? row.v2.opponentEnvironmentRate : null;
  const leagueKRate = Number.isFinite(row?.inputs?.league?.kRate)
    ? row.inputs.league.kRate
    : V2_DEFAULT_LEAGUE_K_RATE;

  if (shrunk == null || bf == null) {
    return {
      projectedStrikeouts: null,
      projectedKRate: null,
      matchupAdjustment: null,
      matchupRaw: null,
      clampHit: false,
      opponentEnvironmentRate: oppEnv,
    };
  }

  // V2.1: matchupAdjustment is null (→ treated as 0) when there is no opponent env.
  const matchupRaw = oppEnv == null ? null : (oppEnv - leagueKRate) * multiplier;
  const matchupAdjustment = matchupRaw == null ? null : clamp(matchupRaw, -clampAbs, clampAbs);
  const clampHit = matchupRaw != null && Math.abs(matchupRaw) > clampAbs + 1e-12;

  const projectedKRate = clamp(shrunk + (matchupAdjustment ?? 0), V2_MIN_K_RATE, V2_MAX_K_RATE);

  return {
    projectedStrikeouts: projectedKRate * bf,
    projectedKRate,
    matchupAdjustment,
    matchupRaw,
    clampHit,
    opponentEnvironmentRate: oppEnv,
  };
}

/**
 * Compact, non-overfitting grid:
 *  - multiplier sweep at the current clamp (isolates the multiplier)
 *  - clamp sweep at the current multiplier (isolates the clamp)
 *  - a short joint diagonal to expose interaction
 * Baseline (0.45 / 0.035) is included exactly once and always first.
 */
export function defaultGrid() {
  const seen = new Set();
  const grid = [];
  const add = (multiplier, clampAbs, arm) => {
    const key = `${multiplier}|${clampAbs}`;
    if (seen.has(key)) return;
    seen.add(key);
    grid.push({ multiplier, clampAbs, arm });
  };
  add(BASELINE_MULTIPLIER, BASELINE_CLAMP_ABS, "baseline");
  for (const m of [0.55, 0.65, 0.75, 0.85, 1.0]) add(m, BASELINE_CLAMP_ABS, "multiplier");
  for (const c of [0.045, 0.055, 0.065, 0.075]) add(BASELINE_MULTIPLIER, c, "clamp");
  for (const [m, c] of [[0.65, 0.055], [0.75, 0.065], [0.85, 0.075]]) add(m, c, "joint");
  return grid;
}
