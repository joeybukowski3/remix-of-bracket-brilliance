import { runPhase4WalkForward } from "../phase4/phase4WalkForward";
import type { ScorePrediction, ScoringModelConfig } from "../phase4/types";
import { PHASE5_TEST_SEASONS, SIMULATION_DRAWS, SIMULATION_SEED } from "./config";
import { runPhase5WalkForwardCore, type Phase5Config, type Phase5Result } from "./phase5WalkForwardCore";

/** Phase 4's recommended finalist config (Model C: strength + SUCCESS, national HFA, no pace). */
export const PHASE4_FINALIST_CONFIG: ScoringModelConfig = {
  hfa: "NATIONAL",
  scoringEnvironment: "BLENDED_CURRENT",
  pace: "NONE",
  secondary: ["SUCCESS"],
  lambda: 2,
  priorGamesWeight: 8,
};

/**
 * Phase 4's walk-forward is independent of any Phase 5 config — compute it
 * ONCE per script run and reuse across every Phase 5 calibration/
 * distribution variant tested, rather than recomputing team ratings from
 * scratch for each one (Phase 4 alone takes ~10s; Phase 5 tests dozens of
 * configs on top of it).
 */
export function computePhase4Predictions(): ScorePrediction[] {
  return runPhase4WalkForward({
    scoringConfig: PHASE4_FINALIST_CONFIG,
    testSeasons: [...PHASE5_TEST_SEASONS],
    ratingLambda: 20,
  });
}

export function runPhase5WalkForward(
  phase4Predictions: readonly ScorePrediction[],
  phase5Config: Partial<Phase5Config> = {},
): Phase5Result {
  const config: Phase5Config = {
    totalCalibrationMethod: "LINEAR",
    scoreCalibrationMode: "TOTAL_ONLY",
    distributionFamily: "INDEPENDENT_NORMAL",
    heteroskedastic: false,
    simulationSeed: SIMULATION_SEED,
    simulationDraws: SIMULATION_DRAWS,
    ...phase5Config,
  };

  return runPhase5WalkForwardCore(phase4Predictions, config);
}
