import { describe, expect, it } from "vitest";
import { buildCfbV2GameProjections, CfbV2ProjectionBuildError, type CfbV2ScheduleGame } from "./buildGameProjections";
import { validateCfbV2GameProjections } from "./projectionValidation";
import { CFB_V2_CONFIG_VERSION } from "./config";
import type { CfbV2ScoringNormalEquationsArtifact, CfbV2ScoringNormalEquationSnapshot, CfbV2CalibrationResidualSeedArtifact, CfbV2CalibrationResidualSeedRow } from "./scoringSupportTypes";
import type { CfbV2TeamRating } from "./types";

const FEATURE_NAMES = ["intercept", "scoringEnvironment", "offenseRating", "defenseRatingAllowed", "hfa", "SUCCESS_own", "SUCCESS_opponentAllowed"];

function identitySnapshot(coefficients: readonly number[], rowCount: number): CfbV2ScoringNormalEquationSnapshot {
  const n = 7;
  const ata = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? rowCount : 0)));
  const atb = coefficients.map((c) => c * rowCount);
  return { season: 2020, week: 1, featureNames: FEATURE_NAMES, ata, atb, usableRowCount: rowCount };
}

function scoringArtifactFixture(): CfbV2ScoringNormalEquationsArtifact {
  return {
    schemaVersion: "s1",
    artifactVersion: "cfb-v2-scoring-normal-equations-2020-2025-v1",
    modelVersion: "cfb-ipr-v2.0",
    configVersion: CFB_V2_CONFIG_VERSION,
    phase9CandidateVersion: "test",
    sourceSeasonStart: 2020,
    sourceSeasonEnd: 2025,
    generatedAt: new Date().toISOString(),
    generatorVersion: "test",
    recordCount: 1,
    contentHash: "test",
    marketFree: true,
    records: [identitySnapshot([20, 0, 1, -1, 2, 5, -5], 500)],
  };
}

function calibrationRowFixture(overrides: Partial<CfbV2CalibrationResidualSeedRow>): CfbV2CalibrationResidualSeedRow {
  return {
    gameId: `h-${Math.random()}`,
    season: 2025,
    week: 1,
    rawExpectedHomePoints: 24,
    rawExpectedAwayPoints: 21,
    rawProjectedMargin: 3,
    rawProjectedTotal: 45,
    calibratedExpectedHomePoints: 25,
    calibratedExpectedAwayPoints: 20,
    calibratedTotal: 45,
    actualHomePoints: 28,
    actualAwayPoints: 17,
    actualTotal: 45,
    homeResidual: 3,
    awayResidual: -3,
    ...overrides,
  };
}

