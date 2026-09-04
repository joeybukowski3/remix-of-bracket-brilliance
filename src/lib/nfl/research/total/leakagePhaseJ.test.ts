/**
 * Phase J leakage tests -- extends leakage.test.ts's "poisoned future game"
 * style specifically to (a) the seasonToDateWithPriorFallback environment
 * variant (Model B/C/D) end-to-end through the dataset pipeline, and (b)
 * the Model C cross-fit bias-calibration procedure, proving the
 * calibration constant is unaffected by a poisoned VALIDATION-fold game
 * that is never passed into the calibration function.
 */
import { describe, expect, it } from "vitest";
import { buildResearchDataset } from "./dataset";
import { buildScoringSupportIndex } from "./teamScoringFeatures";
import { fitCalibratedTotalRidge } from "./biasCalibration";
import type { NflTotalResearchGameOutcome, NflTotalResearchScoringSupportRow } from "./types";

const TRAIN_GAMES: NflTotalResearchGameOutcome[] = [
  { gameId: "2022_01_buf_mia", season: 2022, week: 1, seasonType: "REG", homeAbbr: "mia", awayAbbr: "buf", homeScore: 17, awayScore: 20, totalPoints: 37 },
  { gameId: "2022_02_nyj_nwe", season: 2022, week: 2, seasonType: "REG", homeAbbr: "nwe", awayAbbr: "nyj", homeScore: 13, awayScore: 16, totalPoints: 29 },
  { gameId: "2022_05_mia_nyj", season: 2022, week: 5, seasonType: "REG", homeAbbr: "nyj", awayAbbr: "mia", homeScore: 16, awayScore: 19, totalPoints: 35 },
  { gameId: "2022_06_buf_nwe", season: 2022, week: 6, seasonType: "REG", homeAbbr: "nwe", awayAbbr: "buf", homeScore: 18, awayScore: 24, totalPoints: 42 },
  { gameId: "2022_10_buf_nyj", season: 2022, week: 10, seasonType: "REG", homeAbbr: "nyj", awayAbbr: "buf", homeScore: 14, awayScore: 23, totalPoints: 37 },
];
// A "future" validation-fold game with an extreme, unmistakable outcome -- never passed to the calibration function.
const POISONED_VALIDATION_GAME: NflTotalResearchGameOutcome = {
  gameId: "2023_05_buf_mia", season: 2023, week: 5, seasonType: "REG", homeAbbr: "buf", awayAbbr: "mia", homeScore: 100, awayScore: 100, totalPoints: 200,
};

const SUPPORT: NflTotalResearchScoringSupportRow[] = [
  { gameId: "2022_01_buf_mia", season: 2022, week: 1, team: "buf", opponent: "mia", eligiblePlays: 60, offEpaSum: 3, successNum: 25, successDen: 60, explosiveCount: 5 },
  { gameId: "2022_01_buf_mia", season: 2022, week: 1, team: "mia", opponent: "buf", eligiblePlays: 58, offEpaSum: -1, successNum: 22, successDen: 58, explosiveCount: 4 },
  { gameId: "2022_02_nyj_nwe", season: 2022, week: 2, team: "nyj", opponent: "nwe", eligiblePlays: 60, offEpaSum: 2, successNum: 23, successDen: 60, explosiveCount: 4 },
  { gameId: "2022_02_nyj_nwe", season: 2022, week: 2, team: "nwe", opponent: "nyj", eligiblePlays: 56, offEpaSum: -1, successNum: 20, successDen: 56, explosiveCount: 3 },
  { gameId: "2022_05_mia_nyj", season: 2022, week: 5, team: "mia", opponent: "nyj", eligiblePlays: 59, offEpaSum: 1, successNum: 24, successDen: 59, explosiveCount: 4 },
  { gameId: "2022_05_mia_nyj", season: 2022, week: 5, team: "nyj", opponent: "mia", eligiblePlays: 57, offEpaSum: -2, successNum: 21, successDen: 57, explosiveCount: 3 },
  { gameId: "2022_06_buf_nwe", season: 2022, week: 6, team: "buf", opponent: "nwe", eligiblePlays: 61, offEpaSum: 4, successNum: 27, successDen: 61, explosiveCount: 5 },
  { gameId: "2022_06_buf_nwe", season: 2022, week: 6, team: "nwe", opponent: "buf", eligiblePlays: 58, offEpaSum: -2, successNum: 22, successDen: 58, explosiveCount: 3 },
  { gameId: "2022_10_buf_nyj", season: 2022, week: 10, team: "buf", opponent: "nyj", eligiblePlays: 62, offEpaSum: 5, successNum: 28, successDen: 62, explosiveCount: 6 },
  { gameId: "2022_10_buf_nyj", season: 2022, week: 10, team: "nyj", opponent: "buf", eligiblePlays: 55, offEpaSum: -3, successNum: 20, successDen: 55, explosiveCount: 3 },
];

