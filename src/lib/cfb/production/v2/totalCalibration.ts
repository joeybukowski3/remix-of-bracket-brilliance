// CFB Model V2 — production TOTAL_ONLY_LINEAR calibration (WU3 §10/§11). A
// literal, faithful port of research/phase5/totalCalibration.ts's pooled
// `fitLinear`/`applyCalibration` (LINEAR method only — production's frozen
// CFB_V2_CALIBRATION_CONFIG never selects SEASON_AWARE/WEEK_SEGMENT_AWARE/
// VARIANCE_AWARE). Zero runtime dependency on src/lib/cfb/research/**.

export type CfbV2CalibrationTrainingRow = { rawTotal: number; actualTotal: number };
export type CfbV2LinearCoefficients = { intercept: number; slope: number };

/** Pooled OLS fit of actualTotal ~ rawTotal — identical arithmetic to research's fitLinear. */
export function fitCfbV2TotalCalibration(trainingRows: readonly CfbV2CalibrationTrainingRow[]): CfbV2LinearCoefficients {
  const n = trainingRows.length;
  if (n === 0) return { intercept: 0, slope: 1 };
  const meanX = trainingRows.reduce((s, r) => s + r.rawTotal, 0) / n;
  const meanY = trainingRows.reduce((s, r) => s + r.actualTotal, 0) / n;
  let cov = 0;
  let varX = 0;
  for (const r of trainingRows) {
    cov += (r.rawTotal - meanX) * (r.actualTotal - meanY);
    varX += (r.rawTotal - meanX) ** 2;
  }
  if (varX < 1e-9) return { intercept: meanY, slope: 0 };
  const slope = cov / varX;
  const intercept = meanY - slope * meanX;
  return { intercept, slope };
}

export function applyCfbV2Calibration(rawTotal: number, coefficients: CfbV2LinearCoefficients): number {
  return coefficients.intercept + coefficients.slope * rawTotal;
}

export type CfbV2CalibratedScore = {
  calibratedTotal: number;
  calibratedHomePoints: number;
  calibratedAwayPoints: number;
};

/**
 * §10: TOTAL_ONLY calibration only ever recalibrates the total; margin is
 * always preserved from the raw scoring-model output. Required identities
 * (home+away=calibratedTotal, home-away=rawProjectedMargin) hold by
 * construction, not by a separate assertion.
 */
export function applyCfbV2TotalOnlyCalibration(rawProjectedMargin: number, rawProjectedTotal: number, coefficients: CfbV2LinearCoefficients): CfbV2CalibratedScore {
  const calibratedTotal = applyCfbV2Calibration(rawProjectedTotal, coefficients);
  return {
    calibratedTotal,
    calibratedHomePoints: (calibratedTotal + rawProjectedMargin) / 2,
    calibratedAwayPoints: (calibratedTotal - rawProjectedMargin) / 2,
  };
}
