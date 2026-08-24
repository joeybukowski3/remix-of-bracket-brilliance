import { describe, expect, it } from "vitest";
import { evaluatePredictions } from "./evaluation";
import type { WalkForwardPrediction } from "./types";

function prediction(overrides: Partial<WalkForwardPrediction>): WalkForwardPrediction {
  return {
    season: 2019,
    week: 1,
    gameId: "g1",
    homeTeamExternalId: "A",
    awayTeamExternalId: "B",
    ratingDifferential: 1,
    predictedMargin: 3,
    actualMargin: 3,
    ...overrides,
  };
}

describe("evaluatePredictions", () => {
  it("MAE/RMSE are zero for perfect predictions", () => {
    const summary = evaluatePredictions([
      prediction({ predictedMargin: 7, actualMargin: 7 }),
      prediction({ predictedMargin: -3, actualMargin: -3 }),
    ]);
    expect(summary.mae).toBe(0);
    expect(summary.rmse).toBe(0);
  });

  it("computes MAE as the mean absolute error", () => {
    const summary = evaluatePredictions([
      prediction({ predictedMargin: 10, actualMargin: 7 }), // error 3
      prediction({ predictedMargin: -1, actualMargin: 2 }), // error 3
    ]);
    expect(summary.mae).toBeCloseTo(3, 5);
  });

  it("directional accuracy counts sign agreement between predicted and actual margin", () => {
    const summary = evaluatePredictions([
      prediction({ predictedMargin: 5, actualMargin: 10 }), // agree (both positive)
      prediction({ predictedMargin: -2, actualMargin: 3 }), // disagree
    ]);
    expect(summary.directionalAccuracy).toBeCloseTo(0.5, 5);
  });

  it("excludes rows with a null prediction or actual from the summary", () => {
    const summary = evaluatePredictions([
      prediction({ predictedMargin: null }),
      prediction({ actualMargin: null }),
      prediction({ predictedMargin: 4, actualMargin: 4 }),
    ]);
    expect(summary.n).toBe(1);
  });

  it("returns nulls (not NaN/throw) for an empty prediction set", () => {
    const summary = evaluatePredictions([]);
    expect(summary.n).toBe(0);
    expect(summary.mae).toBeNull();
    expect(Number.isNaN(summary.mae)).toBe(false);
  });
});
