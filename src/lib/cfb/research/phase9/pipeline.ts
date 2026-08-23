import { runPhase8WalkForward } from "../phase8/phase8WalkForward";
import type { Phase8CandidateSpec, Phase8Prediction } from "../phase8/types";
import { runPhase5WalkForwardCore, type Phase5Config } from "../phase5/phase5WalkForwardCore";
import type { CalibratedPrediction, ProbabilityOutputs } from "../phase5/types";
import type { ScorePrediction } from "../phase4/types";
import { SIMULATION_DRAWS, SIMULATION_SEED } from "../phase5/config";

/**
 * Section 2 — Phase 5's finalist config (TOTAL_ONLY calibration, pooled
 * LINEAR method, empirical residual bootstrap, homoskedastic), reused
 * verbatim (Section 9 fixes the downstream architecture; only the RATING
 * input changes between baseline/finalist).
 */
export const PHASE9_CALIBRATION_CONFIG: Phase5Config = {
  totalCalibrationMethod: "LINEAR",
  scoreCalibrationMode: "TOTAL_ONLY",
  distributionFamily: "EMPIRICAL_BOOTSTRAP",
  heteroskedastic: false,
  simulationSeed: SIMULATION_SEED,
  simulationDraws: SIMULATION_DRAWS,
};

export type Phase9PipelineResult = {
  ratingPredictions: Phase8Prediction[];
  calibrated: CalibratedPrediction[];
  probabilities: ProbabilityOutputs[];
};

function toScorePrediction(p: Phase8Prediction): ScorePrediction {
  return {
    gameId: p.gameId,
    season: p.season,
    week: p.week,
    homeTeamExternalId: p.homeTeamExternalId,
    awayTeamExternalId: p.awayTeamExternalId,
    expectedHomePoints: p.expectedHomePoints,
    expectedAwayPoints: p.expectedAwayPoints,
    projectedMargin: p.projectedMargin,
    projectedTotal: p.projectedTotal,
    actualHomePoints: p.actualHomePoints,
    actualAwayPoints: p.actualAwayPoints,
    actualMargin: p.actualMargin,
    actualTotal: p.actualTotal,
    // Phase 8's walk-forward already restricts to FBS-vs-FBS (isFbsVsFbsGame) — see phase8WalkForwardCore.ts.
    matchupPopulation: "fbs_vs_fbs",
  };
}

/**
 * Section 2/9 — the thin Phase 9 orchestration layer: Phase 8 ratings
 * (rating step swapped per candidateSpec) feed DIRECTLY into Phase 5's
 * existing, unmodified calibration/probability core. No Phase 4-6 logic is
 * duplicated here — this function is the entire composition.
 */
export function runPhase9Pipeline(candidateSpec: Phase8CandidateSpec, testSeasons: readonly number[]): Phase9PipelineResult {
  const ratingPredictions = runPhase8WalkForward({ testSeasons: [...testSeasons], candidateSpec });
  const { calibrated, probabilities } = runPhase5WalkForwardCore(ratingPredictions.map(toScorePrediction), PHASE9_CALIBRATION_CONFIG);
  return { ratingPredictions, calibrated, probabilities };
}
