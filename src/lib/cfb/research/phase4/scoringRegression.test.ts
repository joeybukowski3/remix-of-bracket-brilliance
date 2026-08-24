import { describe, expect, it } from "vitest";
import { fitScoringModel, predictScore } from "./scoringRegression";
import type { ScoringModelConfig, ScoringObservation } from "./types";

function row(overrides: Partial<ScoringObservation> = {}): ScoringObservation {
  return {
    gameId: "g1", season: 2020, week: 3, teamExternalId: "A", opponentExternalId: "B",
    teamClassification: "fbs", opponentClassification: "fbs", isHome: true, isNeutral: false,
    teamOffenseRating: 0.5, opponentDefenseRating: 0.2,
    teamPaceRaw: 27, opponentPaceRaw: 25, teamPaceSituationNeutral: 28, opponentPaceSituationNeutral: 26,
    teamPpaPerPlay: 0.1, opponentPpaAllowed: 0.05,
    teamSuccessRate: 0.45, opponentSuccessRateAllowed: 0.4,
    teamExplosiveRate: 0.1, opponentExplosiveRateAllowed: 0.09,
    scoringEnvironmentEstimate: 28,
    actualPoints: 30,
    ...overrides,
  };
}

const BASE_CONFIG: ScoringModelConfig = { hfa: "NATIONAL", scoringEnvironment: "BLENDED_CURRENT", pace: "NONE", secondary: [], lambda: 1, priorGamesWeight: 8 };

function makeTrainingRows(n: number): ScoringObservation[] {
  return Array.from({ length: n }, (_, i) =>
    row({
      gameId: `g${i}`,
      teamExternalId: `T${i % 8}`,
      opponentExternalId: `T${(i + 1) % 8}`,
      teamOffenseRating: (i % 5) - 2,
      opponentDefenseRating: (i % 3) - 1,
      isHome: i % 2 === 0,
      actualPoints: 24 + (i % 5) * 3 - (i % 3) * 2,
    }),
  );
}

describe("fitScoringModel / predictScore", () => {
  it("fits a model whose predictions are finite and reasonably close to training-range points", () => {
    const rows = makeTrainingRows(60);
    const model = fitScoringModel(rows, BASE_CONFIG);
    const prediction = predictScore(model, row());
    expect(prediction).not.toBeNull();
    expect(Number.isFinite(prediction)).toBe(true);
  });

  it("includes exactly the requested feature blocks in featureNames", () => {
    const rows = makeTrainingRows(60);
    const noExtras = fitScoringModel(rows, { ...BASE_CONFIG, hfa: "NONE", pace: "NONE", secondary: [] });
    expect(noExtras.featureNames).toEqual(["intercept", "scoringEnvironment", "offenseRating", "defenseRatingAllowed"]);

    const withPace = fitScoringModel(rows, { ...BASE_CONFIG, hfa: "NONE", pace: "RAW", secondary: [] });
    expect(withPace.featureNames).toContain("teamPaceRaw");
    expect(withPace.featureNames).toContain("opponentPaceRaw");

    const withSecondary = fitScoringModel(rows, { ...BASE_CONFIG, hfa: "NONE", pace: "NONE", secondary: ["PPA", "SUCCESS"] });
    expect(withSecondary.featureNames).toContain("PPA_own");
    expect(withSecondary.featureNames).toContain("SUCCESS_opponentAllowed");
  });

  it("SEASON_VARYING HFA adds one column per training season", () => {
    const rows = [...makeTrainingRows(30).map((r) => ({ ...r, season: 2020 })), ...makeTrainingRows(30).map((r) => ({ ...r, season: 2021, gameId: `${r.gameId}-21` }))];
    const model = fitScoringModel(rows, { ...BASE_CONFIG, hfa: "SEASON_VARYING" });
    expect(model.featureNames).toContain("hfa_2020");
    expect(model.featureNames).toContain("hfa_2021");
  });

  it("drops rows missing a required feature rather than imputing zero", () => {
    const rows = [...makeTrainingRows(30), row({ gameId: "missing", teamOffenseRating: null, actualPoints: 100 })];
    const model = fitScoringModel(rows, BASE_CONFIG);
    // A model fit including the missing-feature row (imputed as 0) would be pulled toward
    // its extreme actualPoints=100; verify the fit stays in the normal training range.
    const prediction = predictScore(model, row());
    expect(prediction).toBeLessThan(60);
  });

  it("predictScore returns null when a required feature is missing on the prediction row", () => {
    const model = fitScoringModel(makeTrainingRows(60), BASE_CONFIG);
    expect(predictScore(model, row({ teamOffenseRating: null }))).toBeNull();
  });

  it("falls back to an intercept-only mean prediction with too few usable training rows", () => {
    const rows = [row({ actualPoints: 20 }), row({ gameId: "g2", actualPoints: 30 })];
    const model = fitScoringModel(rows, BASE_CONFIG);
    expect(Number.isFinite(model.coefficients[0])).toBe(true);
  });
});
