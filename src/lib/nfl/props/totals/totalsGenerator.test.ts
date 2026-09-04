import { describe, expect, it } from "vitest";
import { generateNflTotalPrediction, type NflTotalMatchupInput } from "./totalsGenerator";
import { fitNflTotalModel, type NflTotalTrainingRow } from "./totalsModel";
import type { NflTotalSideFeatures } from "./totalsFeatures";

function makeFeatures(overrides: Partial<NflTotalSideFeatures> = {}): NflTotalSideFeatures {
  return {
    offenseEpaPerPlay: 0.05, offenseSuccessRate: 0.45, opponentDefenseEpaAllowed: -0.02, opponentDefenseSuccessAllowed: 0.42,
    homeIndicator: 1, offenseGamesUsed: 5, offenseEffectiveSampleSize: 5, defenseGamesUsed: 5, defenseEffectiveSampleSize: 5,
    historyStatus: "normal",
    ...overrides,
  };
}
const TRAIN_ROWS: NflTotalTrainingRow[] = Array.from({ length: 12 }, (_, i) => ({
  actualTeamPoints: 17 + (i % 5) * 3,
  features: makeFeatures({ offenseEpaPerPlay: -0.1 + i * 0.02, offenseSuccessRate: 0.35 + i * 0.01, opponentDefenseEpaAllowed: 0.1 - i * 0.015, opponentDefenseSuccessAllowed: 0.45 - i * 0.005, homeIndicator: i % 2 === 0 ? 1 : 0 }),
}));
const MODEL = fitNflTotalModel(TRAIN_ROWS);

describe("generateNflTotalPrediction", () => {
  const input: NflTotalMatchupInput = {
    season: 2026, week: 5, gameId: "2026_05_buf_mia", homeTeam: "buf", awayTeam: "mia",
    homeFeatures: makeFeatures({ homeIndicator: 1 }),
    awayFeatures: makeFeatures({ homeIndicator: 0, offenseEpaPerPlay: -0.03 }),
  };

  it("projectedGameTotal is the exact unrounded sum of homeExpectedPoints + awayExpectedPoints", () => {
    const prediction = generateNflTotalPrediction(MODEL, input, "2026-10-01T12:00:00.000Z");
    expect(prediction.homeExpectedPoints).not.toBeNull();
    expect(prediction.awayExpectedPoints).not.toBeNull();
    expect(prediction.projectedGameTotal).toBe(prediction.homeExpectedPoints! + prediction.awayExpectedPoints!);
  });

  it("status is 'projected' when both sides resolve, 'eligible_insufficient_history' when either does not", () => {
    const full = generateNflTotalPrediction(MODEL, input, "2026-10-01T12:00:00.000Z");
    expect(full.status).toBe("projected");

    const sparseInput: NflTotalMatchupInput = { ...input, awayFeatures: makeFeatures({ offenseEpaPerPlay: null, historyStatus: "sparse-history" }) };
    const sparse = generateNflTotalPrediction(MODEL, sparseInput, "2026-10-01T12:00:00.000Z");
    expect(sparse.status).toBe("eligible_insufficient_history");
    expect(sparse.projectedGameTotal).toBeNull();
    expect(sparse.homeExpectedPoints).not.toBeNull(); // home side still resolves independently
  });

  it("carries the training cutoff and per-side history metadata through to the output", () => {
    const prediction = generateNflTotalPrediction(MODEL, input, "2026-10-01T12:00:00.000Z");
    expect(prediction.trainingCutoff.seasons).toEqual([2022, 2023, 2024]);
    expect(prediction.homeHistoryGames.offense).toBe(5);
    expect(prediction.homeHistoryStatus).toBe("normal");
  });

  it("is deterministic", () => {
    const a = generateNflTotalPrediction(MODEL, input, "2026-10-01T12:00:00.000Z");
    const b = generateNflTotalPrediction(MODEL, input, "2026-10-01T12:00:00.000Z");
    expect(a).toEqual(b);
  });
});
