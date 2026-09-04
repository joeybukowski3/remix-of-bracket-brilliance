import { describe, expect, it } from "vitest";
import { fitTotalRidge, isRowUsableForRidge, scoreTotalRidge } from "./ridgeModel";
import type { NflTotalResearchDatasetRow } from "./types";

function makeRow(overrides: Partial<NflTotalResearchDatasetRow>): NflTotalResearchDatasetRow {
  return {
    season: 2022, week: 5, gameId: "g", team: "buf", opponent: "mia", homeAway: "home",
    actualTeamPoints: 24, actualGameTotal: 45,
    scoringEnvironment: { value: 22, sampleGames: 200, mode: "seasonToDateWithPriorFallback", method: "seasonToDate" },
    offense: { epaPerPlay: 0.1, successRate: 0.45, explosiveRate: 0.1, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    opponentDefenseAllowed: { epaPerPlay: -0.05, successRate: 0.4, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    pregameSafe: true,
    ...overrides,
  };
}

const TRAIN_ROWS: NflTotalResearchDatasetRow[] = Array.from({ length: 12 }, (_, i) =>
  makeRow({
    actualTeamPoints: 17 + (i % 5) * 3,
    homeAway: i % 2 === 0 ? "home" : "away",
    offense: { epaPerPlay: -0.1 + i * 0.02, successRate: 0.35 + i * 0.01, explosiveRate: 0.05 + i * 0.005, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    opponentDefenseAllowed: { epaPerPlay: 0.1 - i * 0.015, successRate: 0.45 - i * 0.005, explosiveRate: 0.09 - i * 0.003, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
  }),
);

describe("isRowUsableForRidge", () => {
  it("rejects a row with any null feature input", () => {
    expect(isRowUsableForRidge(makeRow({ offense: { epaPerPlay: null, successRate: 0.4, explosiveRate: 0.1, sampleGames: 0, samplePlays: 0, window: "insufficient" } }))).toBe(false);
  });
  it("accepts a fully-populated row", () => {
    expect(isRowUsableForRidge(makeRow({}))).toBe(true);
  });
});

describe("fitTotalRidge / scoreTotalRidge", () => {
  it("fits deterministically -- identical train data produces identical coefficients", () => {
    const modelA = fitTotalRidge(TRAIN_ROWS, 1);
    const modelB = fitTotalRidge(TRAIN_ROWS, 1);
    expect(modelA.coefficients).toEqual(modelB.coefficients);
    expect(modelA.intercept).toBe(modelB.intercept);
  });

  it("standardizes using only the rows passed to fit -- excludes rows not in train from the mean/std computation", () => {
    const modelFromSubset = fitTotalRidge(TRAIN_ROWS.slice(0, 6), 1);
    const modelFromAll = fitTotalRidge(TRAIN_ROWS, 1);
    expect(modelFromSubset.featureMeans).not.toEqual(modelFromAll.featureMeans);
  });

  it("scores a row using the fitted model's own means/stds -- scoring an unusual validation row never mutates the model", () => {
    const model = fitTotalRidge(TRAIN_ROWS, 1);
    const meansBefore = [...model.featureMeans];
    const outlier = makeRow({ offense: { epaPerPlay: 10, successRate: 0.9, explosiveRate: 0.5, sampleGames: 4, samplePlays: 250, window: "seasonPrior" } });
    scoreTotalRidge(model, outlier);
    expect(model.featureMeans).toEqual(meansBefore);
  });

  it("returns null for a row missing required inputs instead of scoring a partial vector", () => {
    const model = fitTotalRidge(TRAIN_ROWS, 1);
    const incomplete = makeRow({ scoringEnvironment: { value: null, sampleGames: 0, mode: "priorSeasonOnly", method: "insufficient" } });
    expect(scoreTotalRidge(model, incomplete)).toBeNull();
  });

  it("produces a finite projected score for a normal row", () => {
    const model = fitTotalRidge(TRAIN_ROWS, 1);
    const projected = scoreTotalRidge(model, TRAIN_ROWS[0]);
    expect(projected).not.toBeNull();
    expect(Number.isFinite(projected)).toBe(true);
  });
});
