import { blendPriorAndCurrent } from "../phase3/decay";
import type { CfbScoringEnvironmentMode } from "./types";

export type ScoringEnvironmentInputs = {
  /** Mean points/team/game across ALL seasons strictly before the current one. */
  allPriorSeasonsMean: number | null;
  /** Mean points/team/game for the immediately preceding season only. */
  previousSeasonMean: number | null;
  /** Mean points/team/game so far THIS season (strictly before the prediction week). */
  currentSeasonSoFarMean: number | null;
  currentSeasonGamesSoFar: number;
};

/**
 * Section 4: leakage-safe scoring-environment estimate at one walk-forward
 * cutoff. STATIC_HISTORICAL pools every prior season equally; PREVIOUS_SEASON
 * carries forward only last season's mean; BLENDED_CURRENT precision-
 * weights last season's mean against this season's own results so far —
 * reuses Phase 3's exact blending mechanism (decay.ts), same K-as-
 * equivalent-games semantics, applied here to scoring level instead of team
 * rating.
 */
export function estimateScoringEnvironment(
  inputs: ScoringEnvironmentInputs,
  mode: CfbScoringEnvironmentMode,
  priorGamesWeight: number,
): number | null {
  if (mode === "STATIC_HISTORICAL") return inputs.allPriorSeasonsMean;
  if (mode === "PREVIOUS_SEASON") return inputs.previousSeasonMean;
  return blendPriorAndCurrent(
    inputs.previousSeasonMean,
    inputs.currentSeasonSoFarMean,
    inputs.currentSeasonGamesSoFar,
    { method: "PRECISION_WEIGHTED", priorGamesWeight },
  );
}
