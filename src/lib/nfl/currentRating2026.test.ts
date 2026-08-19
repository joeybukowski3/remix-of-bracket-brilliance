import { describe, expect, it } from "vitest";
import {
  CURRENT_RATING_WEIGHTS_BY_GAMES,
  blendCurrentRating,
  buildCurrentRatingBoard,
  clampRating,
  currentRatingWeightsFor,
  type BuildCurrentRatingBoardInput,
  type CurrentRatingRow,
} from "@/lib/nfl/currentRating2026";
import * as currentRatingModule from "@/lib/nfl/currentRating2026";
import type { NflV03Meta, NflV03PreseasonArtifact, NflV03PreseasonRating } from "@/lib/nfl/v03Review";
import type { NflPublicProjectionBoard, NflPublicProjectionTeam } from "@/lib/nfl/publicProjection2026";
import type { TeamPerformanceAnalyticsArtifact, TeamPerformanceAnalyticsRow } from "@/lib/nfl/teamPerformanceAnalytics";

// ---------------------------------------------------------------------------
// Fixture factories. buildCurrentRatingBoard consumes already-typed,
// already-validated artifacts (it never validates JSON itself).
// ---------------------------------------------------------------------------

function v03Meta(overrides: Partial<NflV03Meta> = {}): NflV03Meta {
  return {
    schemaVersion: "nfl-v0.2",
    modelVersion: "nfl-power-v0.3.1",
    validationStatus: "stage-1",
    generatedAt: "2026-07-01T00:00:00.000Z",
    season: 2026,
    source: "test-fixture",
    notes: [],
    knownLimitations: [],
    formulaWeights: { offense: 0.4, defense: 0.4, pointDiff: 0.2 },
    frozenPublicScaleDivisor: 0.733,
    trajectory: { statement: "lambda = 0", lambda: 0, shrinkageK: 4, cap: 1 },
    ...overrides,
  };
}

function v04Team(overrides: Partial<NflPublicProjectionTeam> = {}): NflPublicProjectionTeam {
  return {
    team: "Test Team",
    abbr: "tst",
    division: "AFC East",
    rank: 1,
    rating2025Adjusted: 50,
    projectionAdjustment2026: 0,
    rating2026: 60,
    sosRank: 16,
    sosAvgOpponentRating: 50,
    confidence: "Medium",
    notes: null,
    ...overrides,
  };
}

function v04Board(teams: NflPublicProjectionTeam[]): NflPublicProjectionBoard {
  return {
    season: 2026,
    sourceSeason: 2025,
    modelVersion: "nfl-power-v0.4-beta",
    offseasonSnapshotVerifiedThrough: "2026-07-01",
    teams,
  };
}

function v03PreseasonRow(overrides: Partial<NflV03PreseasonRating> = {}): NflV03PreseasonRating {
  return {
    teamId: "nfl-tst",
    slug: "test-team",
    abbr: "tst",
    name: "Test Team",
    historical: {
      fullSeasonComposite: 0, l8AdjustedComposite: 0, trajectoryRaw: 0,
      trajectoryShrunk: 0, trajectoryClamped: 0, lambda: 0, k: 4, cap: 1,
    },
    manualAdjustments: [],
    internalZ: 0,
    publicRating: 55,
    offenseRating: 50,
    defenseRating: 50,
    uncertainty: { band: "Medium", inputs: {} },
    rank: 16,
    rankChange: null,
    ratingChange: null,
    ...overrides,
  };
}

function v03PreseasonArtifact(ratings: NflV03PreseasonRating[]): NflV03PreseasonArtifact {
  return { _meta: v03Meta(), sourceSeason: 2025, ratings };
}