function calibrationArtifactFixture(): CfbV2CalibrationResidualSeedArtifact {
  const records = Array.from({ length: 15 }, (_, i) => calibrationRowFixture({ gameId: `cal-${i}`, homeResidual: i - 7, awayResidual: 7 - i }));
  return {
    schemaVersion: "s1",
    artifactVersion: "cfb-v2-calibration-residual-seed-2020-2025-v1",
    modelVersion: "cfb-ipr-v2.0",
    configVersion: CFB_V2_CONFIG_VERSION,
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

function ratingFixture(teamId: string, offenseRating: number, defenseRating: number): CfbV2TeamRating {
  return {
    teamId,
    season: 2026,
    asOfWeek: 0,
    modelVersion: "cfb-ipr-v2.0",
    offenseRating,
    defenseRating,
    overallRating: (offenseRating + defenseRating) / 2,
    preseasonPriorOffense: offenseRating,
    preseasonPriorDefense: defenseRating,
    priorTier: "PRIOR_A",
    gamesPlayed: 0,
    classification: "fbs",
    connectivity: { componentSize: 1, regularizationMultiplier: 3 },
    ratingStatus: "computed",
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: new Date().toISOString(),
    dataAsOf: new Date().toISOString(),
  };
}

function baseInput(scheduleGames: readonly CfbV2ScheduleGame[]) {
  return {
    season: 2026,
    dataAsOf: { season: 2026, week: 1 },
    dataAsOfIso: "2026-01-20T00:00:00.000Z",
    generatedAt: "2026-08-23T00:00:00.000Z",
    scheduleGames,
    teamRatingsByTeamId: new Map([
      ["home", ratingFixture("home", 1, -0.5)],
      ["away", ratingFixture("away", 0.5, -1)],
    ]),
    scoringArtifact: scoringArtifactFixture(),
    calibrationArtifact: calibrationArtifactFixture(),
    currentSeasonSuccessObservations: [
      { teamId: "home", successRate: 0.45 },
      { teamId: "away", successRate: 0.4 },
    ],
    currentSeasonCompletedGameScores: [],
    previousSeasonMean: 27,
    allPriorSeasonsMean: 25,
    currentSeasonCalibrationRows: [],
  };
}

describe("buildCfbV2GameProjections", () => {
  it("produces a validated computed projection for an FBS vs FBS game with all inputs available", () => {
    const game: CfbV2ScheduleGame = { gameId: "g1", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" };
    const projections = buildCfbV2GameProjections(baseInput([game]));
    expect(projections).toHaveLength(1);
    expect(projections[0].projectionStatus).toBe("computed");
    expect(() => validateCfbV2GameProjections(projections)).not.toThrow();
  });

  it("marks an fbs_vs_fcs game unavailable without fabricating a value", () => {
    const game: CfbV2ScheduleGame = { gameId: "g2", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", neutralSite: false, homeClassification: "fbs", awayClassification: "fcs" };
    const [projection] = buildCfbV2GameProjections(baseInput([game]));
    expect(projection.projectionStatus).toBe("unavailable");
    expect(projection.matchupPopulation).toBe("fbs_vs_fcs");
    expect(projection.expectedHomePoints).toBeNull();
  });

  it("marks a projection unavailable (not fabricated) when SUCCESS data is missing — the honest preseason behavior (§8/§28)", () => {
    const game: CfbV2ScheduleGame = { gameId: "g3", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" };
    const input = { ...baseInput([game]), currentSeasonSuccessObservations: [] };
    const [projection] = buildCfbV2GameProjections(input);
    expect(projection.projectionStatus).toBe("unavailable");
    expect(projection.matchupPopulation).toBe("fbs_vs_fbs");
    expect(projection.expectedHomePoints).toBeNull();
  });

  it("fails closed on a scoring-artifact config-version mismatch (§22)", () => {
    const game: CfbV2ScheduleGame = { gameId: "g4", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" };
    const input = baseInput([game]);
    input.scoringArtifact = { ...input.scoringArtifact, configVersion: "stale-hash" };
    expect(() => buildCfbV2GameProjections(input)).toThrow(CfbV2ProjectionBuildError);
  });

  it("fails closed on a calibration-artifact config-version mismatch (§22)", () => {
    const game: CfbV2ScheduleGame = { gameId: "g5", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" };
    const input = baseInput([game]);
    input.calibrationArtifact = { ...input.calibrationArtifact, configVersion: "stale-hash" };
    expect(() => buildCfbV2GameProjections(input)).toThrow(CfbV2ProjectionBuildError);
  });

  it("fails closed on a duplicate gameId in the schedule input (§19)", () => {
    const game: CfbV2ScheduleGame = { gameId: "g6", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" };
    expect(() => buildCfbV2GameProjections(baseInput([game, { ...game }]))).toThrow(CfbV2ProjectionBuildError);
  });

  it("fails closed on a missing team rating (§19)", () => {
    const game: CfbV2ScheduleGame = { gameId: "g7", season: 2026, week: 1, homeTeamId: "unknown-team", awayTeamId: "away", neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" };
    expect(() => buildCfbV2GameProjections(baseInput([game]))).toThrow(CfbV2ProjectionBuildError);
  });

  it("never uses a residual pair at or after the requested cutoff (as-of leakage safety, §18)", () => {
    const game: CfbV2ScheduleGame = { gameId: "g8", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" };
    const input = baseInput([game]);
    // Override the calibration artifact so every row is dated AT the requested cutoff (season=2026/week=1) — none are strictly before it, so the residual pool must be empty and the projection must be unavailable, not silently using contemporaneous/future games.
    input.calibrationArtifact = { ...input.calibrationArtifact, records: input.calibrationArtifact.records.map((r) => ({ ...r, season: 2026, week: 1 })) };
    const [projection] = buildCfbV2GameProjections(input);
    expect(projection.projectionStatus).toBe("unavailable");
  });

  it("marks neutralSite games with hfa=0 (produces a distinct result from a home game)", () => {
    const homeGame: CfbV2ScheduleGame = { gameId: "g9a", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" };
    const neutralGame: CfbV2ScheduleGame = { gameId: "g9b", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", neutralSite: true, homeClassification: "fbs", awayClassification: "fbs" };
    const [homeProjection, neutralProjection] = buildCfbV2GameProjections(baseInput([homeGame, neutralGame]));
    expect(homeProjection.expectedHomePoints).not.toBeCloseTo(neutralProjection.expectedHomePoints as number, 6);
  });
});
