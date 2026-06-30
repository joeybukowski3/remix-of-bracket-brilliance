/**
 * mlb-hr-calibration-scaffold.mjs
 *
 * Scaffolding for future score-to-probability calibration. Does NOT
 * publish a calibrated probability — only reports whether the graded
 * sample is large enough to attempt calibration.
 *
 * Minimum thresholds before attempting a real calibration fit:
 *   - At least 1,000 graded batter-game predictions
 *   - At least 100 HR outcomes (hits)
 *   - At least 28 calendar days of graded data
 *   - Out-of-sample validation required (train/test split by date)
 */

export const CALIBRATION_MIN_THRESHOLDS = {
  minGradedPredictions: 1000,
  minHrOutcomes: 100,
  minCalendarDays: 28,
};

export function assessCalibrationReadiness(gradedRecords) {
  const eligible = gradedRecords.filter((r) => r.result?.status === "hit" || r.result?.status === "miss");
  const hrOutcomes = eligible.filter((r) => r.result.status === "hit").length;
  const dates = new Set(eligible.map((r) => r.date));
  const calendarDays = dates.size;

  const meetsThreshold =
    eligible.length >= CALIBRATION_MIN_THRESHOLDS.minGradedPredictions &&
    hrOutcomes >= CALIBRATION_MIN_THRESHOLDS.minHrOutcomes &&
    calendarDays >= CALIBRATION_MIN_THRESHOLDS.minCalendarDays;

  const warnings = [];
  if (eligible.length < CALIBRATION_MIN_THRESHOLDS.minGradedPredictions) {
    warnings.push(`Insufficient graded predictions: ${eligible.length}/${CALIBRATION_MIN_THRESHOLDS.minGradedPredictions}`);
  }
  if (hrOutcomes < CALIBRATION_MIN_THRESHOLDS.minHrOutcomes) {
    warnings.push(`Insufficient HR outcomes: ${hrOutcomes}/${CALIBRATION_MIN_THRESHOLDS.minHrOutcomes}`);
  }
  if (calendarDays < CALIBRATION_MIN_THRESHOLDS.minCalendarDays) {
    warnings.push(`Insufficient calendar-day coverage: ${calendarDays}/${CALIBRATION_MIN_THRESHOLDS.minCalendarDays} days`);
  }
  if (meetsThreshold) {
    warnings.push("Sample meets minimum thresholds, but out-of-sample (train/test split by date) validation is still required before publishing any probability.");
  }

  return {
    sampleCount: eligible.length,
    hrOutcomeCount: hrOutcomes,
    calendarDayCount: calendarDays,
    meetsMinimumThreshold: meetsThreshold,
    warnings,
    readyForCalibrationFit: false,
  };
}

export const FUTURE_CALIBRATION_METRICS = [
  "brierScore",
  "logLoss",
  "calibrationBucketTable",
  "trainTestSplitByDate",
];
