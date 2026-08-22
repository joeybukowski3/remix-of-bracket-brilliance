import { ELASTIC_NET_ALPHA_GRID, ELASTIC_NET_L1_RATIO_GRID, RIDGE_ALPHA_GRID } from "./linear";
import { SHRINKAGE_K_CANDIDATES } from "./baselines";
import type { PointAccuracyMetrics, PromotionDecision } from "./types";

/**
 * Promotion criteria (spec section 11), fixed and documented BEFORE any 2024
 * validation number is viewed. These thresholds are constants, not tuned
 * after seeing results -- `evaluatePromotion` only ever consumes metrics that
 * were computed after this module (and its thresholds) already existed.
 */

export const PROMOTION_CRITERIA = {
  /** Candidate MAE must beat the strongest simple baseline's MAE by at least this relative fraction. */
  minRelativeMaeImprovement: 0.02,
  /** Candidate RMSE may not exceed the baseline's RMSE by more than this relative fraction. */
  maxRelativeRmseDegradation: 0.05,
  /** Mean |projected - actual| across non-empty calibration buckets may not exceed this many points. */
  maxCalibrationGapPoints: 2.5,
  /** |signed mean error| may not exceed this many points. */
  maxAbsoluteBiasPoints: 0.75,
  /** Candidate MAE may not be worse than the baseline's MAE by more than this many points in more than one of the three week segments. */
  maxWeekSegmentMaeRegressionPoints: 0.5,
  maxWeekSegmentFailuresAllowed: 1,
  /** Candidate MAE in the rookie/no-prior segment may not be worse than the baseline's rookie-segment MAE by more than this many points. */
  maxRookieSegmentMaeRegressionPoints: 1.0,
} as const;

export const PREREGISTERED_HYPERPARAMETER_GRIDS = {
  ridgeAlphaGrid: RIDGE_ALPHA_GRID,
  elasticNetAlphaGrid: ELASTIC_NET_ALPHA_GRID,
  elasticNetL1RatioGrid: ELASTIC_NET_L1_RATIO_GRID,
  shrinkageKGrid: SHRINKAGE_K_CANDIDATES,
} as const;

export type CalibrationGap = { meanAbsoluteGapPoints: number | null };

export function calibrationGap(buckets: readonly { meanProjected: number | null; meanActual: number | null; rows: number }[]): CalibrationGap {
  const gaps = buckets
    .filter((bucket) => bucket.meanProjected != null && bucket.meanActual != null)
    .map((bucket) => Math.abs(bucket.meanProjected! - bucket.meanActual!));
  return { meanAbsoluteGapPoints: gaps.length ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length : null };
}

export function evaluatePromotion(input: {
  candidateOverall: PointAccuracyMetrics;
  baselineOverall: PointAccuracyMetrics;
  candidateCalibrationGap: CalibrationGap;
  candidateWeekSegmentMae: readonly (number | null)[]; // [weeks1-3, weeks4-8, weeks9+]
  baselineWeekSegmentMae: readonly (number | null)[];
  candidateRookieMae: number | null;
  baselineRookieMae: number | null;
}): PromotionDecision {
  const reasons: string[] = [];
  const c = PROMOTION_CRITERIA;

  if (input.candidateOverall.mae == null || input.baselineOverall.mae == null) {
    return { promoted: false, reasons: ["Missing MAE for candidate or baseline; cannot evaluate promotion."] };
  }
  const relativeMaeImprovement = (input.baselineOverall.mae - input.candidateOverall.mae) / input.baselineOverall.mae;
  if (relativeMaeImprovement < c.minRelativeMaeImprovement) {
    reasons.push(`MAE improvement ${(relativeMaeImprovement * 100).toFixed(2)}% below required ${(c.minRelativeMaeImprovement * 100).toFixed(2)}%.`);
  }

  if (input.candidateOverall.rmse != null && input.baselineOverall.rmse != null) {
    const relativeRmseDelta = (input.candidateOverall.rmse - input.baselineOverall.rmse) / input.baselineOverall.rmse;
    if (relativeRmseDelta > c.maxRelativeRmseDegradation) {
      reasons.push(`RMSE degraded ${(relativeRmseDelta * 100).toFixed(2)}%, exceeds allowed ${(c.maxRelativeRmseDegradation * 100).toFixed(2)}%.`);
    }
  }

  if (input.candidateCalibrationGap.meanAbsoluteGapPoints != null && input.candidateCalibrationGap.meanAbsoluteGapPoints > c.maxCalibrationGapPoints) {
    reasons.push(`Calibration gap ${input.candidateCalibrationGap.meanAbsoluteGapPoints.toFixed(2)} exceeds ${c.maxCalibrationGapPoints}.`);
  }

  if (input.candidateOverall.bias != null && Math.abs(input.candidateOverall.bias) > c.maxAbsoluteBiasPoints) {
    reasons.push(`|Bias| ${Math.abs(input.candidateOverall.bias).toFixed(2)} exceeds ${c.maxAbsoluteBiasPoints}.`);
  }

  const weekFailures = input.candidateWeekSegmentMae.filter((mae, index) => {
    const baselineMae = input.baselineWeekSegmentMae[index];
    return mae != null && baselineMae != null && mae - baselineMae > c.maxWeekSegmentMaeRegressionPoints;
  }).length;
  if (weekFailures > c.maxWeekSegmentFailuresAllowed) {
    reasons.push(`Regressed vs baseline MAE in ${weekFailures} week segments (allowed ${c.maxWeekSegmentFailuresAllowed}).`);
  }

  if (
    input.candidateRookieMae != null &&
    input.baselineRookieMae != null &&
    input.candidateRookieMae - input.baselineRookieMae > c.maxRookieSegmentMaeRegressionPoints
  ) {
    reasons.push(
      `Rookie/no-prior MAE regressed by ${(input.candidateRookieMae - input.baselineRookieMae).toFixed(2)}, exceeds ${c.maxRookieSegmentMaeRegressionPoints}.`,
    );
  }

  return { promoted: reasons.length === 0, reasons: reasons.length ? reasons : ["All promotion criteria satisfied."] };
}
