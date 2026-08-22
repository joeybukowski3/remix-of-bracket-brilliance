import { describe, expect, it } from "vitest";
import { fitPriorModel, predictPriorRatings, type PriorTrainingRow } from "./priorRegression";
import type { PreseasonRawInputs } from "./types";

function row(overrides: Partial<PriorTrainingRow>): PriorTrainingRow {
  return {
    teamExternalId: "1",
    prevOffense: 0.5,
    prevDefense: 0.3,
    returningProductionOffense: 0.6,
    talent: 500,
    targetOffense: 0.6,
    targetDefense: 0.4,
    ...overrides,
  };
}

function makeTrainingRows(n: number): PriorTrainingRow[] {
  return Array.from({ length: n }, (_, i) =>
    row({
      teamExternalId: String(i),
      prevOffense: (i % 10) - 5,
      prevDefense: (i % 7) - 3,
      returningProductionOffense: 0.4 + (i % 5) * 0.1,
      talent: 300 + i * 5,
      targetOffense: (i % 10) - 5 + 0.2,
      targetDefense: (i % 7) - 3 - 0.1,
    }),
  );
}

function input(overrides: Partial<PreseasonRawInputs>): PreseasonRawInputs {
  return {
    teamExternalId: "999",
    season: 2022,
    classification: "fbs",
    prevSeasonOffense: 0.5,
    prevSeasonDefense: 0.3,
    returningProductionOffense: 0.6,
    talent: 500,
    ...overrides,
  };
}

describe("fitPriorModel / predictPriorRatings", () => {
  const trainingRows = makeTrainingRows(40);

  it("requesting PRIOR_A never opportunistically upgrades to a richer tier, even when the team also has returning-production and talent data", () => {
    const model = fitPriorModel(trainingRows, "PRIOR_A", 2);
    const result = predictPriorRatings(model, input({})); // input has all fields present
    expect(result.offenseTier).toBe("PRIOR_A");
  });

  it("PRIOR_D uses the full feature set when every input is present", () => {
    const model = fitPriorModel(trainingRows, "PRIOR_D", 2);
    const result = predictPriorRatings(model, input({}));
    expect(result.offenseTier).toBe("PRIOR_D");
    expect(result.priorOffense).not.toBeNull();
    expect(Number.isNaN(result.priorOffense)).toBe(false);
  });

  it("falls back to PRIOR_C when returning production is missing (never imputed as 0)", () => {
    const model = fitPriorModel(trainingRows, "PRIOR_D", 2);
    const result = predictPriorRatings(model, input({ returningProductionOffense: null }));
    expect(result.offenseTier).toBe("PRIOR_C");
    expect(result.priorOffense).not.toBeNull();
  });

  it("falls back to PRIOR_A when only prevSeasonOffense is present", () => {
    const model = fitPriorModel(trainingRows, "PRIOR_D", 2);
    const result = predictPriorRatings(model, input({ returningProductionOffense: null, talent: null }));
    expect(result.offenseTier).toBe("PRIOR_A");
  });

  it("falls back to league mean for a transition team with no prior-year data at all", () => {
    const model = fitPriorModel(trainingRows, "PRIOR_D", 2);
    const result = predictPriorRatings(
      model,
      input({ prevSeasonOffense: null, prevSeasonDefense: null, returningProductionOffense: null, talent: null }),
    );
    expect(result.offenseTier).toBe("LEAGUE_MEAN");
    expect(result.defenseTier).toBe("LEAGUE_MEAN");
    expect(result.priorOffense).not.toBeNull();
  });

  it("defense has no returning-production signal, so Prior B's defense model is identical to Prior A's", () => {
    // DEFENSE_FEATURE_SETS.PRIOR_B === DEFENSE_FEATURE_SETS.PRIOR_A (both just prevDefense) —
    // fitting either "requested set" produces numerically identical defense coefficients.
    const modelB = fitPriorModel(trainingRows, "PRIOR_B", 2);
    const modelA = fitPriorModel(trainingRows, "PRIOR_A", 2);
    expect(modelB.defenseTiers.PRIOR_A?.coefficients).toEqual(modelA.defenseTiers.PRIOR_A?.coefficients);
  });

  it("shrinks harder toward league mean as lambda increases", () => {
    const low = fitPriorModel(trainingRows, "PRIOR_A", 0.1);
    const high = fitPriorModel(trainingRows, "PRIOR_A", 100);
    const outlierInput = input({ prevSeasonOffense: 20, prevSeasonDefense: 20 });
    const lowPred = predictPriorRatings(low, outlierInput);
    const highPred = predictPriorRatings(high, outlierInput);
    expect(Math.abs(highPred.priorOffense! - low.leagueMeanOffense)).toBeLessThan(
      Math.abs(lowPred.priorOffense! - low.leagueMeanOffense),
    );
  });

  it("returns null-safe model (no crash) when there are too few training rows for a tier", () => {
    const model = fitPriorModel([row({})], "PRIOR_D", 2);
    const result = predictPriorRatings(model, input({}));
    // Falls through to league mean since no tier could be fit with 1 row.
    expect(result.offenseTier).toBe("LEAGUE_MEAN");
  });
});
