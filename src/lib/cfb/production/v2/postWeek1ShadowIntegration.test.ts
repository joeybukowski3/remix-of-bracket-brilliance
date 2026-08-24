// CFB Model V2 — WU5 §21 required integration fixture. Proves that once
// real current-season inputs (completed games, current-season plays) exist,
// the full production pipeline — ratings -> SUCCESS derivation -> game
// projections -> cross-validation -> manifest — produces at least one
// computed FBS-vs-FBS projection for a FUTURE (not-yet-played) game, and
// that the honest preseason degraded flag PRESEASON_ZERO_COMPLETED_GAMES
// is correctly removed. This exercises the same functions
// scripts/cfb-v2-build-shadow.ts orchestrates, since the script itself
// (a `main()`-at-import entry point reading real files) is not unit-
// testable, matching WU2/WU3/WU4's existing convention of testing the
// underlying production/v2 functions directly rather than the script.

import { describe, expect, it } from "vitest";
import { CFB_EXTERNAL_TEAM_MAPPINGS } from "@/data/cfb/externalTeamMapping";
import { buildCfbV2TeamRatings } from "./buildTeamRatings";
import { validateCfbV2TeamRatings } from "./ratingValidation";
import { buildCfbV2TeamRatingArtifact } from "./artifactWriter";
import { deriveCfbV2SuccessObservations, type CfbV2RawPlay } from "./successDerivation";
import { buildCfbV2GameProjections, type CfbV2ScheduleGame } from "./buildGameProjections";
import { buildCfbV2GameProjectionArtifact } from "./projectionArtifactWriter";
import { validateCfbV2GameProjections } from "./projectionValidation";
import { assertPublishableCfbV2Shadow } from "./shadowValidation";
import { buildCfbV2ShadowManifest, computeCfbV2ShadowDegradedFlags } from "./shadowManifest";
import { CFB_V2_CONFIG_VERSION } from "./config";
import type { CfbdGame, CfbdGameTeamStats, CfbdTalent, CfbdTeam } from "./ratingInputs";
import type { CfbV2CalibrationResidualSeedArtifact, CfbV2CalibrationResidualSeedRow, CfbV2ScoringNormalEquationSnapshot, CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";

const [A, B, C, D] = CFB_EXTERNAL_TEAM_MAPPINGS.slice(0, 4);
const TEAMS: CfbdTeam[] = CFB_EXTERNAL_TEAM_MAPPINGS.map((m, i) => ({ id: 1000 + i, school: m.cfbdName, classification: "fbs" }));

function cfbdGame(id: number, week: number, home: typeof A, away: typeof A, completed: boolean, homePoints: number | null, awayPoints: number | null): CfbdGame {
  return {
    id,
    season: 2026,
    week,
    seasonType: "regular",
    startDate: `2026-09-${String(week).padStart(2, "0")}T16:00:00.000Z`,
    startTimeTBD: false,
    completed,
    neutralSite: false,
    homeId: 1000 + CFB_EXTERNAL_TEAM_MAPPINGS.indexOf(home),
    homeTeam: home.cfbdName,
    homeClassification: "fbs",
    homePoints,
    awayId: 1000 + CFB_EXTERNAL_TEAM_MAPPINGS.indexOf(away),
    awayTeam: away.cfbdName,
    awayClassification: "fbs",
    awayPoints,
  };
}

function teamGameStats(gameId: number, home: typeof A, away: typeof A, homePoints: number, awayPoints: number): CfbdGameTeamStats {
  return {
    id: gameId,
    teams: [
      { teamId: 1000 + CFB_EXTERNAL_TEAM_MAPPINGS.indexOf(home), team: home.cfbdName, homeAway: "home", points: homePoints, stats: [{ category: "totalYards", stat: "420" }, { category: "totalOffensivePlays", stat: "65" }, { category: "yardsPerPlay", stat: "6.5" }, { category: "turnovers", stat: "1" }] },
      { teamId: 1000 + CFB_EXTERNAL_TEAM_MAPPINGS.indexOf(away), team: away.cfbdName, homeAway: "away", points: awayPoints, stats: [{ category: "totalYards", stat: "350" }, { category: "totalOffensivePlays", stat: "62" }, { category: "yardsPerPlay", stat: "5.6" }, { category: "turnovers", stat: "2" }] },
    ],
  };
}

/** Alternating positive/negative PPA plays for both sides of one game — a realistic mixed SUCCESS rate, never all-success or all-fail. */
function playsFor(gameId: number, offense: typeof A, defense: typeof A): CfbV2RawPlay[] {
  const offensePlays: CfbV2RawPlay[] = [0.6, -0.4, 0.3, 0.1, -0.2, 0.5, -0.1, 0.4].map((ppa) => ({ gameId, offense: offense.cfbdName, defense: defense.cfbdName, ppa }));
  const defensePlays: CfbV2RawPlay[] = [0.2, -0.3, 0.4, -0.5, 0.1, -0.1, 0.3, -0.2].map((ppa) => ({ gameId, offense: defense.cfbdName, defense: offense.cfbdName, ppa }));
  return [...offensePlays, ...defensePlays];
}

function scoringArtifactFixture(): CfbV2ScoringNormalEquationsArtifact {
  const featureNames = ["intercept", "scoringEnvironment", "offenseRating", "defenseRatingAllowed", "hfa", "SUCCESS_own", "SUCCESS_opponentAllowed"];
  const n = featureNames.length;
  const rowCount = 500;
  const coefficients = [20, 0, 1, -1, 2, 5, -5];
  const snapshot: CfbV2ScoringNormalEquationSnapshot = {
    season: 2020,
    week: 1,
    featureNames,
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

describe("WU5 §21 — post-Week-1 shadow integration: real completed games unblock a future computed projection", () => {
  it("produces at least one computed FBS-vs-FBS projection for a future game, with a coherent promoted manifest and the preseason degraded flag removed", () => {
    const asOfWeek = 2; // "games strictly before week 2" -> week-1 games are folded in.
    const generatedAt = "2026-09-10T12:00:00.000Z";

    // ---- completed Week 1 games (feed ratings + SUCCESS) --------------------------
    const game1 = cfbdGame(9001, 1, A, B, true, 30, 17);
    const game2 = cfbdGame(9002, 1, C, D, true, 24, 21);
    const currentSeasonGames: CfbdGame[] = [game1, game2];
    const currentSeasonTeamGameStats: CfbdGameTeamStats[] = [teamGameStats(9001, A, B, 30, 17), teamGameStats(9002, C, D, 24, 21)];
    const rawPlays: CfbV2RawPlay[] = [...playsFor(9001, A, B), ...playsFor(9002, C, D)];

    const talent: CfbdTalent[] = CFB_EXTERNAL_TEAM_MAPPINGS.slice(0, 4).map((m) => ({ year: 2026, team: m.cfbdName, talent: 850 }));
    const dataAsOf = "2026-09-01T16:00:00.000Z";

    // ---- WU2 ratings, real cutoff-aware builder ------------------------------------
    const ratings = buildCfbV2TeamRatings({
      season: 2026,
      dataAsOf,
      generatedAt,
      asOfWeek,
      teams: TEAMS,
      currentSeasonGames,
      currentSeasonTeamGameStats,
      priorSeasonGames: [],
      priorSeasonTeamGameStats: [],
      returningProduction: [],
      talent,
    });
    validateCfbV2TeamRatings(ratings, new Set(ratings.map((r) => r.teamId)));
    const ratingA = ratings.find((r) => r.teamId === A.jkbTeamId)!;
    expect(ratingA.gamesPlayed).toBe(1); // the week-1 game was correctly folded in at asOfWeek=2

    // ---- WU5 SUCCESS derivation from real raw plays --------------------------------
    const successObservations = deriveCfbV2SuccessObservations(rawPlays);
    expect(successObservations.length).toBeGreaterThan(0);
    expect(successObservations.some((o) => o.teamId === A.jkbTeamId)).toBe(true);
    expect(successObservations.some((o) => o.teamId === C.jkbTeamId)).toBe(true);

    // ---- future (not-yet-played) FBS-vs-FBS game: A vs C in week 2 ----------------
    const futureGame: CfbV2ScheduleGame = { gameId: "future-g1", season: 2026, week: 2, homeTeamId: A.jkbTeamId, awayTeamId: C.jkbTeamId, neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" };
    const scheduleGames: CfbV2ScheduleGame[] = [futureGame];

    const teamRatingsByTeamId = new Map(ratings.map((r) => [r.teamId, r]));
    const currentSeasonCompletedGameScores = [
      { homePoints: 30, awayPoints: 17 },
      { homePoints: 24, awayPoints: 21 },
    ];

    const projections = buildCfbV2GameProjections({
      season: 2026,
      dataAsOf: { season: 2026, week: asOfWeek },
      dataAsOfIso: dataAsOf,
      generatedAt,
      scheduleGames,
      teamRatingsByTeamId,
      scoringArtifact: scoringArtifactFixture(),
      calibrationArtifact: calibrationArtifactFixture(),
      currentSeasonSuccessObservations: successObservations,
      currentSeasonCompletedGameScores,
      previousSeasonMean: null,
      allPriorSeasonsMean: null,
      currentSeasonCalibrationRows: [],
    });
    validateCfbV2GameProjections(projections);

    const futureProjection = projections.find((p) => p.gameId === "future-g1")!;
    expect(futureProjection).toBeDefined();
    expect(futureProjection.projectionStatus).toBe("computed");
    expect(futureProjection.matchupPopulation).toBe("fbs_vs_fbs");

    // ---- finite, coherent numeric output --------------------------------------------
    expect(Number.isFinite(futureProjection.expectedHomePoints)).toBe(true);
    expect(Number.isFinite(futureProjection.expectedAwayPoints)).toBe(true);
    expect(Number.isFinite(futureProjection.homeWinProbability as number)).toBe(true);
    expect(Number.isFinite(futureProjection.awayWinProbability as number)).toBe(true);
    expect(futureProjection.homeWinProbability! + futureProjection.awayWinProbability!).toBeCloseTo(1, 6);
    expect(futureProjection.projectedMargin).toBeCloseTo((futureProjection.expectedHomePoints as number) - (futureProjection.expectedAwayPoints as number), 6);
    expect(futureProjection.projectedTotal).toBeGreaterThan(0);

    // ---- cross-validation + manifest — the same gate WU4's orchestrator runs ------
    const ratingArtifact = buildCfbV2TeamRatingArtifact({ season: 2026, asOfWeek, generatedAt, dataAsOf, records: ratings });
    const projectionArtifact = buildCfbV2GameProjectionArtifact({ season: 2026, asOfWeek, generatedAt, dataAsOf, records: projections });
    const scoringSupportArtifact = scoringArtifactFixture();
    const calibrationSupportArtifact = calibrationArtifactFixture();
    expect(() =>
      assertPublishableCfbV2Shadow({
        ratingArtifact,
        projectionArtifact,
        scoringSupportArtifact,
        calibrationSupportArtifact,
        expectedConfigVersion: CFB_V2_CONFIG_VERSION,
      }),
    ).not.toThrow();

    const degradedFlags = computeCfbV2ShadowDegradedFlags({
      ratings,
      currentSeasonSuccessObservationCount: successObservations.length,
      currentSeasonCompletedGameCount: currentSeasonGames.filter((g) => g.completed).length,
      currentSeasonTalentRecordCount: talent.length,
    });
    // The honest-preseason flag must be gone now that real completed games exist.
    expect(degradedFlags).not.toContain("PRESEASON_ZERO_COMPLETED_GAMES");
    expect(degradedFlags).not.toContain("NO_CURRENT_SUCCESS_DATA");

    const manifest = buildCfbV2ShadowManifest({
      season: 2026,
      asOfWeek,
      dataAsOf,
      generatedAt,
      ratingArtifact,
      ratingsArtifactPath: "data/generated/cfb/v2/week-02-ratings.json",
      ratingsContentHash: "sha-fnv1a-test0000",
      projectionArtifact,
      projectionsArtifactPath: "data/generated/cfb/v2/week-02-projections.json",
      projectionsContentHash: "sha-fnv1a-test1111",
      scoringSupportArtifact,
      calibrationSupportArtifact,
      degradedFlags,
    });
    expect(manifest.pipelineStatus).toBe("published");
    expect(manifest.summary.projectionsAvailable).toBeGreaterThanOrEqual(1);

    // ---- WU5 §28 determinism — identical inputs, run twice, byte-identical output ----
    const successObservations2 = deriveCfbV2SuccessObservations(rawPlays);
    const ratings2 = buildCfbV2TeamRatings({
      season: 2026,
      dataAsOf,
      generatedAt,
      asOfWeek,
      teams: TEAMS,
      currentSeasonGames,
      currentSeasonTeamGameStats,
      priorSeasonGames: [],
      priorSeasonTeamGameStats: [],
      returningProduction: [],
      talent,
    });
    const projections2 = buildCfbV2GameProjections({
      season: 2026,
      dataAsOf: { season: 2026, week: asOfWeek },
      dataAsOfIso: dataAsOf,
      generatedAt,
      scheduleGames,
      teamRatingsByTeamId: new Map(ratings2.map((r) => [r.teamId, r])),
      scoringArtifact: scoringArtifactFixture(),
      calibrationArtifact: calibrationArtifactFixture(),
      currentSeasonSuccessObservations: successObservations2,
      currentSeasonCompletedGameScores,
      previousSeasonMean: null,
      allPriorSeasonsMean: null,
      currentSeasonCalibrationRows: [],
    });
    expect(JSON.stringify(successObservations2)).toBe(JSON.stringify(successObservations));
    expect(JSON.stringify(ratings2)).toBe(JSON.stringify(ratings));
    expect(JSON.stringify(projections2)).toBe(JSON.stringify(projections));
  });
});
