import type { ScorePrediction } from "./types";

export type ResidualStats = {
  n: number;
  mean: number | null;
  sd: number | null;
  skewness: number | null;
  kurtosis: number | null;
};

function residualStats(residuals: readonly number[]): ResidualStats {
  const n = residuals.length;
  if (n === 0) return { n: 0, mean: null, sd: null, skewness: null, kurtosis: null };
  const mean = residuals.reduce((s, v) => s + v, 0) / n;
  const variance = residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd < 1e-9) return { n, mean, sd, skewness: null, kurtosis: null };
  const skewness = residuals.reduce((s, v) => s + ((v - mean) / sd) ** 3, 0) / n;
  const kurtosis = residuals.reduce((s, v) => s + ((v - mean) / sd) ** 4, 0) / n - 3; // excess kurtosis
  return { n, mean, sd, skewness, kurtosis };
}

function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (xs[i] - meanX) * (ys[i] - meanY);
    varX += (xs[i] - meanX) ** 2;
    varY += (ys[i] - meanY) ** 2;
  }
  return varX < 1e-12 || varY < 1e-12 ? null : cov / Math.sqrt(varX * varY);
}

export type ResidualDiagnosticsBundle = {
  home: ResidualStats;
  away: ResidualStats;
  margin: ResidualStats;
  total: ResidualStats;
  homeAwayResidualCorrelation: number | null;
};

function valid(predictions: readonly ScorePrediction[]) {
  return predictions.filter(
    (p) => p.expectedHomePoints !== null && p.expectedAwayPoints !== null && p.actualHomePoints !== null && p.actualAwayPoints !== null,
  );
}

export function computeResidualDiagnostics(predictions: readonly ScorePrediction[]): ResidualDiagnosticsBundle {
  const rows = valid(predictions);
  const homeResiduals = rows.map((p) => p.expectedHomePoints! - p.actualHomePoints!);
  const awayResiduals = rows.map((p) => p.expectedAwayPoints! - p.actualAwayPoints!);
  const marginResiduals = rows.map((p) => p.projectedMargin! - p.actualMargin!);
  const totalResiduals = rows.map((p) => p.projectedTotal! - p.actualTotal!);

  return {
    home: residualStats(homeResiduals),
    away: residualStats(awayResiduals),
    margin: residualStats(marginResiduals),
    total: residualStats(totalResiduals),
    homeAwayResidualCorrelation: pearsonCorrelation(homeResiduals, awayResiduals),
  };
}

export type ExtremeScoreQaReport = {
  negativeHomeScore: number;
  negativeAwayScore: number;
  implausiblyHighScore: number; // > 100
  implausiblyHighTotal: number; // > 140
  extremeMargin: number; // |margin| > 70
  n: number;
};

export function auditExtremeScores(predictions: readonly ScorePrediction[]): ExtremeScoreQaReport {
  const rows = predictions.filter((p) => p.expectedHomePoints !== null && p.expectedAwayPoints !== null);
  return {
    negativeHomeScore: rows.filter((p) => (p.expectedHomePoints as number) < 0).length,
    negativeAwayScore: rows.filter((p) => (p.expectedAwayPoints as number) < 0).length,
    implausiblyHighScore: rows.filter((p) => (p.expectedHomePoints as number) > 100 || (p.expectedAwayPoints as number) > 100).length,
    implausiblyHighTotal: rows.filter((p) => (p.projectedTotal as number) > 140).length,
    extremeMargin: rows.filter((p) => Math.abs(p.projectedMargin as number) > 70).length,
    n: rows.length,
  };
}
