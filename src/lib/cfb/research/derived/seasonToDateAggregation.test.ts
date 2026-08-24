import { describe, expect, it } from "vitest";
import { buildTeamSeasonToDateSlice } from "./seasonToDateAggregation";
import type { CfbDerivedTeamGameMetrics, CfbGarbageTimePolicyMetrics } from "./types";

function policyMetrics(overrides: Partial<CfbGarbageTimePolicyMetrics>): CfbGarbageTimePolicyMetrics {
  return {
    policy: "NONE",
    includedPlayCount: 0,
    totalWeight: 0,
    ypp: null,
    ppp: null,
    ppaPerPlay: null,
    ppaCoveredPlayCount: 0,
    ppaCoveragePct: 0,
    ppaSuccessRate: null,
    earlyDownPpaSuccessRate: null,
    passingDownPpaSuccessRate: null,
    downDistanceSuccessRate: null,
    earlyDownDownDistanceSuccessRate: null,
    passingDownDownDistanceSuccessRate: null,
    explosivePlayRate: null,
    explosivePassRate: null,
    explosiveRushRate: null,
    secondsPerPlay: null,
    ...overrides,
  };
}

function teamGame(week: number, ypp: number, totalWeight: number): CfbDerivedTeamGameMetrics {
  return {
    season: 2019,
    week,
    gameId: `g${week}`,
    teamExternalId: "1",
    teamId: "ala",
    opponentExternalId: "2",
    opponentTeamId: "miss",
    classification: "fbs",
    opponentClassification: "fbs",
    homeAwayNeutral: "home",
    matchupPopulation: "fbs_vs_fbs",
    totalNormalizedPlays: totalWeight,
    eligibleScrimmagePlays: totalWeight,
    ppaCoveredEligiblePlays: totalWeight,
    ppaCoveragePct: 100,
    identityResolutionPct: 100,
    metricsAvailable: true,
    situationNeutralSecondsPerPlay: null,
    situationNeutralPlayCount: 0,
    policyVariants: {
      NONE: policyMetrics({ ypp, totalWeight, includedPlayCount: totalWeight }),
      SCORE_QUARTER: policyMetrics({ ypp, totalWeight, includedPlayCount: totalWeight }),
      SOFT_WEIGHT: policyMetrics({ ypp, totalWeight, includedPlayCount: totalWeight }),
      LEVERAGE: null,
    },
  };
}

describe("buildTeamSeasonToDateSlice — playWeighted vs gameWeighted", () => {
  // Game A: 90 plays at 8.0 ypp. Game B: 30 plays at 2.0 ypp.
  const games = [teamGame(1, 8.0, 90), teamGame(2, 2.0, 30)];

  it("playWeighted lets the higher-play-count game dominate the combined rate", () => {
    const slice = buildTeamSeasonToDateSlice("1", "ala", 2019, 3, "playWeighted", "NONE", games);
    // (8*90 + 2*30) / 120 = 6.5
    expect(slice.metrics.ypp).toBeCloseTo(6.5, 5);
    expect(slice.gamesIncluded).toBe(2);
  });

  it("gameWeighted treats both games equally regardless of play volume", () => {
    const slice = buildTeamSeasonToDateSlice("1", "ala", 2019, 3, "gameWeighted", "NONE", games);
    expect(slice.metrics.ypp).toBeCloseTo(5.0, 5); // (8+2)/2
  });

  it("only includes games strictly before throughWeekExclusive", () => {
    const slice = buildTeamSeasonToDateSlice("1", "ala", 2019, 2, "gameWeighted", "NONE", games);
    expect(slice.gamesIncluded).toBe(1);
    expect(slice.metrics.ypp).toBe(8.0);
  });

  it("only includes the requested team's games", () => {
    const otherTeamGame = { ...teamGame(1, 100, 10), teamExternalId: "999" };
    const slice = buildTeamSeasonToDateSlice("1", "ala", 2019, 3, "gameWeighted", "NONE", [
      ...games,
      otherTeamGame,
    ]);
    expect(slice.gamesIncluded).toBe(2);
  });
});
