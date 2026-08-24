import {
  BASE_LAMBDA_GRID,
  STALENESS_FLOOR_GRID,
  STALENESS_THRESHOLD_HIGH_GRID,
  STALENESS_THRESHOLD_LOW_GRID,
} from "./config";
import type { LambdaCandidateId, Phase8CandidateSpec, StalenessFormId } from "./types";

export const BASELINE_SPEC: Phase8CandidateSpec = {
  id: "BASELINE_RIDGE_PRIOR",
  label: "Baseline Ridge+prior (frozen Phase 3/4 architecture, lambda=20)",
  baseLambda: 20,
  connectivity: "GLOBAL_BASELINE",
  staleness: "NONE",
};

/** Section 11 — base-lambda sweep for GLOBAL_BASELINE (picks the best constant-lambda operating point before testing connectivity multipliers on top of it). */
export function buildBaseLambdaSweepSpecs(): Phase8CandidateSpec[] {
  return BASE_LAMBDA_GRID.map((lambda) => ({
    id: `GLOBAL_BASELINE_L${lambda}`,
    label: `Global baseline, lambda=${lambda}`,
    baseLambda: lambda,
    connectivity: "GLOBAL_BASELINE" as LambdaCandidateId,
    staleness: "NONE" as StalenessFormId,
  }));
}

/** Section 5/11 — connectivity candidates B-E at each base-lambda grid point. */
export function buildConnectivitySweepSpecs(): Phase8CandidateSpec[] {
  const connectivityIds: LambdaCandidateId[] = ["GAMES_PLAYED", "COMPONENT_SIZE", "CROSS_CONFERENCE", "COMBINED_INFORMATION"];
  const specs: Phase8CandidateSpec[] = [];
  for (const lambda of BASE_LAMBDA_GRID) {
    for (const connectivity of connectivityIds) {
      specs.push({
        id: `${connectivity}_L${lambda}`,
        label: `${connectivity}, lambda=${lambda}`,
        baseLambda: lambda,
        connectivity,
        staleness: "NONE",
      });
    }
  }
  return specs;
}

/** Section 8/12 — staleness-only candidates at a fixed base lambda (the winner of the baseline sweep), small predeclared grid. */
export function buildStalenessSweepSpecs(baseLambda: number): Phase8CandidateSpec[] {
  const forms: StalenessFormId[] = ["THRESHOLD_RAMP", "BOUNDED_LOGISTIC"];
  const specs: Phase8CandidateSpec[] = [];
  for (const form of forms) {
    for (const floor of STALENESS_FLOOR_GRID) {
      for (const thresholdLow of STALENESS_THRESHOLD_LOW_GRID) {
        for (const thresholdHigh of STALENESS_THRESHOLD_HIGH_GRID) {
          specs.push({
            id: `${form}_F${floor}_L${thresholdLow}_H${thresholdHigh}`,
            label: `${form} floor=${floor} low=${thresholdLow} high=${thresholdHigh}`,
            baseLambda,
            connectivity: "GLOBAL_BASELINE",
            staleness: form,
            stalenessFloor: floor,
            stalenessThresholdLow: thresholdLow,
            stalenessThresholdHigh: thresholdHigh,
          });
        }
      }
    }
  }
  return specs;
}

/** Section 10 — joint model: best connectivity candidate's multiplier stacked with best staleness candidate's multiplier. */
export function buildJointSpec(bestConnectivity: Phase8CandidateSpec, bestStaleness: Phase8CandidateSpec): Phase8CandidateSpec {
  return {
    id: `JOINT_${bestConnectivity.connectivity}_${bestStaleness.staleness}`,
    label: `Joint: ${bestConnectivity.connectivity} + ${bestStaleness.staleness}`,
    baseLambda: bestConnectivity.baseLambda,
    connectivity: bestConnectivity.connectivity,
    staleness: bestStaleness.staleness,
    stalenessFloor: bestStaleness.stalenessFloor,
    stalenessThresholdLow: bestStaleness.stalenessThresholdLow,
    stalenessThresholdHigh: bestStaleness.stalenessThresholdHigh,
  };
}
