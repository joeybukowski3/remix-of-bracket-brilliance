import { describe, expect, it } from "vitest";
import { aggregateTeamSeasonStats, type CfbTeamGameStatRow } from "./aggregateSeasonStats";
import type { CfbGameTeamStatLine } from "./parseGameTeamStats";

function line(overrides: Partial<CfbGameTeamStatLine>): CfbGameTeamStatLine {
  return {
    totalYards: null,
    rushingYards: null,
    rushingAttempts: null,
    passingYards: null,
    passCompletions: null,
    passAttempts: null,
    offensivePlays: null,
    thirdDownConversions: null,
    thirdDownAttempts: null,
    turnovers: null,
    ...overrides,
  };
}

function row(overrides: Partial<CfbTeamGameStatRow>): CfbTeamGameStatRow {
  return {
    gameId: "g1",
    teamId: "test",
    points: null,
    opponentPoints: null,
    own: line({}),
    opponent: line({}),
    ...overrides,
  };
}

describe("aggregateTeamSeasonStats", () => {
  it("returns an all-null, zero-game row for no games", () => {
    const stats = aggregateTeamSeasonStats("test", []);
    expect(stats.gamesPlayed).toBe(0);
    expect(stats.pointsPerGame).toBeNull();
    expect(stats.yardsPerPlay).toBeNull();
    expect(stats.thirdDownPct).toBeNull();
  });

  it("aggregates points/game from summed totals over games played", () => {
    const stats = aggregateTeamSeasonStats("test", [
      row({ points: 21 }),
      row({ points: 35 }),
      row({ points: 14 }),
    ]);
    expect(stats.gamesPlayed).toBe(3);
    expect(stats.pointsPerGame).toBeCloseTo(70 / 3);
  });

  it("computes yards/play from summed yards over summed plays, not averaged per-game rates", () => {
    // Game A: 300 yards / 60 plays = 5.0 ypp. Game B: 100 yards / 50 plays = 2.0 ypp.
    // Averaging per-game rates would give 3.5; weighted total gives 400/110.
    const stats = aggregateTeamSeasonStats("test", [
      row({ own: line({ totalYards: 300, offensivePlays: 60 }) }),
      row({ own: line({ totalYards: 100, offensivePlays: 50 }) }),
    ]);
    expect(stats.yardsPerPlay).toBeCloseTo(400 / 110);
  });

  it("computes points/play from summed points over summed plays", () => {
    const stats = aggregateTeamSeasonStats("test", [
      row({ points: 21, own: line({ offensivePlays: 60 }) }),
      row({ points: 14, own: line({ offensivePlays: 50 }) }),
    ]);
    expect(stats.pointsPerPlay).toBeCloseTo(35 / 110);
  });

  it("computes third-down % from summed conversions over summed attempts", () => {
    const stats = aggregateTeamSeasonStats("test", [
      row({ own: line({ thirdDownConversions: 4, thirdDownAttempts: 11 }) }),
      row({ own: line({ thirdDownConversions: 6, thirdDownAttempts: 9 }) }),
    ]);
    expect(stats.thirdDownPct).toBeCloseTo(10 / 20);
  });

  it("computes completion % from summed completions over summed pass attempts", () => {
    const stats = aggregateTeamSeasonStats("test", [
      row({ own: line({ passCompletions: 11, passAttempts: 15 }) }),
      row({ own: line({ passCompletions: 20, passAttempts: 30 }) }),
    ]);
    expect(stats.completionPct).toBeCloseTo(31 / 45);
  });

  it("computes yards/rush and yards/pass from summed yards over summed attempts", () => {
    const stats = aggregateTeamSeasonStats("test", [
      row({ own: line({ rushingYards: 207, rushingAttempts: 43, passingYards: 143, passAttempts: 15 }) }),
    ]);
    expect(stats.yardsPerRush).toBeCloseTo(207 / 43);
    expect(stats.yardsPerPass).toBeCloseTo(143 / 15);
  });

  it("sums turnovers and mirrors opponent turnovers into takeaways", () => {
    const stats = aggregateTeamSeasonStats("test", [
      row({ own: line({ turnovers: 2 }), opponent: line({ turnovers: 3 }) }),
      row({ own: line({ turnovers: 1 }), opponent: line({ turnovers: 0 }) }),
    ]);
    expect(stats.turnovers).toBe(3);
    expect(stats.takeaways).toBe(3);
  });

  it("aggregates defensive/opponent fields from the opponent row, not the team's own", () => {
    const stats = aggregateTeamSeasonStats("test", [
      row({
        opponentPoints: 10,
        opponent: line({
          totalYards: 300,
          offensivePlays: 60,
          thirdDownConversions: 3,
          thirdDownAttempts: 10,
          passCompletions: 12,
          passAttempts: 20,
        }),
      }),
    ]);
    expect(stats.pointsAllowedPerGame).toBe(10);
    expect(stats.yardsPerPlayAllowed).toBeCloseTo(5);
    expect(stats.opponentThirdDownPct).toBeCloseTo(0.3);
    expect(stats.opponentCompletionPct).toBeCloseTo(0.6);
  });

  it("leaves a ratio null when its denominator is entirely missing", () => {
    const stats = aggregateTeamSeasonStats("test", [row({ points: 10, own: line({}) })]);
    expect(stats.pointsPerGame).toBe(10);
    expect(stats.yardsPerPlay).toBeNull();
    expect(stats.thirdDownPct).toBeNull();
  });
});
