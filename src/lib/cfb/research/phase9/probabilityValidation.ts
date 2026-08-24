import {
  computeBrierScore,
  computeCalibrationBuckets,
  computeExpectedCalibrationError,
  computeIntervalCoverage,
  computeLogLoss,
  type WinProbabilityRow,
} from "../phase5/probabilityEvaluation";
import { INTERVAL_LEVELS } from "../phase5/config";
import type { CalibratedPrediction, ProbabilityOutputs } from "../phase5/types";
import { EXTREME_PROBABILITY_BUCKETS } from "./config";

function toWinRows(calibrated: readonly CalibratedPrediction[], probabilities: readonly ProbabilityOutputs[]): WinProbabilityRow[] {
  const byGame = new Map(calibrated.map((c) => [c.gameId, c]));
  return probabilities
    .map((p) => {
      const c = byGame.get(p.gameId);
      if (!c || p.pHomeWin === null) return null;
      return { pHomeWin: p.pHomeWin, homeWon: c.actualMargin > 0 };
    })
    .filter((r): r is WinProbabilityRow => r !== null);
}

/** Section 12 — Brier/log loss/ECE/calibration buckets, reusing Phase 5's own probability-evaluation functions verbatim. */
export function buildProbabilitySummary(calibrated: readonly CalibratedPrediction[], probabilities: readonly ProbabilityOutputs[]) {
  const winRows = toWinRows(calibrated, probabilities);
  const buckets = computeCalibrationBuckets(winRows);
  return {
    n: winRows.length,
    brier: computeBrierScore(winRows),
    logLoss: computeLogLoss(winRows),
    ece: computeExpectedCalibrationError(buckets),
    calibrationBuckets: buckets,
  };
}

const LEVEL_FIELD = {
  0.5: { margin: "marginInterval50", total: "totalInterval50" },
  0.8: { margin: "marginInterval80", total: "totalInterval80" },
  0.9: { margin: "marginInterval90", total: "totalInterval90" },
  0.95: { margin: "marginInterval95", total: "totalInterval95" },
} as const;

/** Sections 12/20/21 — 50/80/90/95% interval coverage for margin and total, reusing Phase 5's computeIntervalCoverage verbatim. */
export function buildIntervalCoverage(probabilities: readonly ProbabilityOutputs[]) {
  const marginCoverage = INTERVAL_LEVELS.map((level) => {
    const field = LEVEL_FIELD[level].margin;
    const rows = probabilities
      .map((p) => {
        const interval = p[field];
        return interval ? { actual: p.actualMargin, interval } : null;
      })
      .filter((r): r is { actual: number; interval: [number, number] } => r !== null);
    return { level, ...computeIntervalCoverage(rows) };
  });
  const totalCoverage = INTERVAL_LEVELS.map((level) => {
    const field = LEVEL_FIELD[level].total;
    const rows = probabilities
      .map((p) => {
        const interval = p[field];
        return interval ? { actual: p.actualTotal, interval } : null;
      })
      .filter((r): r is { actual: number; interval: [number, number] } => r !== null);
    return { level, ...computeIntervalCoverage(rows) };
  });
  return { marginCoverage, totalCoverage };
}

export type ExtremeProbabilityBucketRow = { label: string; n: number; meanPredicted: number | null; empiricalWinRate: number | null; calibrationError: number | null };

/**
 * Section 13 — model-only calibration on RAW pHomeWin (asymmetric buckets,
 * distinct from Phase 5's favored-side WIN_PROBABILITY_BUCKETS), reaudits
 * whether Phase 6's "extreme disagreements are overconfident" finding
 * persists after the Phase 8 structural change.
 */
export function buildExtremeProbabilityQa(calibrated: readonly CalibratedPrediction[], probabilities: readonly ProbabilityOutputs[]): ExtremeProbabilityBucketRow[] {
  const winRows = toWinRows(calibrated, probabilities);
  return EXTREME_PROBABILITY_BUCKETS.map((bucket) => {
    const inBucket = winRows.filter((r) => r.pHomeWin >= bucket.min && r.pHomeWin < bucket.max);
    if (inBucket.length === 0) return { label: bucket.label, n: 0, meanPredicted: null, empiricalWinRate: null, calibrationError: null };
    const meanPredicted = inBucket.reduce((s, r) => s + r.pHomeWin, 0) / inBucket.length;
    const empiricalWinRate = inBucket.filter((r) => r.homeWon).length / inBucket.length;
    return { label: bucket.label, n: inBucket.length, meanPredicted, empiricalWinRate, calibrationError: Math.abs(meanPredicted - empiricalWinRate) };
  });
}