describe("Model B environment (seasonToDateWithPriorFallback) full-pipeline target-game exclusion", () => {
  it("a Week 1 target row's environment never includes that same week's own poisoned outcome", () => {
    const dataset = buildResearchDataset({
      targetGames: [POISONED_VALIDATION_GAME],
      environmentCorpusGames: [...TRAIN_GAMES, POISONED_VALIDATION_GAME],
      scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    for (const row of dataset) {
      expect(row.scoringEnvironment.value).not.toBeNull();
      expect(row.scoringEnvironment.value!).toBeLessThan(50); // real prior games average ~18-20; 100 would be unmistakable
      expect(row.scoringEnvironment.method).not.toBe("seasonToDate"); // 2023 has no completed prior games this season in this fixture -> must fall back
    }
  });
});

describe("Model C (fitCalibratedTotalRidge) never sees the validation fold", () => {
  it("the calibration constant fit on TRAIN_GAMES only is identical whether or not a poisoned validation game exists elsewhere in scope", () => {
    const trainOnlyDataset = buildResearchDataset({
      targetGames: TRAIN_GAMES,
      environmentCorpusGames: TRAIN_GAMES,
      scoringSupportIndex: buildScoringSupportIndex(SUPPORT),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    // Build a second, textually-identical train dataset, but this time compute it in a scope where a
    // poisoned validation game and its scoring-support rows also exist -- fitCalibratedTotalRidge must
    // still receive ONLY the train rows and must be unaffected by the poisoned game's mere existence.
    const fullDatasetIncludingPoisonedGame = buildResearchDataset({
      targetGames: [...TRAIN_GAMES, POISONED_VALIDATION_GAME],
      environmentCorpusGames: [...TRAIN_GAMES, POISONED_VALIDATION_GAME],
      scoringSupportIndex: buildScoringSupportIndex([
        ...SUPPORT,
        { gameId: "2023_05_buf_mia", season: 2023, week: 5, team: "buf", opponent: "mia", eligiblePlays: 9999, offEpaSum: 9999, successNum: 9999, successDen: 9999, explosiveCount: 9999 },
        { gameId: "2023_05_buf_mia", season: 2023, week: 5, team: "mia", opponent: "buf", eligiblePlays: 9999, offEpaSum: 9999, successNum: 9999, successDen: 9999, explosiveCount: 9999 },
      ]),
      environmentMode: "seasonToDateWithPriorFallback",
    });
    const trainRowsFromFullDataset = fullDatasetIncludingPoisonedGame.filter((r) => r.gameId !== POISONED_VALIDATION_GAME.gameId);

    // k=3 matches the 3 training games exactly (1 held-out game per partition, 2 complement games each) --
    // the smallest k that avoids a degenerate (empty-complement or empty-heldout) partition in this fixture.
    const k = 3;
    const modelFromTrainOnly = fitCalibratedTotalRidge(trainOnlyDataset, 1, k);
    const modelFromFullScope = fitCalibratedTotalRidge(trainRowsFromFullDataset, 1, k);
    expect(modelFromFullScope.biasCorrection).toBe(modelFromTrainOnly.biasCorrection);
    expect(modelFromFullScope.ridge.coefficients).toEqual(modelFromTrainOnly.ridge.coefficients);
  });
});
