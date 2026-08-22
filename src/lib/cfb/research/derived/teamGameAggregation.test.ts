import { describe, expect, it } from "vitest";
import type { CfbResearchGame, CfbResearchPlay } from "../types";
import { buildPlayMetricRow } from "./playMetricRow";
import { buildTeamGameMetrics } from "./teamGameAggregation";

const GAME: CfbResearchGame = {
  gameId: "g1",
  season: 2019,
  week: 5,
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
  homeScore: 42,
  awayScore: 14,
  status: "final",
  gameType: "regular",
};

function play(overrides: Partial<CfbResearchPlay>): CfbResearchPlay {
  return {
    playId: "p",
    gameId: "g1",
    driveId: null,
    season: 2019,
    week: 5,
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
    providerPpa: 0.2,
    providerSuccess: null,
    providerGarbageTime: null,
    providerScoringFlag: false,
    ...overrides,
  };
}

describe("buildTeamGameMetrics", () => {
  it("aggregates ypp/ppp/ppa across eligible plays under the NONE policy", () => {
    const plays = [
      play({ playId: "1", yardsGained: 4, providerPpa: 0.1 }),
      play({ playId: "2", yardsGained: 6, providerPpa: 0.3 }),
      play({ playId: "3", rawPlayType: "Punt", yardsGained: 40, providerPpa: null }), // ineligible
    ].map((p) => buildPlayMetricRow({ play: p, playText: null }));

    const result = buildTeamGameMetrics({
      game: GAME,
      teamExternalId: "1",
      teamId: "ala",
      opponentExternalId: "2",
      opponentTeamId: "miss",
      classification: "fbs",
      opponentClassification: "fbs",
      homeAwayNeutral: "home",
      finalTeamScore: 42,
      offensivePlays: plays,
      totalNormalizedPlayCount: 3,
      identityResolutionPct: 100,
    });

    expect(result.eligibleScrimmagePlays).toBe(2);
    expect(result.policyVariants.NONE.ypp).toBe(5); // (4+6)/2
    expect(result.policyVariants.NONE.ppaPerPlay).toBeCloseTo(0.2, 5);
    expect(result.policyVariants.NONE.ppp).toBe(21); // 42 / 2 eligible plays
  });

  it("never imputes missing PPA as zero — coverage reflects the null rows", () => {
    const plays = [
      play({ playId: "1", providerPpa: 0.5 }),
      play({ playId: "2", providerPpa: null }),
    ].map((p) => buildPlayMetricRow({ play: p, playText: null }));

    const result = buildTeamGameMetrics({
      game: GAME,
      teamExternalId: "1",
      teamId: "ala",
      opponentExternalId: "2",
      opponentTeamId: "miss",
      classification: "fbs",
      opponentClassification: "fbs",
      homeAwayNeutral: "home",
      finalTeamScore: 42,
      offensivePlays: plays,
      totalNormalizedPlayCount: 2,
      identityResolutionPct: 100,
    });

    expect(result.policyVariants.NONE.ppaPerPlay).toBe(0.5); // mean over the ONE covered play, not averaged with a fabricated 0
    expect(result.policyVariants.NONE.ppaCoveredPlayCount).toBe(1);
    expect(result.policyVariants.NONE.ppaCoveragePct).toBe(50);
  });

  it("flags metricsAvailable false when PPA coverage is below the configured minimum", () => {
    const plays = [
      play({ playId: "1", providerPpa: null }),
      play({ playId: "2", providerPpa: null }),
      play({ playId: "3", providerPpa: 0.1 }),
    ].map((p) => buildPlayMetricRow({ play: p, playText: null }));

    const result = buildTeamGameMetrics({
      game: GAME,
      teamExternalId: "1",
      teamId: "ala",
      opponentExternalId: "2",
      opponentTeamId: "miss",
      classification: "fbs",
      opponentClassification: "fbs",
      homeAwayNeutral: "home",
      finalTeamScore: 42,
      offensivePlays: plays,
      totalNormalizedPlayCount: 3,
      identityResolutionPct: 100,
    });

    expect(result.ppaCoveragePct).toBeCloseTo(33.33, 1);
    expect(result.metricsAvailable).toBe(false); // below 50% configured minimum
  });

  it("produces smaller SCORE_QUARTER included-play counts than NONE when a blowout margin applies", () => {
    const plays = [
      play({ playId: "1", period: 4, offenseScore: 60, defenseScore: 0, yardsGained: 5 }),
      play({ playId: "2", period: 1, offenseScore: 0, defenseScore: 0, yardsGained: 5 }),
    ].map((p) => buildPlayMetricRow({ play: p, playText: null }));

    const result = buildTeamGameMetrics({
      game: GAME,
      teamExternalId: "1",
      teamId: "ala",
      opponentExternalId: "2",
      opponentTeamId: "miss",
      classification: "fbs",
      opponentClassification: "fbs",
      homeAwayNeutral: "home",
      finalTeamScore: 42,
      offensivePlays: plays,
      totalNormalizedPlayCount: 2,
      identityResolutionPct: 100,
    });

    expect(result.policyVariants.NONE.includedPlayCount).toBe(2);
    expect(result.policyVariants.SCORE_QUARTER.includedPlayCount).toBe(1); // Q4 60-0 play excluded
    expect(result.policyVariants.LEVERAGE).toBeNull();
  });
});
