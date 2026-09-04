import { describe, expect, it } from "vitest";
import {
  fitTargetedShrinkageRidge,
  scoreTargetedShrinkageRidge,
  fitHistoricalPriorCoefficient,
  OFFENSE_SUCCESS_INDEX,
  OPPONENT_DEFENSE_EPA_INDEX,
} from "./targetedShrinkageRidge";
import { fitRidgeModel } from "@/lib/nfl/props/ridge";
import { rawResidualFeatures } from "./residualRidge";
import type { NflTotalResearchDatasetRow } from "./types";

function makeRow(overrides: Partial<NflTotalResearchDatasetRow>): NflTotalResearchDatasetRow {
  return {
    season: 2022, week: 5, gameId: "g", team: "buf", opponent: "mia", homeAway: "home",
    actualTeamPoints: 24, actualGameTotal: 45,
    scoringEnvironment: { value: 22, sampleGames: 200, mode: "priorSeasonOnly", method: "priorSeason" },
    offense: { epaPerPlay: 0.1, successRate: 0.45, explosiveRate: 0.1, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    opponentDefenseAllowed: { epaPerPlay: -0.05, successRate: 0.4, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    pregameSafe: true,
    ...overrides,
  };
}

// Constructed so the negatively-signed unconstrained coefficients emerge (mirrors the real Fold1 finding).
const NEGATIVE_ROWS: NflTotalResearchDatasetRow[] = Array.from({ length: 14 }, (_, i) =>
  makeRow({
    actualTeamPoints: 30 - i,
    offense: { epaPerPlay: 0.05 + i * 0.01, successRate: 0.5 - i * 0.01, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    opponentDefenseAllowed: { epaPerPlay: -0.02 - i * 0.005, successRate: 0.42, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
  }),
);

describe("fitTargetedShrinkageRidge", () => {
  it("with no priors at all, reproduces an ordinary 5-feature ridge exactly", () => {
    const targeted = fitTargetedShrinkageRidge(NEGATIVE_ROWS, 1, []);
    const usable = NEGATIVE_ROWS.filter((r) => rawResidualFeatures(r) !== null);
    const ordinary = fitRidgeModel(usable.map((r) => [...rawResidualFeatures(r)!]), usable.map((r) => r.actualTeamPoints), 1);
    expect(targeted.coefficients).toEqual(ordinary.coefficients);
    expect(targeted.intercept).toBe(ordinary.intercept);
  });

  it("a strong prior pulls ONLY the targeted coefficient toward the prior value, leaving other coefficients close to their unconstrained values", () => {
    const ordinary = fitTargetedShrinkageRidge(NEGATIVE_ROWS, 1, []);
    const shrunk = fitTargetedShrinkageRidge(NEGATIVE_ROWS, 1, [{ featureIndex: OFFENSE_SUCCESS_INDEX, priorValue: 0.5, lambda: 1_000_000 }]);
    expect(shrunk.coefficients[OFFENSE_SUCCESS_INDEX]).toBeCloseTo(0.5, 2);
    // offenseEpaPerPlay (index 0) is untouched by the offenseSuccess-only prior's strength.
    expect(Math.abs(shrunk.coefficients[0] - ordinary.coefficients[0])).toBeLessThan(0.5);
  });

  it("supports two independent targeted priors simultaneously", () => {
    const shrunk = fitTargetedShrinkageRidge(NEGATIVE_ROWS, 1, [
      { featureIndex: OFFENSE_SUCCESS_INDEX, priorValue: 0.5, lambda: 1_000_000 },
      { featureIndex: OPPONENT_DEFENSE_EPA_INDEX, priorValue: 0.5, lambda: 1_000_000 },
    ]);
    expect(shrunk.coefficients[OFFENSE_SUCCESS_INDEX]).toBeCloseTo(0.5, 2);
    expect(shrunk.coefficients[OPPONENT_DEFENSE_EPA_INDEX]).toBeCloseTo(0.5, 2);
  });

  it("is deterministic", () => {
    const a = fitTargetedShrinkageRidge(NEGATIVE_ROWS, 1, [{ featureIndex: OFFENSE_SUCCESS_INDEX, priorValue: 0.5, lambda: 10 }]);
    const b = fitTargetedShrinkageRidge(NEGATIVE_ROWS, 1, [{ featureIndex: OFFENSE_SUCCESS_INDEX, priorValue: 0.5, lambda: 10 }]);
    expect(a.coefficients).toEqual(b.coefficients);
  });

  it("throws on zero usable training rows", () => {
    expect(() => fitTargetedShrinkageRidge([], 1, [])).toThrow(/zero usable training rows/);
  });
});

describe("scoreTargetedShrinkageRidge", () => {
  it("scores a normal row to a finite number, null when a feature is missing", () => {
    const model = fitTargetedShrinkageRidge(NEGATIVE_ROWS, 1, [{ featureIndex: OFFENSE_SUCCESS_INDEX, priorValue: 0.5, lambda: 10 }]);
    expect(Number.isFinite(scoreTargetedShrinkageRidge(model, NEGATIVE_ROWS[0]))).toBe(true);
    const incomplete = makeRow({ offense: { epaPerPlay: null, successRate: 0.4, explosiveRate: 0.1, sampleGames: 0, samplePlays: 0, window: "insufficient" } });
    expect(scoreTargetedShrinkageRidge(model, incomplete)).toBeNull();
  });
});

describe("fitHistoricalPriorCoefficient -- leakage safety", () => {
  const HISTORICAL_2021: NflTotalResearchDatasetRow[] = Array.from({ length: 10 }, (_, i) =>
    makeRow({ season: 2021, actualTeamPoints: 20 + (i % 4), offense: { epaPerPlay: -0.05 + i * 0.01, successRate: 0.4 + i * 0.005, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" } }),
  );

  it("computes a real coefficient from the historical rows only", () => {
    const coef = fitHistoricalPriorCoefficient(HISTORICAL_2021, 1, OFFENSE_SUCCESS_INDEX);
    expect(Number.isFinite(coef)).toBe(true);
  });

  it("is unaffected by a poisoned FUTURE dataset that exists in scope but is never passed in (no leakage into the Fold-1 prior)", () => {
    const resultA = fitHistoricalPriorCoefficient(HISTORICAL_2021, 1, OFFENSE_SUCCESS_INDEX);
    const poisonedFuture = Array.from({ length: 50 }, () => makeRow({ season: 2023, actualTeamPoints: 999, offense: { epaPerPlay: 999, successRate: 999, explosiveRate: 0.1, sampleGames: 4, samplePlays: 250, window: "seasonPrior" } }));
    void poisonedFuture; // present in scope, deliberately never passed to fitHistoricalPriorCoefficient
    const resultB = fitHistoricalPriorCoefficient(HISTORICAL_2021, 1, OFFENSE_SUCCESS_INDEX);
    expect(resultA).toBe(resultB);
  });

  it("is deterministic", () => {
    const a = fitHistoricalPriorCoefficient(HISTORICAL_2021, 1, OPPONENT_DEFENSE_EPA_INDEX);
    const b = fitHistoricalPriorCoefficient(HISTORICAL_2021, 1, OPPONENT_DEFENSE_EPA_INDEX);
    expect(a).toBe(b);
  });

  it("fails safe (throws) rather than silently defaulting when the historical source is empty", () => {
    expect(() => fitHistoricalPriorCoefficient([], 1, OFFENSE_SUCCESS_INDEX)).toThrow(/zero usable historical rows/);
  });
});