function zeroPerformanceRow(abbr: string): TeamPerformanceAnalyticsRow {
  const emptyBundle = () => ({
    epaPerPlay: null, successRate: null, epaPositiveRate: null,
    earlyDownEpaPerPlay: null, earlyDownSuccessRate: null,
    passEpaPerDropback: null, passSuccessRate: null,
    rushEpaPerPlay: null, rushSuccessRate: null,
    explosiveRate: null, explosivePassCount: 0, explosiveRushCount: 0,
    thirdDownEpaPerPlay: null, thirdDownSuccessRate: null, thirdDownRawConversionRate: null,
    sackRate: null, offPlays: 0, dropbacks: 0,
  });
  const emptyWindow = (sampleSize = 0) => ({
    sampleSize, offense: { all: emptyBundle(), filtered: emptyBundle() },
    defenseAllowed: { all: emptyBundle(), filtered: emptyBundle() },
    pointsPerDriveOff: null, pointsPerDriveAllowed: null,
  });
  return {
    team: abbr,
    gamesPlayed: 0,
    windows: {
      last4: emptyWindow(0),
      last8: emptyWindow(0),
      fullSeason: {
        ...emptyWindow(0),
        adjusted: {
          offense: { epaPerPlay: null, successRate: null, explosiveRate: null },
          defenseAllowed: { epaPerPlay: null, successRate: null, explosiveRate: null },
          pointDifferentialPerGame: { raw: null, adjusted: null },
        },
        metricRanks: { offense: {}, defenseAllowed: {} },
      },
    },
    performance: {
      offenseRating: null, offenseRank: null, defenseRating: null,
      defenseRank: null, performanceRating: null, performanceRank: null,
    },
  } as unknown as TeamPerformanceAnalyticsRow;
}

/** A team with `gamesPlayed` completed games and specific blended-input ratings. */
function playedPerformanceRow(
  abbr: string,
  gamesPlayed: number,
  performanceRating: number,
  offenseRating: number,
  defenseRating: number
): TeamPerformanceAnalyticsRow {
  const row = zeroPerformanceRow(abbr);
  return {
    ...row,
    gamesPlayed,
    windows: { ...row.windows, fullSeason: { ...row.windows.fullSeason, sampleSize: gamesPlayed } },
    performance: {
      offenseRating, offenseRank: 5, defenseRating, defenseRank: 7,
      performanceRating, performanceRank: 3,
    },
  } as unknown as TeamPerformanceAnalyticsRow;
}

function performanceArtifact(teams: TeamPerformanceAnalyticsRow[]): TeamPerformanceAnalyticsArtifact {
  return {
    schemaVersion: "nfl-performance-v1",
    _meta: { season: 2026, generatedAt: "2026-08-18T00:00:00.000Z", source: "test", ratingFormula: "test", scaleDivisors: { offense: 0.92, defense: 0.86, overall: 0.72 } },
    teams,
  };
}

