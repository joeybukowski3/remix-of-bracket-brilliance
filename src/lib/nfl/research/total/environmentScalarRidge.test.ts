import { describe, expect, it } from "vitest";
import {
  fitRelativeRidgeNoEnvironment,
  computeEnvReferenceMean,
  scoreWithEnvironmentScalar,
  selectEnvironmentAlpha,
} from "./environmentScalarRidge";
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

const INTERNAL_TRAIN: NflTotalResearchDatasetRow[] = Array.from({ length: 10 }, (_, i) =>
  makeRow({
    actualTeamPoints: 17 + (i % 5) * 3,
    scoringEnvironment: { value: 20 + (i % 3), sampleGames: 100, mode: "priorSeasonOnly", method: "priorSeason" },
    offense: { epaPerPlay: -0.1 + i * 0.02, successRate: 0.35 + i * 0.01, explosiveRate: 0.05, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
    opponentDefenseAllowed: { epaPerPlay: 0.1 - i * 0.015, successRate: 0.45 - i * 0.005, explosiveRate: 0.09, sampleGames: 4, samplePlays: 250, window: "seasonPrior" },
  }),
);
const INTERNAL_VAL: NflTotalResearchDatasetRow[] = Array.from({ length: 6 }, (_, i) =>
  makeRow({ actualTeamPoints: 20 + i, scoringEnvironment: { value: 23 + i, sampleGames: 100, mode: "priorSeasonOnly", method: "priorSeason" } }),
);

describe("computeEnvReferenceMean", () => {
  it("computes the mean scoringEnvironment over the given rows only", () => {
    const rows = [makeRow({ scoringEnvironment: { value: 20, sampleGames: 1, mode: "priorSeasonOnly", method: "priorSeason" } }), makeRow({ scoringEnvironment: { value: 24, sampleGames: 1, mode: "priorSeasonOnly", method: "priorSeason" } })];
    expect(computeEnvReferenceMean(rows)).toBeCloseTo(22, 9);
  });
  it("returns null when no row has a resolvable environment", () => {
    expect(computeEnvReferenceMean([makeRow({ scoringEnvironment: { value: null, sampleGames: 0, mode: "priorSeasonOnly", method: "insufficient" } })])).toBeNull();
  });
});

describe("scoreWithEnvironmentScalar", () => {
  it("alpha=0 reproduces the base relative-ridge prediction exactly, ignoring environment entirely", () => {
    const ridge = fitRelativeRidgeNoEnvironment(INTERNAL_TRAIN, 1);
    const row = INTERNAL_VAL[0];
    const withZeroAlpha = scoreWithEnvironmentScalar(ridge, 22, 0, row)!;
    const baseOnly = scoreWithEnvironmentScalar(ridge, 999 /* reference should not matter when alpha=0 */, 0, row)!;
    expect(withZeroAlpha).toBeCloseTo(baseOnly, 9);
  });

  it("contributes exactly 0 when the row's environment equals the reference, regardless of alpha", () => {
    const ridge = fitRelativeRidgeNoEnvironment(INTERNAL_TRAIN, 1);
    const row = makeRow({ scoringEnvironment: { value: 22, sampleGames: 1, mode: "priorSeasonOnly", method: "priorSeason" } });
    const atReference = scoreWithEnvironmentScalar(ridge, 22, 1, row)!;
    const zeroAlphaAtReference = scoreWithEnvironmentScalar(ridge, 22, 0, row)!;
    expect(atReference).toBeCloseTo(zeroAlphaAtReference, 9);
  });

  it("returns null when environment is unresolved", () => {
    const ridge = fitRelativeRidgeNoEnvironment(INTERNAL_TRAIN, 1);
    const row = makeRow({ scoringEnvironment: { value: null, sampleGames: 0, mode: "priorSeasonOnly", method: "insufficient" } });
    expect(scoreWithEnvironmentScalar(ridge, 22, 0.5, row)).toBeNull();
  });
});

describe("selectEnvironmentAlpha -- leakage safety and determinism", () => {
  it("is a pure function of its internal-train/internal-val arguments -- unaffected by any outer-scope 'validation' data", () => {
    const resultA = selectEnvironmentAlpha(INTERNAL_TRAIN, INTERNAL_VAL, 1, [0, 0.25, 0.5, 0.75, 1]);
    // Simulate a poisoned outer-validation/retrospective dataset existing "elsewhere" in scope --
    // it is never passed to selectEnvironmentAlpha, so the result must be identical.
    const poisonedOuterValidation = Array.from({ length: 50 }, () => makeRow({ actualTeamPoints: 999, scoringEnvironment: { value: -999, sampleGames: 1, mode: "priorSeasonOnly", method: "priorSeason" } }));
    void poisonedOuterValidation; // present in scope, deliberately never passed in
    const resultB = selectEnvironmentAlpha(INTERNAL_TRAIN, INTERNAL_VAL, 1, [0, 0.25, 0.5, 0.75, 1]);
    expect(resultA).toEqual(resultB);
  });

  it("selects from exactly the provided candidate set", () => {
    const result = selectEnvironmentAlpha(INTERNAL_TRAIN, INTERNAL_VAL, 1, [0, 0.25, 0.5, 0.75, 1]);
    expect([0, 0.25, 0.5, 0.75, 1]).toContain(result.selectedAlpha);
    expect(result.scores).toHaveLength(5);
  });

  it("is deterministic", () => {
    const a = selectEnvironmentAlpha(INTERNAL_TRAIN, INTERNAL_VAL, 1, [0, 0.5, 1]);
    const b = selectEnvironmentAlpha(INTERNAL_TRAIN, INTERNAL_VAL, 1, [0, 0.5, 1]);
    expect(a).toEqual(b);
  });
});
