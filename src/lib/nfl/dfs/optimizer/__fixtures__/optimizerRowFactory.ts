import { createEmptyWeeklyFantasyResearchContext } from "@/lib/fantasy/weekly/researchContext";
import type { WeeklyFantasyResearchContext, WeeklyResearchMetric } from "@/lib/fantasy/weekly/researchContext";
import type { FantasyMatchupEdges, NflMatchupEdge } from "@/lib/nfl/matchupEdges";
import type { DstMatchup } from "@/lib/nfl/dfs/dstMatchup";
import type { DfsRoleContext } from "@/lib/nfl/dfs/roleContext";
import type { DfsEnrichedDstRow, DfsEnrichedOffensiveRow } from "@/lib/nfl/dfs/slateAnalyzer";

/** Test-only builders for WU8 optimizer fixtures. Never used by production code. */

export type OffensiveFixture = {
  dkId: string;
  position: "QB" | "RB" | "WR" | "TE";
  team: string;
  gameKey: string;
  salary: number;
  projectedFantasyPoints: number;
  dkAvgPointsPerGame?: number | null;
  matchupScore?: number | null;
  impliedTeamTotal?: number | null;
  yardsPerCarry?: number | null;
  touchesTotal?: number | null;
  airYardsPerGame?: number | null;
  targetShare?: number | null;
  targetsPerGame?: number | null;
  projectedCarries?: number | null;
  projectedTargets?: number | null;
  roleClass?: DfsRoleContext["roleClass"];
  roleCertainty?: DfsRoleContext["roleCertainty"];
  researchAvailable?: boolean;
  /**
   * Defaults to 9 -- comfortably inside every DFS_POSITION_RANK_CAPS cap, and
   * intentionally above 3 so it never collides with a rendered RB1/RB2/WR1/
   * WR2/WR3 roster-slot label in tests that assert on that text.
   */
  jkbWeeklyPositionRank?: number | null;
  dkStatus?: string | null;
};

function metric(value: number | null, sampleSize = 5): WeeklyResearchMetric {
  return { value, rank: null, poolSize: 0, sampleSize: value == null ? 0 : sampleSize, sampleSeason: 2025, games: [] };
}

function edge(score: number | null): NflMatchupEdge {
  return {
    score,
    offenseRank: null,
    defenseRank: null,
    rankDifference: null,
    offense: null,
    defense: null,
    source: "fixture",
    sampleLabel: "fixture",
  };
}

function researchContext(fixture: OffensiveFixture): WeeklyFantasyResearchContext {
  const base = createEmptyWeeklyFantasyResearchContext();
  return {
    ...base,
    evidence: {
      ...base.evidence,
      yardsPerCarry: metric(fixture.yardsPerCarry ?? null),
      touches: metric(fixture.touchesTotal ?? null),
      airYardsPerGame: metric(fixture.airYardsPerGame ?? null),
      targetShare: metric(fixture.targetShare ?? null),
      targetsPerGame: metric(fixture.targetsPerGame ?? null),
    },
  };
}

function roleContext(fixture: OffensiveFixture): DfsRoleContext {
  return {
    optimizerEligibility: "eligible",
    optimizerEligible: true,
    roleClass: fixture.roleClass ?? "primary",
    roleCertainty: fixture.roleCertainty ?? "sourced",
    availability: "active",
    starterEvidence: "unavailable",
    depthRank: 1,
    projectedUsage: { carries: fixture.projectedCarries ?? null, targets: fixture.projectedTargets ?? null },
    usageEvidence: [],
    projectionThresholdResult: "pass",
    usageThresholdResult: "pass",
    reasonCodes: [],
    sourceReferences: [],
    asOf: "2026-09-07T23:55:00Z",
    policyVersion: "fixture",
  };
}