function buildInput(overrides: Partial<BuildCurrentRatingBoardInput> = {}): BuildCurrentRatingBoardInput {
  return {
    season: 2026,
    v04Board: v04Board([v04Team()]),
    preseasonV03: v03PreseasonArtifact([v03PreseasonRow()]),
    performanceAnalytics: performanceArtifact([zeroPerformanceRow("tst")]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. The shared blend helper — exact worked examples.
// ---------------------------------------------------------------------------
describe("blendCurrentRating — exact worked examples", () => {
  it("preseason=70, performance=50 -> 70,66,62,58,55,52,50,50 for games 0-7", () => {
    const preseason = 70;
    const performance = 50;
    const expected = [70, 66, 62, 58, 55, 52, 50, 50];
    for (let games = 0; games <= 7; games += 1) {
      const weights = currentRatingWeightsFor(games);
      expect(blendCurrentRating(preseason, performance, weights)).toBeCloseTo(expected[games], 10);
    }
  });

  it("preseason=50, performance=70 -> 50,54,58,62,65,68,70,70 for games 0-7", () => {
    const preseason = 50;
    const performance = 70;
    const expected = [50, 54, 58, 62, 65, 68, 70, 70];
    for (let games = 0; games <= 7; games += 1) {
      const weights = currentRatingWeightsFor(games);
      expect(blendCurrentRating(preseason, performance, weights)).toBeCloseTo(expected[games], 10);
    }
  });

  it("is a DIRECT weighted blend, not a delta from baseline", () => {
    // A delta formula (preseason + weight*(performance-preseason)) happens to
    // produce the same numbers as a direct blend algebraically for two
    // points, so this checks the actual weight fields instead: at 3 games
    // the weights must be exactly 0.40/0.60, not derived from any subtraction.
    const weights = currentRatingWeightsFor(3);
    expect(weights).toEqual({ preseasonWeight: 0.40, performanceWeight: 0.60 });
  });

  it("clamps to [1, 99]", () => {
    expect(blendCurrentRating(0, 0, { preseasonWeight: 1, performanceWeight: 0 })).toBe(1);
    expect(blendCurrentRating(200, 200, { preseasonWeight: 0, performanceWeight: 1 })).toBe(99);
  });
});

describe("CURRENT_RATING_WEIGHTS_BY_GAMES — exact approved table", () => {
  it("matches the approved percentages for every games-played value 0-6+", () => {
    expect(CURRENT_RATING_WEIGHTS_BY_GAMES).toEqual({
      0: { preseasonWeight: 1.00, performanceWeight: 0.00 },
      1: { preseasonWeight: 0.80, performanceWeight: 0.20 },
      2: { preseasonWeight: 0.60, performanceWeight: 0.40 },
      3: { preseasonWeight: 0.40, performanceWeight: 0.60 },
      4: { preseasonWeight: 0.25, performanceWeight: 0.75 },
      5: { preseasonWeight: 0.10, performanceWeight: 0.90 },
      6: { preseasonWeight: 0.00, performanceWeight: 1.00 },
    });
  });

  it("currentRatingWeightsFor caps at 6+ and floors negative/fractional input to 0 games", () => {
    expect(currentRatingWeightsFor(6)).toEqual(currentRatingWeightsFor(17));
    expect(currentRatingWeightsFor(-3)).toEqual(currentRatingWeightsFor(0));
    expect(currentRatingWeightsFor(2.9)).toEqual(currentRatingWeightsFor(2));
  });
});

// ---------------------------------------------------------------------------
// 2. Zero-game parity — the single most important guarantee.
// ---------------------------------------------------------------------------
describe("zero-game parity (today's real production state)", () => {
  it("with gamesPlayed=0 for every team, OVR/OFF/DEF equal preseason exactly", () => {
    const teams = ["buf", "kc", "sf"];
    const board = buildCurrentRatingBoard(
      buildInput({
        v04Board: v04Board(teams.map((abbr, i) => v04Team({ abbr, team: abbr, rating2026: 60 + i * 5 }))),
        preseasonV03: v03PreseasonArtifact(teams.map((abbr, i) => v03PreseasonRow({ abbr, offenseRating: 55 + i, defenseRating: 45 + i }))),
        performanceAnalytics: performanceArtifact(teams.map((abbr) => zeroPerformanceRow(abbr))),
      })
    );
    for (const row of board.teams) {
      const v04 = 60 + teams.indexOf(row.abbr) * 5;
      const preOff = 55 + teams.indexOf(row.abbr);
      const preDef = 45 + teams.indexOf(row.abbr);
      expect(row.rating).toBe(clampRating(v04));
      expect(row.offenseRating).toBe(clampRating(preOff));
      expect(row.defenseRating).toBe(clampRating(preDef));
      expect(row.state).toBe("preseason");
      expect(row.preseasonWeight).toBe(1);
      expect(row.performanceWeight).toBe(0);
      expect(row.performanceRating).toBeNull();
    }
    expect(board.state).toBe("preseason");
  });
});

// ---------------------------------------------------------------------------
// 3. 1-5 game transitions and 6+ pure-performance.
// ---------------------------------------------------------------------------
describe("1-5 game blending and 6+ pure performance", () => {
  it("blends OVR/OFF/DEF identically using the same weights at 3 games", () => {
    const board = buildCurrentRatingBoard(
      buildInput({
        v04Board: v04Board([v04Team({ abbr: "tst", rating2026: 70 })]),
        preseasonV03: v03PreseasonArtifact([v03PreseasonRow({ abbr: "tst", offenseRating: 70, defenseRating: 70 })]),
        performanceAnalytics: performanceArtifact([playedPerformanceRow("tst", 3, 50, 50, 50)]),
      })
    );
    const row = board.teams[0];
    expect(row.rating).toBeCloseTo(58, 10);
    expect(row.offenseRating).toBeCloseTo(58, 10);
    expect(row.defenseRating).toBeCloseTo(58, 10);
    expect(row.state).toBe("live");
    expect(row.preseasonWeight).toBeCloseTo(0.4, 10);
    expect(row.performanceWeight).toBeCloseTo(0.6, 10);
  });

  it("6+ games uses performance alone (0% preseason weight)", () => {
    const board = buildCurrentRatingBoard(
      buildInput({
        v04Board: v04Board([v04Team({ abbr: "tst", rating2026: 70 })]),
        preseasonV03: v03PreseasonArtifact([v03PreseasonRow({ abbr: "tst", offenseRating: 70, defenseRating: 70 })]),
        performanceAnalytics: performanceArtifact([playedPerformanceRow("tst", 9, 50, 45, 55)]),
      })
    );
    const row = board.teams[0];
    expect(row.rating).toBe(50);
    expect(row.offenseRating).toBe(45);
    expect(row.defenseRating).toBe(55);
    expect(row.preseasonWeight).toBe(0);
    expect(row.performanceWeight).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Rank computed AFTER blending, never reusing preseason order.
// ---------------------------------------------------------------------------
describe("ranks computed after blending", () => {
  it("a team ranked worse in preseason but better after blending overtakes in the final rank", () => {
    const board = buildCurrentRatingBoard(
      buildInput({
        v04Board: v04Board([
          v04Team({ abbr: "aaa", team: "aaa", rating2026: 40 }), // worse preseason
          v04Team({ abbr: "bbb", team: "bbb", rating2026: 60 }), // better preseason
        ]),
        preseasonV03: v03PreseasonArtifact([
          v03PreseasonRow({ abbr: "aaa", offenseRating: 40, defenseRating: 40 }),
          v03PreseasonRow({ abbr: "bbb", offenseRating: 60, defenseRating: 60 }),
        ]),
        performanceAnalytics: performanceArtifact([
          playedPerformanceRow("aaa", 9, 90, 90, 90), // dominant live performance
          playedPerformanceRow("bbb", 9, 20, 20, 20), // poor live performance
        ]),
      })
    );
    const aaa = board.teams.find((t) => t.abbr === "aaa")!;
    const bbb = board.teams.find((t) => t.abbr === "bbb")!;
    expect(aaa.rating).toBeGreaterThan(bbb.rating);
    expect(aaa.rank).toBe(1);
    expect(bbb.rank).toBe(2);
  });

  it("OFF and DEF ranks are independent of each other and of the OVR rank", () => {
    const board = buildCurrentRatingBoard(
      buildInput({
        v04Board: v04Board([
          v04Team({ abbr: "aaa", team: "aaa", rating2026: 50 }),
          v04Team({ abbr: "bbb", team: "bbb", rating2026: 50 }),
        ]),
        preseasonV03: v03PreseasonArtifact([
          v03PreseasonRow({ abbr: "aaa", offenseRating: 50, defenseRating: 50 }),
          v03PreseasonRow({ abbr: "bbb", offenseRating: 50, defenseRating: 50 }),
        ]),
        performanceAnalytics: performanceArtifact([
          playedPerformanceRow("aaa", 9, 50, 80, 20), // great offense, poor defense
          playedPerformanceRow("bbb", 9, 50, 20, 80), // poor offense, great defense
        ]),
      })
    );
    const aaa = board.teams.find((t) => t.abbr === "aaa")!;
    const bbb = board.teams.find((t) => t.abbr === "bbb")!;
    expect(aaa.offenseRank).toBe(1);
    expect(bbb.offenseRank).toBe(2);
    expect(aaa.defenseRank).toBe(2);
    expect(bbb.defenseRank).toBe(1);
    // Identical OVR (50 == 50): rankByDescending's deterministic tie-break
    // (alphabetical by name) applies, not a real ordering difference.
    expect(aaa.rank).toBe(1);
    expect(bbb.rank).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Failure / fallback behavior.
// ---------------------------------------------------------------------------
describe("failure and fallback behavior", () => {
  it("throws when a v0.4 team has no matching preseason v0.3.1 row", () => {
    expect(() =>
      buildCurrentRatingBoard(
        buildInput({
          v04Board: v04Board([v04Team({ abbr: "zzz", team: "zzz" })]),
          preseasonV03: v03PreseasonArtifact([v03PreseasonRow({ abbr: "other" })]),
          performanceAnalytics: performanceArtifact([zeroPerformanceRow("zzz")]),
        })
      )
    ).toThrow(/missing required preseason v0\.3\.1 baseline/);
  });

  it("throws when a v0.4 team has no matching Performance Analytics row at all", () => {
    expect(() =>
      buildCurrentRatingBoard(
        buildInput({
          v04Board: v04Board([v04Team({ abbr: "zzz", team: "zzz" })]),
          preseasonV03: v03PreseasonArtifact([v03PreseasonRow({ abbr: "zzz" })]),
          performanceAnalytics: performanceArtifact([zeroPerformanceRow("other")]),
        })
      )
    ).toThrow(/missing required Performance Analytics row/);
  });

  it("throws (never falls back to preseason/zero/league-average) when a team has played games but its performance numbers are missing", () => {
    const brokenRow = zeroPerformanceRow("tst");
    brokenRow.gamesPlayed = 4; // claims games played...
    // ...but performance.* stays null, an internally-inconsistent artifact.
    expect(() =>
      buildCurrentRatingBoard(
        buildInput({
          v04Board: v04Board([v04Team({ abbr: "tst" })]),
          preseasonV03: v03PreseasonArtifact([v03PreseasonRow({ abbr: "tst" })]),
          performanceAnalytics: performanceArtifact([brokenRow]),
        })
      )
    ).toThrow(/performance\.performanceRating.*required/);
  });

  it("never falls back to a v0.3.1-delta calculation for any team (that code path no longer exists)", () => {
    // Structural guard: the old delta-model exports are gone from the module entirely.
    const mod = currentRatingModule as unknown as Record<string, unknown>;
    expect(mod.computeLiveV04Rating).toBeUndefined();
    expect(mod.evidenceWeightFor).toBeUndefined();
    expect(mod.EVIDENCE_WEIGHT_BY_GAMES).toBeUndefined();
    expect(mod.LiveRatingInputs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. CurrentRatingRow shape.
// ---------------------------------------------------------------------------
describe("CurrentRatingRow shape", () => {
  it("exposes the full field set while preserving .rating/.rank as universal current OVR", () => {
    const board = buildCurrentRatingBoard(buildInput());
    const row = board.teams[0];
    const expectedKeys: (keyof CurrentRatingRow)[] = [
      "abbr", "team", "division", "rating", "rank",
      "offenseRating", "offenseRank", "defenseRating", "defenseRank",
      "performanceRating", "performanceRank", "gamesPlayed",
      "preseasonWeight", "performanceWeight", "state",
      "preseasonV04Rating", "preseasonOffenseRating", "preseasonDefenseRating",
    ];
    for (const key of expectedKeys) expect(key in row).toBe(true);
  });
});
