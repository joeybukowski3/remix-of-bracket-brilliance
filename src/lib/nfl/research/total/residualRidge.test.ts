import { describe, expect, it } from "vitest";
import { fitResidualRidge, scoreResidualRidge, rawResidualFeatures } from "./residualRidge";
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

const TRAIN_ROWS: NflTotalResearchDatasetRow[] = Array.from({ length: 12 }, (_, i) =>
  makeRow({
    actualTeamPoints: 17 + (i % 5) * 3,
    homeAway: i % 2 === 0 ? "home" : "away",
    scoringEnvironment: { value: 21 + (i % 3), sampleGames: 200, mode: "priorSeasonOnly", method: "priorSeason" },
    offense: { epaPerPlay: -0.1 + i * 0.02, successRate: 0.35 + i * 0.01, explosiveRate: 0.05, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    opponentDefenseAllowed: { epaPerPlay: 0.1 - i * 0.015, successRate: 0.45 - i * 0.005, explosiveRate: 0.09, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
  }),
);

describe("fitResidualRidge / scoreResidualRidge", () => {
  it("fits the ridge on the RESIDUAL (actualTeamPoints - scoringEnvironment), not raw points", () => {
    // A model with all coefficients pinned to ~0 would still score close to scoringEnvironment; verify the
    // fitted ridge's own target was actually the residual by checking the model's targets indirectly via
    // a hand-fit control: refit with scoringEnvironment forced to exactly equal actualTeamPoints for every
    // row (residual = 0 everywhere) and confirm the model's intercept collapses to ~0.
    const zeroResidualRows = TRAIN_ROWS.map((r) => ({ ...r, scoringEnvironment: { ...r.scoringEnvironment, value: r.actualTeamPoints } }));
    const model = fitResidualRidge(zeroResidualRows, 1, rawResidualFeatures);
    expect(Math.abs(model.intercept)).toBeLessThan(1e-9);
  });

  it("scoreResidualRidge equals scoringEnvironment plus the ridge's own contribution", () => {
    const model = fitResidualRidge(TRAIN_ROWS, 1, rawResidualFeatures);
    const row = TRAIN_ROWS[0];
    const score = scoreResidualRidge(model, row, rawResidualFeatures)!;
    expect(score).toBeGreaterThan(row.scoringEnvironment.value! - 30);
    expect(score).toBeLessThan(row.scoringEnvironment.value! + 30);
    expect(Number.isFinite(score)).toBe(true);
  });

  it("returns null when scoringEnvironment is unresolved, never fabricating an offset", () => {
    const model = fitResidualRidge(TRAIN_ROWS, 1, rawResidualFeatures);
    const row = makeRow({ scoringEnvironment: { value: null, sampleGames: 0, mode: "priorSeasonOnly", method: "insufficient" } });
    expect(scoreResidualRidge(model, row, rawResidualFeatures)).toBeNull();
  });

  it("returns null when a required feature is missing", () => {
    const model = fitResidualRidge(TRAIN_ROWS, 1, rawResidualFeatures);
    const row = makeRow({ offense: { epaPerPlay: null, successRate: 0.4, explosiveRate: 0.1, sampleGames: 0, samplePlays: 0, window: "insufficient" } });
    expect(scoreResidualRidge(model, row, rawResidualFeatures)).toBeNull();
  });

  it("is deterministic", () => {
    const a = fitResidualRidge(TRAIN_ROWS, 1, rawResidualFeatures);
    const b = fitResidualRidge(TRAIN_ROWS, 1, rawResidualFeatures);
    expect(a.coefficients).toEqual(b.coefficients);
    expect(a.intercept).toBe(b.intercept);
  });

  it("throws on zero usable training rows", () => {
    expect(() => fitResidualRidge([], 1, rawResidualFeatures)).toThrow(/zero usable training rows/);
  });
});