export function buildOffensiveRow(fixture: OffensiveFixture): DfsEnrichedOffensiveRow {
  const edges: FantasyMatchupEdges = {
    mode: fixture.position === "RB" ? "rush" : "pass",
    trenches: edge(fixture.matchupScore ?? null),
    epa: edge(fixture.matchupScore ?? null),
    success: edge(fixture.matchupScore ?? null),
  };
  const available = fixture.researchAvailable !== false;

  return {
    kind: "offense",
    dkId: fixture.dkId,
    playerName: "Player " + fixture.dkId,
    position: fixture.position,
    rosterPosition: fixture.position + "/FLEX",
    salary: fixture.salary,
    team: fixture.team,
    game: null,
    gameInfoRaw: fixture.gameKey,
    dkAvgPointsPerGame: fixture.dkAvgPointsPerGame === undefined ? 10 : fixture.dkAvgPointsPerGame,
    dkStatus: fixture.dkStatus === undefined ? null : fixture.dkStatus,
    identityStatus: "resolved",
    playerId: "gsis:" + fixture.dkId,
    identityConflict: false,
    projectedFantasyPoints: fixture.projectedFantasyPoints,
    projectionSource: "JKB Full PPR",
    jkbWeeklyPositionRank: fixture.jkbWeeklyPositionRank === undefined ? 9 : fixture.jkbWeeklyPositionRank,
    jkbSlatePositionRank: null,
    jkbOverallSlateProjectionRank: null,
    dkPositionSalaryRank: 1,
    dkOverallSalaryRank: 1,
    posRankDiff: null,
    overallRankDiff: null,
    pointsPer1k: (fixture.projectedFantasyPoints / fixture.salary) * 1000,
    slateEligible: true,
    optimizerEligibility: "eligible",
    roleContext: roleContext(fixture),
    eligibilityReasons: [],
    research: available
      ? { status: "available", context: researchContext(fixture), matchupEdges: edges, matchupGrade: null }
      : { status: "missing", context: null, matchupEdges: null, matchupGrade: null },
    teamMismatchStatus: "none",
    opponent: "opp",
    homeAway: "home",
    canonicalGameId: fixture.gameKey,
  };
}

export function buildDstRow(fixture: {
  dkId: string;
  team: string;
  gameKey: string;
  salary: number;
  percentile: number | null;
  dkAvgPointsPerGame?: number | null;
}): DfsEnrichedDstRow {
  const matchup: DstMatchup = {
    dstMatchupScore: fixture.percentile,
    dstMatchupPercentile: fixture.percentile,
    dstMatchupRank: fixture.percentile == null ? null : 1,
    status: fixture.percentile == null ? "unavailable" : "complete",
    componentScores: {} as DstMatchup["componentScores"],
    componentCoverage: fixture.percentile == null ? 0 : 1,
    policyVersion: "fixture",
    sourceAsOf: "2026-09-07T00:00:00Z",
    warnings: [],
  };

  return {
    kind: "dst",
    dkId: fixture.dkId,
    playerName: fixture.team + " DST",
    position: "DST",
    rosterPosition: "DST",
    salary: fixture.salary,
    team: fixture.team,
    game: null,
    gameInfoRaw: fixture.gameKey,
    dkAvgPointsPerGame: fixture.dkAvgPointsPerGame === undefined ? 7 : fixture.dkAvgPointsPerGame,
    dkStatus: null,
    identityStatus: "resolved",
    canonicalTeamId: fixture.team,
    identityConflict: false,
    projectedFantasyPoints: null,
    projectionSource: null,
    jkbWeeklyPositionRank: null,
    jkbSlatePositionRank: null,
    jkbOverallSlateProjectionRank: null,
    dkPositionSalaryRank: 1,
    dkOverallSalaryRank: null,
    posRankDiff: null,
    overallRankDiff: null,
    pointsPer1k: null,
    slateEligible: true,
    dstMatchup: matchup,
    research: null,
    teamMismatchStatus: "none",
    opponent: "opp",
    homeAway: "home",
    canonicalGameId: fixture.gameKey,
  };
}
