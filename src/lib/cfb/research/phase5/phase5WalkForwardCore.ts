import type { ScorePrediction } from "../phase4/types";
import { computeDistributionOutput } from "./distributionModels";
import { createSeededRandom } from "./normalMath";
import { fitTotalCalibration, applyCalibration, type CalibrationTrainingRow } from "./totalCalibration";
import { homoskedasticSd, predictSd, fitVarianceModel } from "./varianceModel";
import { pearsonCorrelation } from "./residualStats";
import type {
  CalibratedPrediction,
  CfbDistributionFamily,
  CfbScoreCalibrationMode,
  CfbTotalCalibrationMethod,
  ProbabilityOutputs,
} from "./types";

export type Phase5Config = {
  totalCalibrationMethod: CfbTotalCalibrationMethod;
  scoreCalibrationMode: CfbScoreCalibrationMode;
  distributionFamily: CfbDistributionFamily;
  heteroskedastic: boolean;
  simulationSeed: number;
  simulationDraws: number;
};

function isFinitePrediction(p: ScorePrediction): p is ScorePrediction & {
  expectedHomePoints: number;
  expectedAwayPoints: number;
  actualHomePoints: number;
  actualAwayPoints: number;
} {
  return (
    p.expectedHomePoints !== null &&
    p.expectedAwayPoints !== null &&
    p.actualHomePoints !== null &&
    p.actualAwayPoints !== null &&
    p.matchupPopulation === "fbs_vs_fbs"
  );
}

export type Phase5Result = { calibrated: CalibratedPrediction[]; probabilities: ProbabilityOutputs[] };

/**
 * Section 17 leakage-safe layer on top of Phase 4's already-walk-forward
 * ScorePrediction stream: every calibration coefficient, variance
 * estimate, and correlation used for game (season S, week W) is fit ONLY
 * from predictions strictly before that (season, week) — a "future"
 * prediction (later in the array) never enters an earlier game's training
 * pool, since the pool filter below is purely a function of (S, W).
 */
