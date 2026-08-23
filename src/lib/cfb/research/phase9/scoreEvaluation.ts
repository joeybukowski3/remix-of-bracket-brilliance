import { evaluateScorePredictions, type Phase4EvaluationBundle } from "../phase4/scoreEvaluation";
import type { ScorePrediction } from "../phase4/types";
import type { CalibratedPrediction } from "../phase5/types";

function toCalibratedScorePrediction(c: CalibratedPrediction): ScorePrediction {
  return {
    gameId: c.gameId,
    season: c.season,
    week: c.week,
    homeTeamExternalId: c.homeTeamExternalId,
    awayTeamExternalId: c.awayTeamExternalId,
    expectedHomePoints: c.calibratedExpectedHome,
    expectedAwayPoints: c.calibratedExpectedAway,
    projectedMargin: c.calibratedProjectedMargin,
    projectedTotal: c.calibratedProjectedTotal,
    actualHomePoints: c.actualHomePoints,
    actualAwayPoints: c.actualAwayPoints,
    actualMargin: c.actualMargin,
    actualTotal: c.actualTotal,
    matchupPopulation: "fbs_vs_fbs",
  };
}

function toRawScorePrediction(c: CalibratedPrediction): ScorePrediction {
  return {
    ...toCalibratedScorePrediction(c),
    expectedHomePoints: c.rawExpectedHome,
    expectedAwayPoints: c.rawExpectedAway,
    projectedMargin: c.rawProjectedMargin,
    projectedTotal: c.rawProjectedTotal,
  };
}

/** Sections 3/6/7/8/9 — home/away/margin/total via Phase 4's OWN evaluator (reused verbatim, zero duplication). */
export function evaluateCalibrated(calibrated: readonly CalibratedPrediction[]): Phase4EvaluationBundle {
  return evaluateScorePredictions(calibrated.map(toCalibratedScorePrediction));
}

/** Section 10 — raw (pre-calibration) vs calibrated total comparison, confirming TOTAL_ONLY still beats raw. */
export function evaluateRawVsCalibratedTotal(calibrated: readonly CalibratedPrediction[]) {
  const raw = evaluateScorePredictions(calibrated.map(toRawScorePrediction));
  const cal = evaluateScorePredictions(calibrated.map(toCalibratedScorePrediction));
  return {
    rawTotalMae: raw.total.mae,
    calibratedTotalMae: cal.total.mae,
    rawTotalSlope: raw.total.calibrationSlope,
    calibratedTotalSlope: cal.total.calibrationSlope,
    totalOnlyBeatsRaw: raw.total.mae !== null && cal.total.mae !== null ? cal.total.mae <= raw.total.mae : null,
  };
}

export function filterBySeasons<T extends { season: number }>(rows: readonly T[], seasons: readonly number[]): T[] {
  const set = new Set(seasons);
  return rows.filter((r) => set.has(r.season));
}

export function filterByWeekRange<T extends { week: number }>(rows: readonly T[], min: number, max: number): T[] {
  return rows.filter((r) => r.week >= min && r.week <= max);
}
