import { describe, expect, it } from "vitest";
import { fitBaseline0, fitBaseline1, scoreBaseline0, scoreBaseline1 } from "./baselines";
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

describe("Baseline 0 (scoring environment only)", () => {
  it("projects exactly the scoring-environment value, ignoring offense/defense", () => {
    const model = fitBaseline0();
    const row = makeRow({ scoringEnvironment: { value: 21.5, sampleGames: 100, mode: "priorSeasonOnly", method: "priorSeason" } });
    expect(scoreBaseline0(model, row)).toBeCloseTo(21.5, 6);
  });

  it("returns null when the environment itself is unresolved, never fabricating a value", () => {
    const model = fitBaseline0();
    const row = makeRow({ scoringEnvironment: { value: null, sampleGames: 0, mode: "priorSeasonOnly", method: "insufficient" } });
    expect(scoreBaseline0(model, row)).toBeNull();
  });
});

describe("Baseline 1 (transparent heuristic)", () => {
  const trainRows = [
    makeRow({ actualTeamPoints: 30, offense: { epaPerPlay: 0.2, successRate: 0.5, explosiveRate: 0.12, sampleGames: 5, samplePlays: 300, window: "seasonPrior" }, opponentDefenseAllowed: { epaPerPlay: -0.1, successRate: 0.38, explosiveRate: 0.07, sampleGames: 5, samplePlays: 300, window: "seasonPrior" } }),
    makeRow({ actualTeamPoints: 14, offense: { epaPerPlay: -0.1, successRate: 0.35, explosiveRate: 0.05, sampleGames: 5, samplePlays: 300, window: "seasonPrior" }, opponentDefenseAllowed: { epaPerPlay: 0.15, successRate: 0.5, explosiveRate: 0.1, sampleGames: 5, samplePlays: 300, window: "seasonPrior" } }),
    makeRow({ actualTeamPoints: 22, offense: { epaPerPlay: 0.05, successRate: 0.42, explosiveRate: 0.09, sampleGames: 5, samplePlays: 300, window: "seasonPrior" }, opponentDefenseAllowed: { epaPerPlay: 0, successRate: 0.42, explosiveRate: 0.08, sampleGames: 5, samplePlays: 300, window: "seasonPrior" } }),
  ];

  it("fits a single deterministic slope from train rows -- refitting on identical data reproduces the same model", () => {
    const modelA = fitBaseline1(trainRows);
    const modelB = fitBaseline1(trainRows);
    expect(modelA.slope).toBe(modelB.slope);
    expect(modelA.featureMeans).toEqual(modelB.featureMeans);
  });

  it("scores a row above the environment baseline when its offense/defense composite is stronger than train average", () => {
    const model = fitBaseline1(trainRows);
    const strongRow = makeRow({ offense: { epaPerPlay: 0.3, successRate: 0.55, explosiveRate: 0.15, sampleGames: 5, samplePlays: 300, window: "seasonPrior" }, opponentDefenseAllowed: { epaPerPlay: 0.2, successRate: 0.5, explosiveRate: 0.1, sampleGames: 5, samplePlays: 300, window: "seasonPrior" } });
    const projected = scoreBaseline1(model, strongRow)!;
    expect(projected).toBeGreaterThan(strongRow.scoringEnvironment.value!);
  });

  it("returns null when any required input is missing", () => {
    const model = fitBaseline1(trainRows);
    const incomplete = makeRow({ offense: { epaPerPlay: null, successRate: 0.4, explosiveRate: 0.1, sampleGames: 0, samplePlays: 0, window: "insufficient" } });
    expect(scoreBaseline1(model, incomplete)).toBeNull();
  });

  it("does not use validation-row statistics when scoring -- normalization is fixed at fit time from train rows only", () => {
    const model = fitBaseline1(trainRows);
    const meansBefore = { ...model.featureMeans };
    // Score an out-of-distribution row; the fitted means/stds must not change.
    scoreBaseline1(model, makeRow({ offense: { epaPerPlay: 5, successRate: 0.9, explosiveRate: 0.5, sampleGames: 5, samplePlays: 300, window: "seasonPrior" } }));
    expect(model.featureMeans).toEqual(meansBefore);
  });
});
