import { describe, expect, it } from "vitest";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { buildTrainingDataset, buildTrainingRow, type HistoricalTeamGameRow, type ScheduleTeamWeek, type UniverseCandidate } from "./build";
import { WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION } from "./contract";

function statLine(overrides: Partial<HistoricalPlayerWeek["stats"]> = {}): HistoricalPlayerWeek["stats"] {
  return {
    passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0,
    rushAttempts: 0, rushingYards: 0, rushingTouchdowns: 0, receptions: 0, targets: 0,
    receivingYards: 0, receivingTouchdowns: 0, sackFumblesLost: 0, rushingFumblesLost: 0,
    receivingFumblesLost: 0, fumblesLost: 0, passingTwoPointConversions: 0,
    rushingTwoPointConversions: 0, receivingTwoPointConversions: 0, specialTeamsTouchdowns: 0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<HistoricalPlayerWeek> & { season: number; week: number }): HistoricalPlayerWeek {
  return {
    playerId: "gsis:test",
    playerName: "Test Player",
    position: "WR",
    team: "kc",
    opponent: "buf",
    externalIds: { gsis: "test", pfr: null, espn: null },
    actualFantasyPoints: 10,
    stats: statLine(),
    usage: {
      offensiveSnaps: null, snapShare: null, passAttempts: null, completions: null, rushAttempts: null,
      targets: null, receptions: null, receivingAirYards: null, targetShare: null, airYardsShare: null,
      routes: null, routeParticipation: null, redZoneTouches: null, goalLineTouches: null, redZoneTargets: null,
    },
    provenance: {
      source: "nflverse stats_player weekly", sourceSeason: overrides.season, sourceWeek: overrides.week,
      scoringVersion: "jkb-full-ppr-v1.0.0", snapSource: null,
    },
    ...overrides,
  };
}

const teamHistory: HistoricalTeamGameRow[] = [
  { season: 2023, week: 1, team: "kc", opponent: "det", offEpa: 5, offPlays: 60, passEpa: 3, passPlays: 35, rushEpa: 2, rushPlays: 25 },
  { season: 2023, week: 2, team: "kc", opponent: "jax", offEpa: 4, offPlays: 58, passEpa: 2, passPlays: 30, rushEpa: 2, rushPlays: 28 },
  { season: 2023, week: 1, team: "det", opponent: "kc", offEpa: 1, offPlays: 55, passEpa: 0.5, passPlays: 30, rushEpa: 0.5, rushPlays: 25 },
  { season: 2023, week: 2, team: "buf", opponent: "was", offEpa: 3, offPlays: 62, passEpa: 2, passPlays: 34, rushEpa: 1, rushPlays: 28 },
];

const schedule: ScheduleTeamWeek[] = [
  { season: 2023, week: 3, team: "kc", opponent: "buf", homeAway: "home", kickoff: "2023-09-24", restDays: 7 },
];

describe("buildTrainingRow leakage invariants", () => {
  const history: HistoricalPlayerWeek[] = [
    makeRow({ season: 2022, week: 10, actualFantasyPoints: 8, stats: statLine({ targets: 5, receptions: 3, receivingYards: 40 }) }),
    makeRow({ season: 2022, week: 11, actualFantasyPoints: 12, stats: statLine({ targets: 7, receptions: 5, receivingYards: 60 }) }),
    makeRow({ season: 2023, week: 1, actualFantasyPoints: 14, stats: statLine({ targets: 8, receptions: 6, receivingYards: 90 }) }),
    makeRow({ season: 2023, week: 2, actualFantasyPoints: 6, stats: statLine({ targets: 4, receptions: 2, receivingYards: 20 }) }),
    // The target week itself — must never leak into any N-1 feature.
    makeRow({ season: 2023, week: 3, actualFantasyPoints: 999, stats: statLine({ targets: 999, receptions: 999, receivingYards: 999 }) }),
  ];
  const target: UniverseCandidate = {
    season: 2023, week: 3, playerId: "gsis:test", playerName: "Test Player",
    position: "WR", team: "kc", opponent: "buf", eligible: true,
  };
  const row = buildTrainingRow(target, history, teamHistory, schedule, () => null, "2026-01-01T00:00:00Z");

  it("excludes the target week from rolling season-to-date features", () => {
    expect(row.gamesPlayedPrior).toBe(2);
    expect(row.seasonPpgPrior).toBeCloseTo((14 + 6) / 2);
    expect(row.targetsSeasonPrior).toBeCloseTo((8 + 4) / 2);
  });

  it("excludes the target week from last-3 rolling features", () => {
    expect(row.last3PpgPrior).toBeCloseTo((14 + 6) / 2);
    expect(row.targetsLast3).toBeCloseTo((8 + 4) / 2);
  });

  it("uses only the previous NFL season for prior-season aggregates", () => {
    expect(row.hasPriorSeason).toBe(true);
    expect(row.priorSeasonGames).toBe(2);
    expect(row.priorSeasonPpg).toBeCloseTo((8 + 12) / 2);
  });

  it("uses actual outcome only for the target week's realized points, not for features", () => {
    expect(row.actualFantasyPoints).toBe(999);
    // None of the feature fields may equal the target-week stat values.
    expect(row.targetsSeasonPrior).not.toBe(999);
    expect(row.last3PpgPrior).not.toBe(999);
  });

  it("computes team EPA only from games strictly before the target week", () => {
    // kc games before week 3: week1 (5/60) + week2 (4/58) => (5+4)/(60+58)
    expect(row.teamOffensiveEpaPrior).toBeCloseTo((5 + 4) / (60 + 58));
  });

  it("stamps the frozen schema version", () => {
    expect(row.schemaVersion).toBe(WEEKLY_FANTASY_PROJECTION_TRAINING_ROW_SCHEMA_VERSION);
  });

  it("marks eligible-but-scoreless players as zero-point rows, not excluded", () => {
    const zeroTarget: UniverseCandidate = {
      season: 2023, week: 4, playerId: "gsis:bench", playerName: "Bench Player",
      position: "WR", team: "kc", opponent: "det", eligible: true,
    };
    const zeroRow = buildTrainingRow(zeroTarget, history, teamHistory, schedule, () => null, "2026-01-01T00:00:00Z");
    expect(zeroRow.historicalUniverseEligible).toBe(true);
    expect(zeroRow.actualFantasyPoints).toBe(0);
  });
});

describe("projectionCandidate (leakage-safe N-1 usage signal)", () => {
  const history: HistoricalPlayerWeek[] = [
    makeRow({ season: 2022, week: 10, actualFantasyPoints: 8 }),
    makeRow({ season: 2023, week: 1, actualFantasyPoints: 14 }),
  ];

  it("is true when the player has prior-season rows even with no current-season rows yet", () => {
    const target: UniverseCandidate = {
      season: 2023, week: 1, playerId: "gsis:test", playerName: "Test Player",
      position: "WR", team: "kc", opponent: "buf", eligible: true,
    };
    const row = buildTrainingRow(target, history, teamHistory, schedule, () => null, "2026-01-01T00:00:00Z");
    expect(row.projectionCandidate).toBe(true);
  });

  it("is true when the player has strictly-prior current-season rows even with no prior season", () => {
    const target: UniverseCandidate = {
      season: 2023, week: 2, playerId: "gsis:test", playerName: "Test Player",
      position: "WR", team: "kc", opponent: "buf", eligible: true,
    };
    const rookieHistory: HistoricalPlayerWeek[] = [
      makeRow({ season: 2023, week: 1, actualFantasyPoints: 5 }),
    ];
    const row = buildTrainingRow(target, rookieHistory, teamHistory, schedule, () => null, "2026-01-01T00:00:00Z");
    expect(row.projectionCandidate).toBe(true);
  });

  it("is false for a true first-appearance rookie with no prior-season and no current-season history", () => {
    const target: UniverseCandidate = {
      season: 2023, week: 1, playerId: "gsis:brandnew", playerName: "Brand New",
      position: "WR", team: "kc", opponent: "buf", eligible: true,
    };
    const row = buildTrainingRow(target, [], teamHistory, schedule, () => null, "2026-01-01T00:00:00Z");
    expect(row.projectionCandidate).toBe(false);
  });

  it("never inspects the target week's own row when deciding candidacy", () => {
    const leakHistory: HistoricalPlayerWeek[] = [
      makeRow({ season: 2023, week: 3, actualFantasyPoints: 999 }),
    ];
    const target: UniverseCandidate = {
      season: 2023, week: 3, playerId: "gsis:test", playerName: "Test Player",
      position: "WR", team: "kc", opponent: "buf", eligible: true,
    };
    const row = buildTrainingRow(target, leakHistory, teamHistory, schedule, () => null, "2026-01-01T00:00:00Z");
    expect(row.projectionCandidate).toBe(false);
  });
});

describe("buildTrainingRow rookie / no-prior-history handling", () => {
  it("leaves prior fields null rather than imputing zero for rookies", () => {
    const rookieHistory: HistoricalPlayerWeek[] = [
      makeRow({ season: 2023, week: 1, actualFantasyPoints: 5 }),
    ];
    const rookieTarget: UniverseCandidate = {
      season: 2023, week: 2, playerId: "gsis:test", playerName: "Test Player",
      position: "WR", team: "kc", opponent: "buf", eligible: true,
    };
    const row = buildTrainingRow(rookieTarget, rookieHistory, [], [], () => null, "2026-01-01T00:00:00Z");
    expect(row.hasPriorSeason).toBe(false);
    expect(row.rookieOrNoPriorHistory).toBe(true);
    expect(row.priorSeasonPpg).toBeNull();
    expect(row.priorSeasonGames).toBeNull();
  });
});

describe("no 2025 usage anywhere resembling model-selection code in this module", () => {
  it("does not reference season 2025 as a literal in build.ts source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.resolve(__dirname, "build.ts"), "utf8");
    expect(source.includes("2025")).toBe(false);
  });
});

describe("buildTrainingDataset", () => {
  it("stamps every row with the same provided provenance and never mutates inputs", () => {
    const history: HistoricalPlayerWeek[] = [
      makeRow({ season: 2023, week: 1, actualFantasyPoints: 5 }),
    ];
    const candidates: UniverseCandidate[] = [
      { season: 2023, week: 1, playerId: "gsis:test", playerName: "Test Player", position: "WR", team: "kc", opponent: "buf", eligible: true },
    ];
    const provenance = { generatedAt: "2026-01-01T00:00:00Z", sourceManifests: [], scheduleSource: { url: "x", retrievedAtUtc: "y", sha256: "z" } };
    const frozenHistory = Object.freeze([...history]);
    const rows = buildTrainingDataset(candidates, frozenHistory, [], [], () => null, "2026-01-01T00:00:00Z", provenance);
    expect(rows).toHaveLength(1);
    expect(rows[0].provenance).toEqual(provenance);
  });
});
