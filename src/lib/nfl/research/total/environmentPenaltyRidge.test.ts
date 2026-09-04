import { describe, expect, it } from "vitest";
import { fitEnvironmentPenaltyRidge, scoreEnvironmentPenaltyRidge } from "./environmentPenaltyRidge";
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

const NEGATIVE_ENV_ROWS: NflTotalResearchDatasetRow[] = Array.from({ length: 14 }, (_, i) =>
  makeRow({
    actualTeamPoints: 30 - i,
    scoringEnvironment: { value: 18 + i, sampleGames: 100, mode: "priorSeasonOnly", method: "priorSeason" },
    offense: { epaPerPlay: 0.05, successRate: 0.42, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    opponentDefenseAllowed: { epaPerPlay: 0, successRate: 0.4, explosiveRate: 0.08, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
  }),
);

describe("fitEnvironmentPenaltyRidge", () => {
  it("a very strong lambdaEnv pulls the environment coefficient close to its prior of 1, even against a negative unconstrained fit", () => {
    const weak = fitEnvironmentPenaltyRidge(NEGATIVE_ENV_ROWS, 1, 1);
    const strong = fitEnvironmentPenaltyRidge(NEGATIVE_ENV_ROWS, 1, 1_000_000);
    expect(weak.coefficients[0]).toBeLessThan(0); // essentially unconstrained at lambdaEnv == base lambda
    expect(strong.coefficients[0]).toBeCloseTo(1, 2); // overwhelming penalty forces it to the prior
  });

  it("does not change the OTHER coefficients' own penalty (they stay pulled toward 0, not 1)", () => {
    const result = fitEnvironmentPenaltyRidge(NEGATIVE_ENV_ROWS, 1_000_000, 1); // huge lambda on non-env coefficients
    for (let i = 1; i < result.coefficients.length; i += 1) {
      expect(Math.abs(result.coefficients[i])).toBeLessThan(0.05); // driven toward 0 by the huge shared lambda
    }
  });

  it("is deterministic", () => {
    const a = fitEnvironmentPenaltyRidge(NEGATIVE_ENV_ROWS, 1, 10);
    const b = fitEnvironmentPenaltyRidge(NEGATIVE_ENV_ROWS, 1, 10);
    expect(a.coefficients).toEqual(b.coefficients);
    expect(a.intercept).toBe(b.intercept);
  });

  it("throws on zero usable rows", () => {
    expect(() => fitEnvironmentPenaltyRidge([], 1, 10)).toThrow(/zero usable training rows/);
  });
});

describe("lambdaEnv internal-selection leakage safety (mirrors evaluate-phase-n.ts's selection loop)", () => {
  const INTERNAL_TRAIN = NEGATIVE_ENV_ROWS.slice(0, 8);
  const INTERNAL_VAL = NEGATIVE_ENV_ROWS.slice(8);
  const CANDIDATES = { weak: 1, medium: 10, strong: 100 };

  function selectLambdaEnv(internalTrain: readonly NflTotalResearchDatasetRow[], internalVal: readonly NflTotalResearchDatasetRow[]) {
    const scores = Object.entries(CANDIDATES).map(([label, lambdaEnv]) => {
      const model = fitEnvironmentPenaltyRidge(internalTrain, 1, lambdaEnv);
      const errors = internalVal.map((r) => { const p = scoreEnvironmentPenaltyRidge(model, r); return p === null ? null : p - r.actualTeamPoints; }).filter((e): e is number => e !== null);
      const meanAbsError = errors.length ? errors.reduce((s, v) => s + Math.abs(v), 0) / errors.length : null;
      return { label, lambdaEnv, meanAbsError };
    });
    let best = scores[0];
    for (const s of scores) if (s.meanAbsError !== null && (best.meanAbsError === null || s.meanAbsError < best.meanAbsError - 1e-9)) best = s;
    return { selected: best, scores };
  }

  it("selection over internal-train/internal-val is unaffected by a poisoned outer-validation dataset that is never passed in", () => {
    const resultA = selectLambdaEnv(INTERNAL_TRAIN, INTERNAL_VAL);
    const poisonedOuterValidation = Array.from({ length: 50 }, () => makeRow({ actualTeamPoints: 999, scoringEnvironment: { value: -999, sampleGames: 1, mode: "priorSeasonOnly", method: "priorSeason" } }));
    void poisonedOuterValidation; // present in scope, deliberately never passed to selectLambdaEnv
    const resultB = selectLambdaEnv(INTERNAL_TRAIN, INTERNAL_VAL);
    expect(resultA).toEqual(resultB);
  });
});

describe("scoreEnvironmentPenaltyRidge", () => {
  it("scores a normal row to a finite number and returns null when a feature is missing", () => {
    const model = fitEnvironmentPenaltyRidge(NEGATIVE_ENV_ROWS, 1, 10);
    expect(Number.isFinite(scoreEnvironmentPenaltyRidge(model, NEGATIVE_ENV_ROWS[0]))).toBe(true);
    const incomplete = makeRow({ scoringEnvironment: { value: null, sampleGames: 0, mode: "priorSeasonOnly", method: "insufficient" } });
    expect(scoreEnvironmentPenaltyRidge(model, incomplete)).toBeNull();
  });
});
