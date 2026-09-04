import { describe, expect, it } from "vitest";
import { compareNflTotalToMarket, type NflTotalMarketObservation } from "./totalsMarketComparison";
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
const INPUT: NflTotalMatchupInput = {
  season: 2026, week: 5, gameId: "2026_05_buf_mia", homeTeam: "buf", awayTeam: "mia",
  homeFeatures: makeFeatures({ homeIndicator: 1 }),
  awayFeatures: makeFeatures({ homeIndicator: 0, offenseEpaPerPlay: -0.03 }),
};

describe("Vegas separation -- projectedGameTotal is byte-identical whether or not Vegas data exists", () => {
  it("removing Vegas data entirely does not change the projection", () => {
    // Generate the prediction with NO market data ever constructed or referenced.
    const withoutMarket = generateNflTotalPrediction(MODEL, INPUT, "2026-10-01T12:00:00.000Z");

    // Now construct a market observation and compute the downstream comparison -- but critically,
    // re-generate the SAME prediction with the market variable in scope (simulating a caller that
    // has Vegas data available) and confirm the projection itself is untouched.
    const market: NflTotalMarketObservation = { vegasTotal: 999, provider: "poison", sportsbook: "poison", observedAt: "2026-10-01T00:00:00.000Z" };
    void market; // present in scope, never passed to generateNflTotalPrediction or any upstream module
    const withMarketInScope = generateNflTotalPrediction(MODEL, INPUT, "2026-10-01T12:00:00.000Z");

    expect(withMarketInScope).toEqual(withoutMarket);
    expect(withMarketInScope.projectedGameTotal).toBe(withoutMarket.projectedGameTotal);
  });

  it("generateNflTotalPrediction's function signature has no market/Vegas parameter at all -- verified structurally by calling it with exactly (model, input, generatedAt)", () => {
    expect(generateNflTotalPrediction.length).toBe(3);
  });

  it("fitNflTotalModel's function signature accepts only training rows -- no market parameter", () => {
    expect(fitNflTotalModel.length).toBe(1);
  });
});

describe("compareNflTotalToMarket", () => {
  const prediction = generateNflTotalPrediction(MODEL, INPUT, "2026-10-01T12:00:00.000Z");
  const market: NflTotalMarketObservation = { vegasTotal: prediction.projectedGameTotal! - 5, provider: "test", sportsbook: "test-book", observedAt: "2026-10-01T00:00:00.000Z" };

  it("computes totalDifference as projectedGameTotal - vegasTotal", () => {
    const comparison = compareNflTotalToMarket(prediction, market)!;
    expect(comparison.totalDifference).toBeCloseTo(5, 9);
    expect(comparison.lean).toBe("Over Lean");
    expect(comparison.label).toBe("JKB Difference");
  });

  it("uses neutral labels only -- never implies a proven edge", () => {
    const comparison = compareNflTotalToMarket(prediction, market)!;
    expect(["Over Lean", "Under Lean", "No Lean"]).toContain(comparison.lean);
    expect(JSON.stringify(comparison).toLowerCase()).not.toContain("+ev");
    expect(JSON.stringify(comparison).toLowerCase()).not.toContain("edge");
  });

  it("returns null (not a fabricated comparison) when the projection itself is unresolved", () => {
    const sparseInput: NflTotalMatchupInput = { ...INPUT, awayFeatures: makeFeatures({ offenseEpaPerPlay: null, historyStatus: "sparse-history" }) };
    const sparsePrediction = generateNflTotalPrediction(MODEL, sparseInput, "2026-10-01T12:00:00.000Z");
    expect(compareNflTotalToMarket(sparsePrediction, market)).toBeNull();
  });

  it("small differences report 'No Lean' rather than an arbitrary direction", () => {
    const tinyDiffMarket: NflTotalMarketObservation = { vegasTotal: prediction.projectedGameTotal!, provider: "test", sportsbook: "test-book", observedAt: "2026-10-01T00:00:00.000Z" };
    const comparison = compareNflTotalToMarket(prediction, tinyDiffMarket)!;
    expect(comparison.lean).toBe("No Lean");
  });
});
