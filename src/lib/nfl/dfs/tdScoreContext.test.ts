import { describe, expect, it } from "vitest";
import { buildDfsTdScoreContext, resolveDfsTdScore } from "@/lib/nfl/dfs/tdScoreContext";
import type { TouchdownPreviewArtifact, TouchdownWindowMetrics } from "@/lib/nfl/touchdown-preview/types";

function windowMetrics(jkbTdScore: number | null, scoreRank: number | null = 1, scorePoolSize = 10): TouchdownWindowMetrics {
  const blankMetric = { value: null, percentile: null, rank: null, poolSize: 0 };
  return {
    sampleState: "available",
    sampleGames: 8,
    sampleLabel: "8 games",
    tdPerGame: null,
    tdLast5PerGame: null,
    usagePerGame: null,
    teamUsageShare: null,
    rzOpportunitiesPerGame: null,
    inside10OpportunitiesPerGame: null,
    goalLineOpportunitiesPerGame: null,
    rzOpportunityShare: null,
    goalLineOpportunityShare: null,
    impliedTeamPoints: null,
    opponentTdOpportunitiesPerGame: null,
    opponentPositionTdsAllowedPerGame: null,
    opponentPositionTdsAllowedPerGameSeason: null,
    opponentPositionTdsAllowedPerGameSeasonSource: null,
    opponentPositionTdsAllowedPerGameLast5: null,
    opponentPositionTdsAllowedPerGameSeasonPercentile: null,
    opponentPositionTdsAllowedPerGameLast5Percentile: null,
    tdSuccessRate: null,
    components: {
      playerUsage: blankMetric,
      tdOpportunities: blankMetric,
      teamUsage: blankMetric,
      tdSuccess: blankMetric,
      opponentTdOpportunities: blankMetric,
      opponentPositionTdsAllowed: blankMetric,
      impliedTeamPoints: blankMetric,
    },
    jkbTdScore,
    scoreRank,
    scorePoolSize,
  };
}

function artifact(overrides: Partial<TouchdownPreviewArtifact> = {}): TouchdownPreviewArtifact {
  return {
    schemaVersion: "nfl-touchdown-preview-v1",
    modelVersion: "jkb-td-score-v1.0.0",
    season: 2026,
    week: 2,
    generatedAt: null,
    defaultWindow: "last8",
    sourceStatus: { playerWeekStats: "available", touchdownContext: "available", marketImpliedPoints: "available", anytimeTdOdds: "available" },
    methodology: { normalization: "", tdSuccess: "", positionAdjustment: "", componentWeights: { playerUsage: 1, tdOpportunities: 1, teamUsage: 1, tdSuccess: 1, opponentTdOpportunities: 1, opponentPositionTdsAllowed: 1, impliedTeamPoints: 1 }, opportunityWeights: { rz: 1, inside10: 1, goalLine: 1 } },
    players: [{
      playerId: "p1",
      playerName: "Test Player",
      team: "BUF",
      opponent: "MIA",
      homeAway: "home",
      position: "WR",
      gameId: "2026-02-BUF-MIA",
      kickoff: null,
      impliedTeamPoints: null,
      windows: { "2025": windowMetrics(50), "2026": windowMetrics(55), last8: windowMetrics(62.5, 3, 40) },
      playerHistory: [],
      opponentHistory: [],
    }],
    ...overrides,
  };
}

describe("buildDfsTdScoreContext", () => {
  it("joins on the artifact's default window", () => {
    const lookup = buildDfsTdScoreContext(artifact(), 2026, 2);
    expect(resolveDfsTdScore(lookup, "p1", "2026-02-BUF-MIA")).toEqual({ jkbTdScore: 62.5, scoreRank: 3, scorePoolSize: 40 });
  });

  it("returns an empty lookup for a wrong-week artifact rather than silently joining", () => {
    const lookup = buildDfsTdScoreContext(artifact(), 2026, 3);
    expect(lookup.size).toBe(0);
    expect(resolveDfsTdScore(lookup, "p1", "2026-02-BUF-MIA")).toBeNull();
  });

  it("returns null for an absent player or missing identity", () => {
    const lookup = buildDfsTdScoreContext(artifact(), 2026, 2);
    expect(resolveDfsTdScore(lookup, "unknown", "2026-02-BUF-MIA")).toBeNull();
    expect(resolveDfsTdScore(lookup, null, "2026-02-BUF-MIA")).toBeNull();
    expect(resolveDfsTdScore(lookup, "p1", null)).toBeNull();
  });

  it("returns an empty lookup when the artifact is missing", () => {
    expect(buildDfsTdScoreContext(null, 2026, 2).size).toBe(0);
  });
});
