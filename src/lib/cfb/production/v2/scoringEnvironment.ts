// CFB Model V2 — production-safe BLENDED_CURRENT scoring-environment
// reconstruction (WU3 §7). A literal, faithful port of
// research/phase3/decay.ts's `blendPriorAndCurrent` (PRECISION_WEIGHTED
// branch) + research/phase4/scoringEnvironment.ts's `estimateScoringEnvironment`
// (BLENDED_CURRENT branch only — production's frozen CFB_V2_SCORING_CONFIG
// never uses STATIC_HISTORICAL/PREVIOUS_SEASON). This is generic leakage-safe
// blending math with zero research-specific logic, duplicated here rather
// than imported at runtime (same pattern as linearSolver.ts) — parity is
// enforced by scoringEnvironment.test.ts's test-only research import.

export type CfbV2ScoringEnvironmentInputs = {
  /** Mean points/team/game across ALL seasons strictly before the current one. Used only as the fallback when previousSeasonMean is unavailable. */
  allPriorSeasonsMean: number | null;
  /** Mean points/team/game for the immediately preceding season only — the PRECISION_WEIGHTED prior. */
  previousSeasonMean: number | null;
  /** Mean points/team/game so far THIS season, strictly before the prediction cutoff. */
  currentSeasonSoFarMean: number | null;
  currentSeasonGamesSoFar: number;
};

/**
 * PRECISION_WEIGHTED posterior: (K*prior + n*current) / (K+n). Never
 * fabricates a current-season value from nothing — with 0 games played,
 * this always reduces to the prior.
 */
function blendPriorAndCurrentPrecisionWeighted(
  priorValue: number | null,
  currentValue: number | null,
  currentGamesPlayed: number,
  priorGamesWeight: number,
): number | null {
  if (currentValue === null || currentGamesPlayed <= 0) return priorValue;
  if (priorValue === null) return currentValue;
  const k = priorGamesWeight;
  return (k * priorValue + currentGamesPlayed * currentValue) / (k + currentGamesPlayed);
}

/**
 * BLENDED_CURRENT scoring-environment estimate (§7): the prior is
 * `previousSeasonMean` (falling back to `allPriorSeasonsMean` only via the
 * caller-supplied inputs — matches research's own precedence, which never
 * itself falls back to allPriorSeasonsMean inside BLENDED_CURRENT; that
 * value is only used by the STATIC_HISTORICAL mode this production config
 * never selects). At zero current-season games, this returns
 * previousSeasonMean unchanged. Null in, null out — never fabricated.
 */
export function estimateCfbV2ScoringEnvironment(inputs: CfbV2ScoringEnvironmentInputs, priorGamesWeight: number): number | null {
  return blendPriorAndCurrentPrecisionWeighted(inputs.previousSeasonMean, inputs.currentSeasonSoFarMean, inputs.currentSeasonGamesSoFar, priorGamesWeight);
}
