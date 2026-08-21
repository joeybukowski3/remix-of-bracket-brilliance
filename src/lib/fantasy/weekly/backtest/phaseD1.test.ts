import { describe, expect, it } from "vitest";
import type { PregameFeatureSnapshot } from "./features";
import {
  assertHistoricalCutoffs,
  historicalTransitionScore,
  PHASE_D1_PREREGISTRATION,
  selectSharedHistoryThreshold,
} from "./phaseD1";

function row(overrides: Partial<PregameFeatureSnapshot> = {}): PregameFeatureSnapshot {
  return {
    schemaVersion: "weekly-backtest-features-v1",
    season: 2024,
    week: 4,
    playerId: "gsis:player",
    playerName: "Player",
    position: "RB",
    team: "buf",
    opponent: "mia",
    actualFantasyPoints: 12,
    baseline: {
      priorSeasonPpg: 10,
      rollingPpg: { last1: 14, last3: 13, last5: 13, seasonToDate: 13, priorGames: 2, availableGames: 2 },
    },
    usage: Object.fromEntries(["snapShare", "passAttempts", "rushAttempts", "targets", "receptions", "targetShare", "airYardsShare"].map((key) => [key, { last1: null, last3: null, last5: null, seasonToDate: null, priorGames: 2, availableGames: 0 }])) as PregameFeatureSnapshot["usage"],
    matchup: { priorSeasonFpaPerGame: null, priorSeasonFpaRank: null, currentSeasonFpaPerGame: null, currentSeasonFpaRank: null },
    teamEnvironment: { offensiveEpaPerPlay: null, passingEpaPerPlay: null, rushingEpaPerPlay: null, playsPerGame: null, opponentEpaAllowedPerPlay: null },
    market: { gameTotal: null, teamImpliedTotal: null, opponentImpliedTotal: null, homeSpread: null, source: null, capturedAt: null, excludedReason: "missing" },
    cutoffs: { playerHistoryLatest: { season: 2024, week: 3 }, matchupHistoryLatest: null, teamHistoryLatest: null },
    missingFeatures: [],
    ...overrides,
  };
}

describe("Phase D1 transition research", () => {
  it("freezes preregistration so transition candidates cannot drift", () => {
    expect(Object.isFrozen(PHASE_D1_PREREGISTRATION)).toBe(true);
    expect(Object.isFrozen(PHASE_D1_PREREGISTRATION.transitionCandidates)).toBe(true);
  });

  it("uses the prior proxy below the player-game threshold", () => {
    expect(historicalTransitionScore(row(), 3)).toEqual({ score: 10, authority: "historical-prior-season-proxy" });
  });

  it("switches using player games at the threshold", () => {
    expect(historicalTransitionScore(row({ baseline: { priorSeasonPpg: 10, rollingPpg: { last1: 14, last3: 13, last5: 13, seasonToDate: 13, priorGames: 3, availableGames: 3 } } }), 3))
      .toEqual({ score: 13, authority: "current-season" });
  });

  it("does not invent a score when the historical proxy is missing", () => {
    expect(historicalTransitionScore(row({ baseline: { priorSeasonPpg: null, rollingPpg: { last1: null, last3: null, last5: null, seasonToDate: null, priorGames: 0, availableGames: 0 } } }), 3).authority).toBe("unavailable");
  });

  it("rejects 2025 rows from threshold selection", () => {
    expect(() => selectSharedHistoryThreshold([row({ season: 2025 })])).toThrow(/holdout isolation/);
  });

  it("accepts only strictly prior player-history cutoffs", () => {
    expect(() => assertHistoricalCutoffs([row()])).not.toThrow();
    expect(() => assertHistoricalCutoffs([row({ cutoffs: { playerHistoryLatest: { season: 2024, week: 4 }, matchupHistoryLatest: null, teamHistoryLatest: null } })])).toThrow(/leakage/);
  });

  it("does not contain or activate a usage candidate", () => {
    expect(JSON.stringify(PHASE_D1_PREREGISTRATION)).not.toMatch(/baseline-usage|usageAdjustment|weeklyScore/);
  });

  it("freezes position-specific decision thresholds", () => {
    expect(PHASE_D1_PREREGISTRATION.decisionThresholds).toEqual({ QB: 12, RB: 24, WR: 24, TE: 12 });
  });
});
