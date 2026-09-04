import { describe, expect, it } from "vitest";
import { fitBoundedEnvironmentRidge, scoreBoundedEnvironmentRidge } from "./boundedEnvironmentRidge";
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

// Constructed so scoringEnvironment is NEGATIVELY correlated with points -- an unconstrained ridge should
// find a negative env coefficient here (mirroring the real Phase M finding), which the [0, 1.5] bound must clip.
const NEGATIVE_ENV_ROWS: NflTotalResearchDatasetRow[] = Array.from({ length: 14 }, (_, i) =>
  makeRow({
    actualTeamPoints: 30 - i, // decreasing points
    scoringEnvironment: { value: 18 + i, sampleGames: 100, mode: "priorSeasonOnly", method: "priorSeason" }, // increasing environment
    offense: { epaPerPlay: 0.05, successRate: 0.42, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    opponentDefenseAllowed: { epaPerPlay: 0, successRate: 0.4, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
  }),
);

describe("fitBoundedEnvironmentRidge", () => {
  it("clips a negative unconstrained environment coefficient to the lower bound and refits the rest", () => {
    const result = fitBoundedEnvironmentRidge(NEGATIVE_ENV_ROWS, 1, 0, 1.5);
    expect(result.unconstrainedEnvCoefficient).toBeLessThan(0);
    expect(result.boundHit).toBe("lower");
    expect(result.model.coefficients[0]).toBeCloseTo(0, 9); // env coefficient forced to exactly the lower bound
  });

  it("leaves an already-in-bounds environment coefficient untouched (matches an ordinary unconstrained fit)", () => {
    // Moderate env/points correlation, with an independent varying feature absorbing some of the signal --
    // keeps the unconstrained env coefficient inside [0, 1.5] rather than saturating far past it.
    const wellBehavedRows = Array.from({ length: 12 }, (_, i) =>
      makeRow({
        actualTeamPoints: 18 + (i % 4) + (i % 3 === 0 ? 3 : 0),
        scoringEnvironment: { value: 20 + (i % 4) * 0.5, sampleGames: 100, mode: "priorSeasonOnly", method: "priorSeason" },
        offense: { epaPerPlay: -0.1 + (i % 3) * 0.05, successRate: 0.4, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
      }),
    );
    const result = fitBoundedEnvironmentRidge(wellBehavedRows, 1, 0, 1.5);
    expect(result.boundHit).toBe("none");
    expect(result.unconstrainedEnvCoefficient).toBeGreaterThanOrEqual(0);
    expect(result.unconstrainedEnvCoefficient).toBeLessThanOrEqual(1.5);
    expect(result.model.coefficients[0]).toBeCloseTo(result.unconstrainedEnvCoefficient, 9);
  });

  it("is deterministic", () => {
    const a = fitBoundedEnvironmentRidge(NEGATIVE_ENV_ROWS, 1, 0, 1.5);
    const b = fitBoundedEnvironmentRidge(NEGATIVE_ENV_ROWS, 1, 0, 1.5);
    expect(a.model.coefficients).toEqual(b.model.coefficients);
    expect(a.model.intercept).toBe(b.model.intercept);
  });

  it("throws on zero usable rows", () => {
    expect(() => fitBoundedEnvironmentRidge([], 1, 0, 1.5)).toThrow(/zero usable training rows/);
  });
});

describe("scoreBoundedEnvironmentRidge", () => {
  it("scores a normal row to a finite number", () => {
    const result = fitBoundedEnvironmentRidge(NEGATIVE_ENV_ROWS, 1, 0, 1.5);
    const score = scoreBoundedEnvironmentRidge(result, NEGATIVE_ENV_ROWS[0]);
    expect(score).not.toBeNull();
    expect(Number.isFinite(score)).toBe(true);
  });

  it("returns null for a row missing a required feature", () => {
    const result = fitBoundedEnvironmentRidge(NEGATIVE_ENV_ROWS, 1, 0, 1.5);
    const incomplete = makeRow({ scoringEnvironment: { value: null, sampleGames: 0, mode: "priorSeasonOnly", method: "insufficient" } });
    expect(scoreBoundedEnvironmentRidge(result, incomplete)).toBeNull();
  });
});
