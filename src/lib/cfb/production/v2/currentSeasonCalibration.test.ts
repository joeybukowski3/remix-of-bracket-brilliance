import { describe, expect, it } from "vitest";
import { buildCfbV2CurrentSeasonCalibrationRows, type CfbV2CompletedGameForCalibration } from "./currentSeasonCalibration";
import { CFB_V2_CONFIG_VERSION } from "./config";
import type { CfbV2ScoringNormalEquationSnapshot, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";
import type { CfbV2TeamRating } from "./types";

const FEATURE_NAMES = ["intercept", "scoringEnvironment", "offenseRating", "defenseRatingAllowed", "hfa", "SUCCESS_own", "SUCCESS_opponentAllowed"];

function scoringArtifactFixture(): CfbV2ScoringNormalEquationsArtifact {
  const n = FEATURE_NAMES.length;
  const rowCount = 500;
  const coefficients = [20, 0, 1, -1, 2, 5, -5];
  const snapshot: CfbV2ScoringNormalEquationSnapshot = {
    season: 2020,
    week: 1,
    featureNames: FEATURE_NAMES,
    ata: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? rowCount : 0))),
    atb: coefficients.map((c) => c * rowCount),
    usableRowCount: rowCount,
  };
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
    records: [snapshot],
  };
}

function rating(teamId: string, offenseRating: number, defenseRating: number): CfbV2TeamRating {
  return {
    teamId,
    season: 2026,
    asOfWeek: 2,
    modelVersion: "cfb-ipr-v2.0",
    offenseRating,
    defenseRating,
    overallRating: (offenseRating + defenseRating) / 2,
    preseasonPriorOffense: offenseRating,
    preseasonPriorDefense: defenseRating,
    priorTier: "PRIOR_A",
    gamesPlayed: 1,
    classification: "fbs",
    connectivity: { componentSize: 2, regularizationMultiplier: 3 },
    ratingStatus: "computed",
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: new Date().toISOString(),
    dataAsOf: new Date().toISOString(),
  };
}

function game(overrides: Partial<CfbV2CompletedGameForCalibration> = {}): CfbV2CompletedGameForCalibration {
  return { gameId: "g1", season: 2026, week: 1, homeTeamId: "home", awayTeamId: "away", homePoints: 30, awayPoints: 17, ...overrides };
}

function baseInput(overrides: Partial<Parameters<typeof buildCfbV2CurrentSeasonCalibrationRows>[0]> = {}) {
  return {
    games: [game()],
    teamRatingsByTeamId: new Map([
      ["home", rating("home", 1, -0.5)],
      ["away", rating("away", 0.5, -1)],
    ]),
    scoringArtifact: scoringArtifactFixture(),
    successByTeam: new Map([
      ["home", 0.45],
      ["away", 0.4],
    ]),
    scoringEnvironmentEstimate: 27,
    dataAsOf: { season: 2026, week: 2 },
    ...overrides,
  };
}

describe("buildCfbV2CurrentSeasonCalibrationRows", () => {
  it("produces one row per eligible completed game with rawTotal and actualTotal", () => {
    const rows = buildCfbV2CurrentSeasonCalibrationRows(baseInput());
    expect(rows).toHaveLength(1);
    expect(rows[0].actualTotal).toBe(47); // 30 + 17
    expect(Number.isFinite(rows[0].rawTotal)).toBe(true);
    expect(rows[0].season).toBe(2026);
    expect(rows[0].week).toBe(1);
  });

  it("returns an empty array (never fabricates) when scoringEnvironmentEstimate is null — the honest preseason state", () => {
    const rows = buildCfbV2CurrentSeasonCalibrationRows(baseInput({ scoringEnvironmentEstimate: null }));
    expect(rows).toEqual([]);
  });

  it("skips a game whose team has no rating, rather than throwing", () => {
    const rows = buildCfbV2CurrentSeasonCalibrationRows(baseInput({ games: [game({ homeTeamId: "unknown-team" })] }));
    expect(rows).toEqual([]);
  });

  it("skips a game whose team has no SUCCESS observation, rather than fabricating a value", () => {
    const rows = buildCfbV2CurrentSeasonCalibrationRows(baseInput({ successByTeam: new Map() }));
    expect(rows).toEqual([]);
  });

  it("produces multiple rows for multiple eligible games", () => {
    const rows = buildCfbV2CurrentSeasonCalibrationRows(
      baseInput({
        games: [game({ gameId: "g1", week: 1 }), game({ gameId: "g2", week: 1, homePoints: 21, awayPoints: 14 })],
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.actualTotal)).toEqual([47, 35]);
  });
});
