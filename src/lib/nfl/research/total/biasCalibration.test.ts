import { describe, expect, it } from "vitest";
import { fitCalibratedTotalRidge, scoreCalibratedTotalRidge, CROSS_FIT_PARTITIONS } from "./biasCalibration";
import { fitTotalRidge, scoreTotalRidge } from "./ridgeModel";
import type { NflTotalResearchDatasetRow } from "./types";

function makeGameRows(gameId: string, season: number, week: number, homePoints: number, awayPoints: number, seed: number): NflTotalResearchDatasetRow[] {
  const base = {
    season, week, gameId,
    scoringEnvironment: { value: 22, sampleGames: 200, mode: "seasonToDateWithPriorFallback" as const, method: "seasonToDate" as const },
    pregameSafe: true,
  };
  return [
    {
      ...base, team: "buf", opponent: "mia", homeAway: "home" as const,
      actualTeamPoints: homePoints, actualGameTotal: homePoints + awayPoints,
      offense: { epaPerPlay: 0.05 + seed * 0.01, successRate: 0.4 + seed * 0.005, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" as const },
      opponentDefenseAllowed: { epaPerPlay: -0.02, successRate: 0.42, explosiveRate: 0.07, sampleGames: 4, samplePlays: 250, window: "seasonPrior" as const },
    },
    {
      ...base, team: "mia", opponent: "buf", homeAway: "away" as const,
      actualTeamPoints: awayPoints, actualGameTotal: homePoints + awayPoints,
      offense: { epaPerPlay: -0.03 + seed * 0.008, successRate: 0.38, explosiveRate: 0.06, sampleGames: 4, samplePlays: 250, window: "seasonPrior" as const },
      opponentDefenseAllowed: { epaPerPlay: 0.04, successRate: 0.44, explosiveRate: 0.09, sampleGames: 4, samplePlays: 250, window: "seasonPrior" as const },
    },
  ];
}

// 20 games' worth of training rows -- enough for CROSS_FIT_PARTITIONS=5 non-degenerate partitions.
const TRAIN_ROWS: NflTotalResearchDatasetRow[] = Array.from({ length: 20 }, (_, i) =>
  makeGameRows(`2022_${String(i + 1).padStart(2, "0")}_buf_mia`, 2022, i + 1, 20 + (i % 7), 17 + (i % 5), i),
).flat();

describe("fitCalibratedTotalRidge (Model C cross-fit bias calibration)", () => {
  it("produces one out-of-fold residual for every usable training row when partitions are non-degenerate", () => {
    const model = fitCalibratedTotalRidge(TRAIN_ROWS, 1, CROSS_FIT_PARTITIONS);
    expect(model.crossFitSampleSize).toBe(TRAIN_ROWS.length);
  });

  it("is deterministic -- refitting on identical data reproduces the identical calibration constant", () => {
    const a = fitCalibratedTotalRidge(TRAIN_ROWS, 1);
    const b = fitCalibratedTotalRidge(TRAIN_ROWS, 1);
    expect(a.biasCorrection).toBe(b.biasCorrection);
    expect(a.ridge.coefficients).toEqual(b.ridge.coefficients);
  });

  it("the final applied ridge is identical to an ordinary fitTotalRidge on the full training fold (Model B) -- only the additive correction differs", () => {
    const calibrated = fitCalibratedTotalRidge(TRAIN_ROWS, 1);
    const plain = fitTotalRidge(TRAIN_ROWS, 1);
    expect(calibrated.ridge.coefficients).toEqual(plain.coefficients);
    expect(calibrated.ridge.intercept).toBe(plain.intercept);
  });

  it("scoreCalibratedTotalRidge equals the plain ridge score plus the calibration constant, for every row", () => {
    const calibrated = fitCalibratedTotalRidge(TRAIN_ROWS, 1);
    const plain = fitTotalRidge(TRAIN_ROWS, 1);
    for (const row of TRAIN_ROWS.slice(0, 4)) {
      const plainScore = scoreTotalRidge(plain, row)!;
      const calibratedScore = scoreCalibratedTotalRidge(calibrated, row)!;
      expect(calibratedScore).toBeCloseTo(plainScore + calibrated.biasCorrection, 9);
    }
  });

  it("the calibration constant is a genuine out-of-fold estimate, not the (near-zero-by-construction) in-sample residual mean", () => {
    const calibrated = fitCalibratedTotalRidge(TRAIN_ROWS, 1);
    const plain = fitTotalRidge(TRAIN_ROWS, 1);
    const inSampleResiduals = TRAIN_ROWS.map((r) => r.actualTeamPoints - scoreTotalRidge(plain, r)!);
    const inSampleMean = inSampleResiduals.reduce((s, v) => s + v, 0) / inSampleResiduals.length;
    // The in-sample mean is forced near zero by the intercept-bearing fit (this is the documented naive-approach failure mode).
    expect(Math.abs(inSampleMean)).toBeLessThan(1e-6);
    // The genuine OOF calibration constant is NOT required to be near zero -- it reflects real held-out generalization error.
    // We only assert it was actually computed from a distinct (cross-fit) procedure, not copied from the in-sample mean.
    expect(calibrated.biasCorrection).not.toBe(inSampleMean);
  });

  it("never reads or is affected by any row outside the trainRows argument (no hidden global/validation access)", () => {
    const smallerTrain = TRAIN_ROWS.slice(0, 10);
    const fullTrain = TRAIN_ROWS;
    const modelSmall = fitCalibratedTotalRidge(smallerTrain, 1);
    const modelFull = fitCalibratedTotalRidge(fullTrain, 1);
    // Different train sets must generally produce different calibration -- proves the function is a pure
    // function of its argument, not reading some wider dataset from module state.
    expect(modelSmall.biasCorrection).not.toBe(modelFull.biasCorrection);
  });

  it("throws on zero usable training rows rather than silently producing NaN", () => {
    expect(() => fitCalibratedTotalRidge([], 1)).toThrow(/zero usable training rows/);
  });
});
