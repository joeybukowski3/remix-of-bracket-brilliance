// CFB Model V2 Phase 5 — score distribution + total-calibration research.
// Consumes only Phase 4's ScorePrediction stream (src/lib/cfb/research/phase4).
// Zero dependency on CfbResearchMarketLine, marketAnchor, MIC, or production
// config (see noMarketImportGuard.test.ts, mirrored here).

export type CfbTotalCalibrationMethod = "NONE" | "LINEAR" | "SEASON_AWARE" | "WEEK_SEGMENT_AWARE" | "VARIANCE_AWARE";
export type CfbScoreCalibrationMode = "RAW" | "TOTAL_ONLY" | "SEPARATE_HOME_AWAY";
export type CfbDistributionFamily = "INDEPENDENT_NORMAL" | "BIVARIATE_NORMAL" | "EMPIRICAL_BOOTSTRAP" | "STUDENT_T";

/** One calibrated/distribution-ready prediction, built from a Phase 4 ScorePrediction. */
export type CalibratedPrediction = {
  gameId: string;
  season: number;
  week: number;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  rawExpectedHome: number;
  rawExpectedAway: number;
  rawProjectedMargin: number;
  rawProjectedTotal: number;
  calibratedExpectedHome: number;
  calibratedExpectedAway: number;
  calibratedProjectedMargin: number;
  calibratedProjectedTotal: number;
  actualHomePoints: number;
  actualAwayPoints: number;
  actualMargin: number;
  actualTotal: number;
};

export type LinearCoefficients = { intercept: number; slope: number };

export type ResidualDistributionParams = {
  homeMean: number;
  homeSd: number;
  awayMean: number;
  awaySd: number;
  correlation: number;
  n: number;
};

export type ProbabilityOutputs = {
  gameId: string;
  season: number;
  week: number;
  pHomeWin: number | null;
  pAwayWin: number | null;
  homeInterval50: [number, number] | null;
  homeInterval80: [number, number] | null;
  homeInterval90: [number, number] | null;
  homeInterval95: [number, number] | null;
  awayInterval50: [number, number] | null;
  awayInterval80: [number, number] | null;
  awayInterval90: [number, number] | null;
  awayInterval95: [number, number] | null;
  marginInterval50: [number, number] | null;
  marginInterval80: [number, number] | null;
  marginInterval90: [number, number] | null;
  marginInterval95: [number, number] | null;
  totalInterval50: [number, number] | null;
  totalInterval80: [number, number] | null;
  totalInterval90: [number, number] | null;
  totalInterval95: [number, number] | null;
  actualHomePoints: number;
  actualAwayPoints: number;
  actualMargin: number;
  actualTotal: number;
};
