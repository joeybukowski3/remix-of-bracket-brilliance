import { describe, expect, it } from "vitest";
import { fitNflTotalModel, scoreNflTotalModel, type NflTotalTrainingRow } from "./totalsModel";
import { NFL_TOTAL_MODEL_VERSION, NFL_TOTAL_TRAINING_SEASONS, NFL_TOTAL_RIDGE_LAMBDA } from "./totalsModelContract";
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

describe("fitNflTotalModel", () => {
  it("carries the frozen contract constants", () => {
    const model = fitNflTotalModel(TRAIN_ROWS);
    expect(model.modelVersion).toBe(NFL_TOTAL_MODEL_VERSION);
    expect(model.trainingSeasons).toEqual(NFL_TOTAL_TRAINING_SEASONS);
    expect(model.lambda).toBe(NFL_TOTAL_RIDGE_LAMBDA);
  });

  it("is deterministic, including the fitted-model hash", () => {
    const a = fitNflTotalModel(TRAIN_ROWS);
    const b = fitNflTotalModel(TRAIN_ROWS);
    expect(a.ridge.coefficients).toEqual(b.ridge.coefficients);
    expect(a.fittedModelHash).toBe(b.fittedModelHash);
  });

  it("the hash changes when the training data changes", () => {
    const a = fitNflTotalModel(TRAIN_ROWS);
    const b = fitNflTotalModel(TRAIN_ROWS.slice(0, 8));
    expect(a.fittedModelHash).not.toBe(b.fittedModelHash);
  });

  it("throws on zero usable training rows", () => {
    expect(() => fitNflTotalModel([])).toThrow(/zero usable training rows/);
  });
});

describe("scoreNflTotalModel", () => {
  it("scores a normal row to a finite number", () => {
    const model = fitNflTotalModel(TRAIN_ROWS);
    const score = scoreNflTotalModel(model, makeFeatures());
    expect(score).not.toBeNull();
    expect(Number.isFinite(score)).toBe(true);
  });

  it("returns null (never fabricated) when a feature is unresolved", () => {
    const model = fitNflTotalModel(TRAIN_ROWS);
    const incomplete = makeFeatures({ offenseEpaPerPlay: null, historyStatus: "sparse-history" });
    expect(scoreNflTotalModel(model, incomplete)).toBeNull();
  });
});
