import { describe, expect, it } from "vitest";
import { fitReducedTotalRidge, isRowUsableForReducedRidge, scoreReducedTotalRidge } from "./ridgeModelReduced";
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

describe("isRowUsableForReducedRidge", () => {
  it("does NOT require explosiveRate to be usable, unlike the full ridge", () => {
    const row = makeRow({ offense: { epaPerPlay: 0.1, successRate: 0.4, explosiveRate: null, sampleGames: 4, samplePlays: 250, window: "seasonPrior" } });
    expect(isRowUsableForReducedRidge(row)).toBe(true);
  });
  it("still requires EPA/success and environment/home", () => {
    const row = makeRow({ offense: { epaPerPlay: null, successRate: 0.4, explosiveRate: 0.1, sampleGames: 0, samplePlays: 0, window: "insufficient" } });
    expect(isRowUsableForReducedRidge(row)).toBe(false);
  });
});

describe("fitReducedTotalRidge / scoreReducedTotalRidge", () => {
  it("fits deterministically with 6 coefficients", () => {
    const modelA = fitReducedTotalRidge(TRAIN_ROWS, 1);
    const modelB = fitReducedTotalRidge(TRAIN_ROWS, 1);
    expect(modelA.coefficients).toHaveLength(6);
    expect(modelA.coefficients).toEqual(modelB.coefficients);
  });

  it("scores a row and returns null when a required (non-explosive) input is missing", () => {
    const model = fitReducedTotalRidge(TRAIN_ROWS, 1);
    expect(scoreReducedTotalRidge(model, TRAIN_ROWS[0])).not.toBeNull();
    const incomplete = makeRow({ scoringEnvironment: { value: null, sampleGames: 0, mode: "priorSeasonOnly", method: "insufficient" } });
    expect(scoreReducedTotalRidge(model, incomplete)).toBeNull();
  });
});
