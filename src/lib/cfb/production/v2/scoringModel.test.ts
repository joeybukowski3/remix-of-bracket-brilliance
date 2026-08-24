import { describe, expect, it } from "vitest";
import { predictCfbV2Score, selectCfbV2ScoringSnapshot, solveCfbV2ScoringModel, CfbV2ScoringModelError } from "./scoringModel";
import type { CfbV2ScoringNormalEquationsArtifact, CfbV2ScoringNormalEquationSnapshot } from "./scoringSupportTypes";

const FEATURE_NAMES = ["intercept", "scoringEnvironment", "offenseRating", "defenseRatingAllowed", "hfa", "SUCCESS_own", "SUCCESS_opponentAllowed"];

function fixtureArtifact(records: readonly CfbV2ScoringNormalEquationSnapshot[]): CfbV2ScoringNormalEquationsArtifact {
  return {
    schemaVersion: "s1",
    artifactVersion: "cfb-v2-scoring-normal-equations-2020-2025-v1",
    modelVersion: "cfb-ipr-v2.0",
    configVersion: "cfb-v2-config-test",
    phase9CandidateVersion: "test",
    sourceSeasonStart: 2020,
    sourceSeasonEnd: 2025,
    generatedAt: new Date().toISOString(),
    generatorVersion: "test",
    recordCount: records.length,
    contentHash: "test",
    marketFree: true,
    records,
  };
}

function identityAtaAtb(n: number, coefficients: readonly number[], rowCount: number): { ata: number[][]; atb: number[] } {
  // ata = rowCount * I (so solving with lambda=0 recovers the coefficients directly), atb = ata . coefficients
  const ata = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? rowCount : 0)));
  const atb = coefficients.map((c) => c * rowCount);
  return { ata, atb };
}

describe("selectCfbV2ScoringSnapshot", () => {
  const snapshots: CfbV2ScoringNormalEquationSnapshot[] = [
    { season: 2020, week: 5, featureNames: FEATURE_NAMES, ...identityAtaAtb(7, [1, 1, 1, 1, 1, 1, 1], 100), usableRowCount: 100 },
    { season: 2020, week: 6, featureNames: FEATURE_NAMES, ...identityAtaAtb(7, [2, 2, 2, 2, 2, 2, 2], 100), usableRowCount: 100 },
    { season: 2021, week: 3, featureNames: FEATURE_NAMES, ...identityAtaAtb(7, [3, 3, 3, 3, 3, 3, 3], 100), usableRowCount: 100 },
  ];
  const artifact = fixtureArtifact(snapshots);

  it("selects the exact matching snapshot when the cutoff matches", () => {
    expect(selectCfbV2ScoringSnapshot(artifact, 2020, 6).week).toBe(6);
  });

  it("selects the latest snapshot at or before the requested cutoff when no exact match exists", () => {
    expect(selectCfbV2ScoringSnapshot(artifact, 2020, 9).week).toBe(6);
  });

  it("selects across a season boundary correctly", () => {
    expect(selectCfbV2ScoringSnapshot(artifact, 2021, 3).season).toBe(2021);
  });

  it("throws when the cutoff is before the artifact's first snapshot", () => {
    expect(() => selectCfbV2ScoringSnapshot(artifact, 2019, 1)).toThrow(CfbV2ScoringModelError);
  });
});

describe("solveCfbV2ScoringModel", () => {
  it("reconstructs the exact coefficient vector via the normal-equation solve (lambda=0, orthogonal ata)", () => {
    const trueCoefficients = [24, 1.2, 0.8, -0.6, 2.5, 0.3, -0.2];
    const snapshot: CfbV2ScoringNormalEquationSnapshot = { season: 2024, week: 8, featureNames: FEATURE_NAMES, ...identityAtaAtb(7, trueCoefficients, 500), usableRowCount: 500 };
    const model = solveCfbV2ScoringModel(snapshot, 0);
    for (let i = 0; i < 7; i += 1) expect(model.coefficients[i]).toBeCloseTo(trueCoefficients[i], 9);
  });

  it("applies the live production ridge lambda at reconstruction time, not baked into the snapshot", () => {
    const snapshot: CfbV2ScoringNormalEquationSnapshot = { season: 2024, week: 8, featureNames: FEATURE_NAMES, ...identityAtaAtb(7, [24, 1, 1, 1, 1, 1, 1], 500), usableRowCount: 500 };
    const withoutLambda = solveCfbV2ScoringModel(snapshot, 0);
    const withLambda = solveCfbV2ScoringModel(snapshot, 2);
    // Ridge shrinks non-intercept coefficients toward zero — must differ.
    expect(withLambda.coefficients[2]).not.toBeCloseTo(withoutLambda.coefficients[2], 6);
    expect(withLambda.coefficients[0]).toBeCloseTo(withoutLambda.coefficients[0], 6); // intercept unpenalized
  });

  it("reproduces fitScoringModel's low-data fallback (intercept = training mean, all else zero) when usableRowCount < nParams+2", () => {
    // atb[0] = sum(actualPoints) since column 0 is the constant-1 intercept feature.
    const snapshot: CfbV2ScoringNormalEquationSnapshot = { season: 2020, week: 2, featureNames: FEATURE_NAMES, ata: Array.from({ length: 7 }, () => new Array(7).fill(0)), atb: [150, 0, 0, 0, 0, 0, 0], usableRowCount: 6 };
    const model = solveCfbV2ScoringModel(snapshot, 2);
    expect(model.coefficients[0]).toBeCloseTo(150 / 6, 9);
    for (let i = 1; i < 7; i += 1) expect(model.coefficients[i]).toBe(0);
  });
});

describe("predictCfbV2Score", () => {
  const model = { featureNames: FEATURE_NAMES, coefficients: [24, 1.2, 0.8, -0.6, 2.5, 0.3, -0.2], usableRowCount: 500 };

  it("computes the exact linear combination", () => {
    const features = { offenseRating: 1, opponentDefenseRating: -1, hfa: 1 as const, scoringEnvironmentEstimate: 27, successOwn: 0.45, successOpponentAllowed: 0.4 };
    const expected = 24 + 1.2 * 27 + 0.8 * 1 + -0.6 * -1 + 2.5 * 1 + 0.3 * 0.45 + -0.2 * 0.4;
    expect(predictCfbV2Score(model, features)).toBeCloseTo(expected, 9);
  });

  it("returns null when features are null (missing SUCCESS -> unavailable, never fabricated)", () => {
    expect(predictCfbV2Score(model, null)).toBeNull();
  });
});
