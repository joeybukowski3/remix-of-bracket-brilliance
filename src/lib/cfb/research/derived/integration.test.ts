import { describe, expect, it } from "vitest";
import type { CfbResearchGame, CfbResearchPlay } from "../types";
import { buildPlayMetricRow } from "./playMetricRow";
import { buildTeamGameMetrics } from "./teamGameAggregation";
import { buildTeamSeasonToDateSlice } from "./seasonToDateAggregation";

/**
 * End-to-end: normalized fixture -> classification -> garbage-time policy
 * handling -> team-game metrics -> season-to-date aggregation. No live API
 * calls; all inputs are hand-built fixtures shaped like Work Unit 2 output.
 */
function makeGame(gameId: string, week: number, homeScore: number, awayScore: number): CfbResearchGame {
  return {
    gameId,
    season: 2019,
    week,
    seasonType: "regular",
    kickoffUtc: null,
    homeExternalId: "1",
    awayExternalId: "2",
    homeTeamId: "ala",
    awayTeamId: "miss",
    homeConference: "SEC",
    awayConference: "SEC",
    homeClassification: "fbs",
    awayClassification: "fbs",
    neutralSite: false,
    homeScore,
    awayScore,
    status: "final",
    gameType: "regular",
  };
}

function makePlay(
  gameId: string,
  week: number,
  overrides: Partial<CfbResearchPlay>,
): CfbResearchPlay {
  return {
    playId: `${gameId}-${overrides.playId ?? Math.random()}`,
    gameId,
    driveId: null,
    season: 2019,
    week,
    offenseExternalId: "1",
    defenseExternalId: "2",
    offenseTeamId: "ala",
    defenseTeamId: "miss",
    offenseName: "Alabama",
    defenseName: "Ole Miss",
    period: 1,
    clockMinutes: 10,
    clockSeconds: 0,
    down: 1,
    distance: 10,
    yardLine: 50,
    yardsToGoal: 50,
    yardsGained: 5,
    offenseScore: 0,
    defenseScore: 0,
    rawPlayType: "Rush",
    providerPpa: 0.15,
    providerSuccess: null,
    providerGarbageTime: null,
    providerScoringFlag: false,
    ...overrides,
  };
}

describe("Phase 1 pipeline integration: fixture -> classify -> policy -> team-game -> season-to-date", () => {
  const gameWeek1 = makeGame("g1", 1, 35, 10);
  const gameWeek2 = makeGame("g2", 2, 28, 21);

  const week1Plays: CfbResearchPlay[] = [
    makePlay("g1", 1, { playId: "1", rawPlayType: "Rush", yardsGained: 25, down: 1, distance: 10 }), // explosive rush, success
    makePlay("g1", 1, { playId: "2", rawPlayType: "Pass Reception", yardsGained: 3, down: 2, distance: 10, providerPpa: -0.1 }),
    makePlay("g1", 1, { playId: "3", rawPlayType: "Punt", yardsGained: 40, providerPpa: null }), // ineligible
    makePlay("g1", 1, { playId: "4", rawPlayType: "Penalty", providerPpa: null }), // ineligible
  ];

  const week2Plays: CfbResearchPlay[] = [
    makePlay("g2", 2, { playId: "1", rawPlayType: "Rush", yardsGained: 4, down: 1, distance: 10 }),
    makePlay("g2", 2, { playId: "2", rawPlayType: "Sack", yardsGained: -7, down: 2, distance: 6, providerPpa: -1.1 }),
  ];

  function toTeamGame(game: CfbResearchGame, plays: CfbResearchPlay[]) {
    const rows = plays.map((play) => buildPlayMetricRow({ play, playText: null }));
    return buildTeamGameMetrics({
      game,
      teamExternalId: "1",
      teamId: "ala",
      opponentExternalId: "2",
      opponentTeamId: "miss",
      classification: "fbs",
      opponentClassification: "fbs",
      homeAwayNeutral: "home",
      finalTeamScore: game.homeScore,
      offensivePlays: rows,
      totalNormalizedPlayCount: plays.length,
      identityResolutionPct: 100,
    });
  }

  it("classifies plays and excludes ineligible categories from the eligible count", () => {
    const teamGame1 = toTeamGame(gameWeek1, week1Plays);
    expect(teamGame1.totalNormalizedPlays).toBe(4);
    expect(teamGame1.eligibleScrimmagePlays).toBe(2); // punt + penalty excluded
  });

  it("computes team-game metrics for two separate weeks independently", () => {
    const teamGame1 = toTeamGame(gameWeek1, week1Plays);
    const teamGame2 = toTeamGame(gameWeek2, week2Plays);
    expect(teamGame1.policyVariants.NONE.ypp).toBe(14); // (25+3)/2
    expect(teamGame2.policyVariants.NONE.ypp).toBe(-1.5); // (4-7)/2
    expect(teamGame1.policyVariants.NONE.explosivePlayRate).toBeCloseTo(0.5, 5); // 1 explosive rush of 2
  });

  it("aggregates both weeks into a season-to-date slice through week 3", () => {
    const teamGame1 = toTeamGame(gameWeek1, week1Plays);
    const teamGame2 = toTeamGame(gameWeek2, week2Plays);
    const slice = buildTeamSeasonToDateSlice(
      "1",
      "ala",
      2019,
      3,
      "playWeighted",
      "NONE",
      [teamGame1, teamGame2],
    );
    expect(slice.gamesIncluded).toBe(2);
    // (14*2 + -1.5*2) / 4 = 6.25
    expect(slice.metrics.ypp).toBeCloseTo(6.25, 5);
  });

  it("a week-2-only slice (throughWeekExclusive=2) excludes the week-2 game itself", () => {
    const teamGame1 = toTeamGame(gameWeek1, week1Plays);
    const teamGame2 = toTeamGame(gameWeek2, week2Plays);
    const slice = buildTeamSeasonToDateSlice(
      "1",
      "ala",
      2019,
      2,
      "gameWeighted",
      "NONE",
      [teamGame1, teamGame2],
    );
    expect(slice.gamesIncluded).toBe(1);
    expect(slice.metrics.ypp).toBe(14);
  });
});