export function runPhase5WalkForwardCore(phase4Predictions: readonly ScorePrediction[], config: Phase5Config): Phase5Result {
  const valid = phase4Predictions.filter(isFinitePrediction).sort((a, b) => a.season - b.season || a.week - b.week);
  const calibrated: CalibratedPrediction[] = [];
  const probabilities: ProbabilityOutputs[] = [];
  const random = createSeededRandom(config.simulationSeed);

  for (const prediction of valid) {
    const trainingPool = calibrated.filter(
      (c) => c.season < prediction.season || (c.season === prediction.season && c.week < prediction.week),
    );

    const rawHome = prediction.expectedHomePoints;
    const rawAway = prediction.expectedAwayPoints;
    const rawMargin = rawHome - rawAway;
    const rawTotal = rawHome + rawAway;

    let calibratedHome: number;
    let calibratedAway: number;

    if (config.scoreCalibrationMode === "RAW" || trainingPool.length === 0) {
      calibratedHome = rawHome;
      calibratedAway = rawAway;
    } else if (config.scoreCalibrationMode === "TOTAL_ONLY") {
      const totalRows: CalibrationTrainingRow[] = trainingPool.map((c) => ({
        rawTotal: c.rawProjectedTotal,
        actualTotal: c.actualTotal,
        season: c.season,
        week: c.week,
      }));
      const coeffs = fitTotalCalibration(totalRows, config.totalCalibrationMethod, prediction.season, prediction.week);
      const calibratedTotal = applyCalibration(rawTotal, coeffs);
      calibratedHome = (calibratedTotal + rawMargin) / 2;
      calibratedAway = (calibratedTotal - rawMargin) / 2;
    } else {
      // SEPARATE_HOME_AWAY: fit each side's own linear calibration independently.
      const homeRows: CalibrationTrainingRow[] = trainingPool.map((c) => ({
        rawTotal: c.rawExpectedHome,
        actualTotal: c.actualHomePoints,
        season: c.season,
        week: c.week,
      }));
      const awayRows: CalibrationTrainingRow[] = trainingPool.map((c) => ({
        rawTotal: c.rawExpectedAway,
        actualTotal: c.actualAwayPoints,
        season: c.season,
        week: c.week,
      }));
      const homeCoeffs = fitTotalCalibration(homeRows, config.totalCalibrationMethod, prediction.season, prediction.week);
      const awayCoeffs = fitTotalCalibration(awayRows, config.totalCalibrationMethod, prediction.season, prediction.week);
      calibratedHome = applyCalibration(rawHome, homeCoeffs);
      calibratedAway = applyCalibration(rawAway, awayCoeffs);
    }

    const calibratedMargin = calibratedHome - calibratedAway;
    const calibratedTotal = calibratedHome + calibratedAway;

    const row: CalibratedPrediction = {
      gameId: prediction.gameId,
      season: prediction.season,
      week: prediction.week,
      homeTeamExternalId: prediction.homeTeamExternalId,
      awayTeamExternalId: prediction.awayTeamExternalId,
      rawExpectedHome: rawHome,
      rawExpectedAway: rawAway,
      rawProjectedMargin: rawMargin,
      rawProjectedTotal: rawTotal,
      calibratedExpectedHome: calibratedHome,
      calibratedExpectedAway: calibratedAway,
      calibratedProjectedMargin: calibratedMargin,
      calibratedProjectedTotal: calibratedTotal,
      actualHomePoints: prediction.actualHomePoints,
      actualAwayPoints: prediction.actualAwayPoints,
      actualMargin: prediction.actualMargin as number,
      actualTotal: prediction.actualTotal as number,
    };
    calibrated.push(row);

    // --- Probability / interval derivation, using only trainingPool residuals ---
    if (trainingPool.length < 10) continue; // too little history to trust a distribution yet

    const homeResiduals = trainingPool.map((c) => c.actualHomePoints - c.calibratedExpectedHome);
    const awayResiduals = trainingPool.map((c) => c.actualAwayPoints - c.calibratedExpectedAway);
    const homeSdHomo = homoskedasticSd(homeResiduals);
    const awaySdHomo = homoskedasticSd(awayResiduals);
    const correlation = pearsonCorrelation(homeResiduals, awayResiduals) ?? 0;

    let homeSd = homeSdHomo;
    let awaySd = awaySdHomo;
    if (config.heteroskedastic) {
      const homeVarianceModel = fitVarianceModel(trainingPool.map((c) => ({ predictor: c.calibratedProjectedTotal, residual: c.actualHomePoints - c.calibratedExpectedHome })));
      const awayVarianceModel = fitVarianceModel(trainingPool.map((c) => ({ predictor: c.calibratedProjectedTotal, residual: c.actualAwayPoints - c.calibratedExpectedAway })));
      homeSd = predictSd(calibratedTotal, homeVarianceModel, homeSdHomo);
      awaySd = predictSd(calibratedTotal, awayVarianceModel, awaySdHomo);
    }

    const distribution = computeDistributionOutput({
      expectedHome: calibratedHome,
      expectedAway: calibratedAway,
      family: config.distributionFamily,
      params: { homeMean: 0, homeSd, awayMean: 0, awaySd, correlation, n: trainingPool.length },
      historicalResidualPairs: trainingPool.map((c) => ({ home: c.actualHomePoints - c.calibratedExpectedHome, away: c.actualAwayPoints - c.calibratedExpectedAway })),
      random,
      simulationDraws: config.simulationDraws,
    });

    probabilities.push({
      gameId: prediction.gameId,
      season: prediction.season,
      week: prediction.week,
      pHomeWin: distribution.pHomeWin,
      pAwayWin: 1 - distribution.pHomeWin,
      homeInterval50: distribution.homeInterval(0.5),
      homeInterval80: distribution.homeInterval(0.8),
      homeInterval90: distribution.homeInterval(0.9),
      homeInterval95: distribution.homeInterval(0.95),
      awayInterval50: distribution.awayInterval(0.5),
      awayInterval80: distribution.awayInterval(0.8),
      awayInterval90: distribution.awayInterval(0.9),
      awayInterval95: distribution.awayInterval(0.95),
      marginInterval50: distribution.marginInterval(0.5),
      marginInterval80: distribution.marginInterval(0.8),
      marginInterval90: distribution.marginInterval(0.9),
      marginInterval95: distribution.marginInterval(0.95),
      totalInterval50: distribution.totalInterval(0.5),
      totalInterval80: distribution.totalInterval(0.8),
      totalInterval90: distribution.totalInterval(0.9),
      totalInterval95: distribution.totalInterval(0.95),
      actualHomePoints: row.actualHomePoints,
      actualAwayPoints: row.actualAwayPoints,
      actualMargin: row.actualMargin,
      actualTotal: row.actualTotal,
    });
  }

  return { calibrated, probabilities };
}
