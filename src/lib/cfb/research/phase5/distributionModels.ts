import { standardNormalCdf, standardNormalInverseCdf } from "./normalMath";
import type { CfbDistributionFamily, ResidualDistributionParams } from "./types";

export type DistributionInput = {
  expectedHome: number;
  expectedAway: number;
  family: CfbDistributionFamily;
  params: ResidualDistributionParams;
  /** Required only for EMPIRICAL_BOOTSTRAP — paired (home, away) residuals from the training window. */
  historicalResidualPairs?: readonly { home: number; away: number }[];
  /** Required only for STUDENT_T. */
  degreesOfFreedom?: number;
  random: () => number;
  simulationDraws: number;
};

export type DistributionOutput = {
  pHomeWin: number;
  homeInterval: (level: number) => [number, number];
  awayInterval: (level: number) => [number, number];
  marginInterval: (level: number) => [number, number];
  totalInterval: (level: number) => [number, number];
};

/** Cornish-Fisher approximation of the Student-t inverse CDF (adequate for comparison purposes, not exact). */
function studentTInverseCdf(p: number, df: number): number {
  const z = standardNormalInverseCdf(p);
  const g1 = (z ** 3 + z) / 4;
  const g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / 96;
  const g3 = (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / 384;
  const g4 = (79 * z ** 9 + 776 * z ** 7 + 1482 * z ** 5 - 1920 * z ** 3 - 945 * z) / 92160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}

function normalInterval(mean: number, sd: number, level: number): [number, number] {
  const tail = (1 - level) / 2;
  return [mean + sd * standardNormalInverseCdf(tail), mean + sd * standardNormalInverseCdf(1 - tail)];
}

function studentTInterval(mean: number, sd: number, level: number, df: number): [number, number] {
  const tail = (1 - level) / 2;
  return [mean + sd * studentTInverseCdf(tail, df), mean + sd * studentTInverseCdf(1 - tail, df)];
}

function analyticNormalFamily(input: DistributionInput, useCorrelation: boolean): DistributionOutput {
  const { expectedHome, expectedAway, params } = input;
  const rho = useCorrelation ? params.correlation : 0;
  const marginMean = expectedHome - expectedAway;
  const totalMean = expectedHome + expectedAway;
  const marginVariance = Math.max(params.homeSd ** 2 + params.awaySd ** 2 - 2 * rho * params.homeSd * params.awaySd, 1e-6);
  const totalVariance = Math.max(params.homeSd ** 2 + params.awaySd ** 2 + 2 * rho * params.homeSd * params.awaySd, 1e-6);
  const marginSd = Math.sqrt(marginVariance);
  const totalSd = Math.sqrt(totalVariance);

  return {
    pHomeWin: standardNormalCdf(marginMean / marginSd),
    homeInterval: (level) => normalInterval(expectedHome, params.homeSd, level),
    awayInterval: (level) => normalInterval(expectedAway, params.awaySd, level),
    marginInterval: (level) => normalInterval(marginMean, marginSd, level),
    totalInterval: (level) => normalInterval(totalMean, totalSd, level),
  };
}

function studentTFamily(input: DistributionInput): DistributionOutput {
  const { expectedHome, expectedAway, params, degreesOfFreedom } = input;
  const df = degreesOfFreedom ?? 10;
  const rho = params.correlation;
  const marginMean = expectedHome - expectedAway;
  const totalMean = expectedHome + expectedAway;
  const marginSd = Math.sqrt(Math.max(params.homeSd ** 2 + params.awaySd ** 2 - 2 * rho * params.homeSd * params.awaySd, 1e-6));
  const totalSd = Math.sqrt(Math.max(params.homeSd ** 2 + params.awaySd ** 2 + 2 * rho * params.homeSd * params.awaySd, 1e-6));
  // t-distribution has no closed-form P(X>0) as simple as normal's CDF here; use the t CDF via its
  // relationship to the incomplete beta function is overkill for this research comparison — approximate
  // using the same Cornish-Fisher inverse relationship by solving for probability via bisection on the interval fn.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const q = marginMean + marginSd * studentTInverseCdf(mid, df);
    if (q < 0) lo = mid;
    else hi = mid;
  }
  const pHomeWin = 1 - (lo + hi) / 2;

  return {
    pHomeWin,
    homeInterval: (level) => studentTInterval(expectedHome, params.homeSd, level, df),
    awayInterval: (level) => studentTInterval(expectedAway, params.awaySd, level, df),
    marginInterval: (level) => studentTInterval(marginMean, marginSd, level, df),
    totalInterval: (level) => studentTInterval(totalMean, totalSd, level, df),
  };
}

/** Deterministic Monte Carlo resampling from historical (home, away) residual pairs — Section 7C / Section 14. */
function empiricalBootstrapFamily(input: DistributionInput): DistributionOutput {
  const { expectedHome, expectedAway, historicalResidualPairs, random, simulationDraws } = input;
  const pairs = historicalResidualPairs ?? [];
  if (pairs.length === 0) {
    return analyticNormalFamily(input, true); // no historical pool yet (very early in walk-forward) — fall back
  }
  const homeSamples: number[] = [];
  const awaySamples: number[] = [];
  const marginSamples: number[] = [];
  const totalSamples: number[] = [];
  let homeWins = 0;
  for (let i = 0; i < simulationDraws; i += 1) {
    const idx = Math.floor(random() * pairs.length);
    const pair = pairs[idx];
    const home = expectedHome + pair.home;
    const away = expectedAway + pair.away;
    homeSamples.push(home);
    awaySamples.push(away);
    marginSamples.push(home - away);
    totalSamples.push(home + away);
    if (home > away) homeWins += 1;
  }
  homeSamples.sort((a, b) => a - b);
  awaySamples.sort((a, b) => a - b);
  marginSamples.sort((a, b) => a - b);
  totalSamples.sort((a, b) => a - b);

  const empiricalInterval = (sorted: number[]) => (level: number): [number, number] => {
    const tail = (1 - level) / 2;
    const lowIdx = Math.floor(tail * (sorted.length - 1));
    const highIdx = Math.ceil((1 - tail) * (sorted.length - 1));
    return [sorted[lowIdx], sorted[highIdx]];
  };

  return {
    pHomeWin: homeWins / simulationDraws,
    homeInterval: empiricalInterval(homeSamples),
    awayInterval: empiricalInterval(awaySamples),
    marginInterval: empiricalInterval(marginSamples),
    totalInterval: empiricalInterval(totalSamples),
  };
}

export function computeDistributionOutput(input: DistributionInput): DistributionOutput {
  switch (input.family) {
    case "INDEPENDENT_NORMAL":
      return analyticNormalFamily(input, false);
    case "BIVARIATE_NORMAL":
      return analyticNormalFamily(input, true);
    case "STUDENT_T":
      return studentTFamily(input);
    case "EMPIRICAL_BOOTSTRAP":
      return empiricalBootstrapFamily(input);
  }
}
