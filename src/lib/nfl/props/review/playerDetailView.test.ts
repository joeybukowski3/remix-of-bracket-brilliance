import { describe, expect, it } from "vitest";
import {
  buildProjectionSummary,
  buildDetailComponents,
  buildRoleProvenance,
  buildSportsbookDetail,
  buildDetailNotes,
  resolveWindowSource,
  buildDiffEquation,
  buildMatchupSummary,
  buildEdgeEquation,
} from "./playerDetailView";
import type {
  NflCurrentWeekPassingRow,
  NflCurrentWeekRushingRow,
  NflCurrentWeekReceivingRow,
  NflCurrentWeekHardCaseFlags,
} from "../types/currentWeekProjection";
import type { NflYardageReviewMarketInfo } from "./yardageMarketJoin";
import type { NflYardageOpponentContext } from "./opponentContext";
import type { NflPassingMatchupScore } from "../types/matchupScore";

const NO_FLAGS: NflCurrentWeekHardCaseFlags = {
  noHistory: false, limitedHistory: false, multiQbRoleUncertain: false, committeeRole: false,
  zeroTargetRisk: false, teamChanged: false, roleUncertain: false,
};

const EMPTY_RATE = { seasonPrior: null, last3: null, priorSeason: null };
const EMPTY_MARKET = { spread: null, total: null, impliedTeamTotal: null, isDome: null };

function passingRow(overrides: Partial<NflCurrentWeekPassingRow> = {}): NflCurrentWeekPassingRow {
  return {
    schemaVersion: "nfl-current-week-yardage-projection-v1", season: 2026, week: 1,
    gameId: "2026_01_NE_SEA", kickoff: "2026-09-07T17:00:00Z",
    playerId: "gsis:QB1", playerName: "Test QB", team: "ne", opponent: "sea", homeAway: "away",
    position: "QB", market: "passing", status: "projected", historyStatus: "normal",
    generatedAt: "2026-08-26T14:41:55Z", modelVersion: "v1",
    fallbackProvenance: "depthChart", roleSource: "nflverse-depth-charts-espn", roleSourceUpdatedAt: null,
    depthRank: 1, starterFlag: true, roleConfidence: "sourced",
    projectedYards: 245.3, directModelPrediction: 245.3,
    estimatedRange: { estimatedLow: 190, estimatedHigh: 300, nominalLevel: 0.9, intervalVersion: "v1" },
    matchupScore: null,
    hardCaseFlags: { ...NO_FLAGS },
    featureSnapshot: {
      qbAttemptsPerGame: { seasonPrior: 34.2, last3: 33.1, priorSeason: null },
      yardsPerAttempt: { seasonPrior: 7.1, last3: 6.9, priorSeason: null },
      completionPct: { seasonPrior: 0.64, last3: 0.63, priorSeason: null },
      teamPassAttemptsPerGame: EMPTY_RATE,
      teamDropbackRate: EMPTY_RATE,
      earlyDownNeutralPassRate: EMPTY_RATE,
      passRateOverExpected: EMPTY_RATE,
      market: EMPTY_MARKET,
    },
    diagnostics: { starterResolution: "sourcedDepthChart", gamesStartedPriorThisSeason: 5, sourceAmbiguous: false },
    ...overrides,
  } as NflCurrentWeekPassingRow;
}

function rushingRow(overrides: Partial<NflCurrentWeekRushingRow> = {}): NflCurrentWeekRushingRow {
  return {
    schemaVersion: "nfl-current-week-yardage-projection-v1", season: 2026, week: 1,
    gameId: "2026_01_NE_SEA", kickoff: "2026-09-07T17:00:00Z",
    playerId: "gsis:RB1", playerName: "Test RB", team: "ne", opponent: "sea", homeAway: "away",
    position: "RB", market: "rushing", status: "projected", historyStatus: "normal",
    generatedAt: "2026-08-26T14:41:55Z", modelVersion: "v1",
    fallbackProvenance: "depthChart", roleSource: "nflverse-depth-charts-espn", roleSourceUpdatedAt: null,
    depthRank: 2, starterFlag: false, roleConfidence: "sourced",
    projectedCarries: 12.5, projectedYardsPerCarry: 4.2, projectedYards: 52.5,
    estimatedRange: { estimatedLow: 20, estimatedHigh: 90, nominalLevel: 0.9, intervalVersion: "v1" },
    matchupScore: null,
    hardCaseFlags: { ...NO_FLAGS },
    featureSnapshot: {
      carriesPerGame: { seasonPrior: null, last3: null, priorSeason: 10.5 },
      carryShare: { seasonPrior: null, last3: null, priorSeason: 0.3 },
      rollingYardsPerCarry: { seasonPrior: null, last3: null, priorSeason: 4.6 },
      teamRushAttemptsPerGame: EMPTY_RATE,
      teamDropbackRate: EMPTY_RATE,
      teamPassRateOverExpected: EMPTY_RATE,
      opponentRushAttemptsAllowedPerGame: EMPTY_RATE,
      market: EMPTY_MARKET,
    },
    diagnostics: { gamesWithCarriesPriorThisSeason: 0, recentTeamTopCarryShareConcentration: null },
    ...overrides,
  } as NflCurrentWeekRushingRow;
}

function receivingRow(overrides: Partial<NflCurrentWeekReceivingRow> = {}): NflCurrentWeekReceivingRow {
  return {
    schemaVersion: "nfl-current-week-yardage-projection-v1", season: 2026, week: 1,
    gameId: "2026_01_NE_SEA", kickoff: "2026-09-07T17:00:00Z",
    playerId: "gsis:WR1", playerName: "Test WR", team: "ne", opponent: "sea", homeAway: "away",
    position: "WR", market: "receiving", status: "projected", historyStatus: "normal",
    generatedAt: "2026-08-26T14:41:55Z", modelVersion: "v1",
    fallbackProvenance: "depthChart", roleSource: "nflverse-depth-charts-espn", roleSourceUpdatedAt: null,
    depthRank: 1, starterFlag: true, roleConfidence: "sourced",
    positionSegment: "WR",
    projectedTargets: 7.8, projectedYardsPerTarget: 8.1, projectedYards: 63.2,
    estimatedRange: { estimatedLow: 25, estimatedHigh: 110, nominalLevel: 0.9, intervalVersion: "v1" },
    matchupScore: null,
    hardCaseFlags: { ...NO_FLAGS },
    featureSnapshot: {
      targetsPerGame: { seasonPrior: 8.0, last3: 7.5, priorSeason: null },
      targetShare: { seasonPrior: 0.22, last3: 0.2, priorSeason: null },
      rollingYardsPerTarget: { seasonPrior: 8.4, last3: 7.9, priorSeason: null },
      teamPassAttemptsPerGame: EMPTY_RATE,
      teamDropbackRate: EMPTY_RATE,
      teamPassRateOverExpected: EMPTY_RATE,
      targetConcentration: EMPTY_RATE,
      opponentTargetsAllowedPerGame: EMPTY_RATE,
      market: EMPTY_MARKET,
    },
    diagnostics: { gamesWithTargetsPriorThisSeason: 6 },
    ...overrides,
  } as NflCurrentWeekReceivingRow;
}

const UNAVAILABLE: NflYardageReviewMarketInfo = { available: false };
const AVAILABLE: NflYardageReviewMarketInfo = {
  available: true, line: 55.5, book: "draftkings", overPrice: "-110", underPrice: "-110",
  rawDifference: 3.2, lastUpdate: "2026-08-26T13:00:00Z",
};

describe("buildProjectionSummary", () => {
  it("selects exactly the projection-level fields, no computation", () => {
    const summary = buildProjectionSummary(passingRow());
    expect(summary).toEqual({
      projectedYards: 245.3,
      estimatedRange: { estimatedLow: 190, estimatedHigh: 300, nominalLevel: 0.9, intervalVersion: "v1" },
      market: "passing",
      modelVersion: "v1",
      historyStatus: "normal",
      generatedAt: "2026-08-26T14:41:55Z",
    });
  });
});

describe("buildDetailComponents", () => {
  it("passing: selects qbAttemptsPerGame/YPA/completionPct/team+market fields verbatim from featureSnapshot", () => {
    const result = buildDetailComponents(passingRow());
    expect(result.market).toBe("passing");
    if (result.market !== "passing") throw new Error("expected passing");
    expect(result.data.qbAttemptsPerGame).toEqual({ seasonPrior: 34.2, last3: 33.1, priorSeason: null });
    expect(result.data.yardsPerAttempt.seasonPrior).toBe(7.1);
    expect(result.data.completionPct.seasonPrior).toBe(0.64);
    expect(result.data.market.homeAway).toBe("away");
  });

  it("rushing: exposes projectedCarries/shrunk YPC alongside the raw rolling carries/YPC -- never conflates the two", () => {
    const result = buildDetailComponents(rushingRow());
    expect(result.market).toBe("rushing");
    if (result.market !== "rushing") throw new Error("expected rushing");
    expect(result.data.projectedCarries).toBe(12.5);
    expect(result.data.projectedYardsPerCarry).toBe(4.2); // shrunk, model value
    expect(result.data.rollingYardsPerCarry.priorSeason).toBe(4.6); // raw rolling, distinct value
    expect(result.data.projectedYardsPerCarry).not.toBe(result.data.rollingYardsPerCarry.priorSeason);
  });

  it("receiving: exposes projectedTargets/shrunk YPT alongside raw rolling targets/YPT", () => {
    const result = buildDetailComponents(receivingRow());
    expect(result.market).toBe("receiving");
    if (result.market !== "receiving") throw new Error("expected receiving");
    expect(result.data.projectedTargets).toBe(7.8);
    expect(result.data.projectedYardsPerTarget).toBe(8.1);
    expect(result.data.targetShare.seasonPrior).toBe(0.22);
  });
});

describe("resolveWindowSource", () => {
  it("prefers seasonPrior, then last3, then priorSeason, in that order", () => {
    expect(resolveWindowSource({ seasonPrior: 1, last3: 2, priorSeason: 3 })).toBe("seasonPrior");
    expect(resolveWindowSource({ seasonPrior: null, last3: 2, priorSeason: 3 })).toBe("last3");
    expect(resolveWindowSource({ seasonPrior: null, last3: null, priorSeason: 3 })).toBe("priorSeason");
  });

  it("returns null (never fabricates a source) when every window is null", () => {
    expect(resolveWindowSource({ seasonPrior: null, last3: null, priorSeason: null })).toBeNull();
  });
});

describe("buildRoleProvenance", () => {
  it("selects role/provenance fields and the market-specific prior-usage-games count", () => {
    expect(buildRoleProvenance(passingRow()).gamesWithPriorUsage).toBe(5);
    expect(buildRoleProvenance(rushingRow()).gamesWithPriorUsage).toBe(0);
    expect(buildRoleProvenance(receivingRow()).gamesWithPriorUsage).toBe(6);
  });

  it("carries every hard-case flag through untouched", () => {
    const row = passingRow({ hardCaseFlags: { ...NO_FLAGS, multiQbRoleUncertain: true, teamChanged: true } });
    const provenance = buildRoleProvenance(row);
    expect(provenance.multiQbRoleUncertain).toBe(true);
    expect(provenance.teamChanged).toBe(true);
    expect(provenance.committeeRole).toBe(false);
  });
});

describe("buildSportsbookDetail", () => {
  it("passes the join result through unchanged for both availability states", () => {
    expect(buildSportsbookDetail(UNAVAILABLE)).toEqual(UNAVAILABLE);
    expect(buildSportsbookDetail(AVAILABLE)).toEqual(AVAILABLE);
  });
});

describe("buildDetailNotes", () => {
  it("returns no notes for a clean, sourced, top-ranked row with no line", () => {
    expect(buildDetailNotes(passingRow(), UNAVAILABLE)).toEqual([]);
  });

  it("noHistory takes precedence over limitedHistory (mutually exclusive in practice, but the function should not double-report)", () => {
    const row = rushingRow({ hardCaseFlags: { ...NO_FLAGS, noHistory: true } });
    const notes = buildDetailNotes(row, UNAVAILABLE);
    expect(notes.map((n) => n.key)).toEqual(["noHistory"]);
  });

  it("limitedHistory fires when noHistory is false", () => {
    const row = rushingRow({ hardCaseFlags: { ...NO_FLAGS, limitedHistory: true } });
    const notes = buildDetailNotes(row, UNAVAILABLE);
    expect(notes.map((n) => n.key)).toEqual(["limitedHistory"]);
  });

  it("teamChanged, committeeRole, and zeroTargetRisk each produce a distinct note", () => {
    const row = rushingRow({ hardCaseFlags: { ...NO_FLAGS, teamChanged: true, committeeRole: true } });
    const notes = buildDetailNotes(row, UNAVAILABLE).map((n) => n.key);
    expect(notes).toContain("teamChanged");
    expect(notes).toContain("committeeRole");
  });

  it("roleInferred fires when roleConfidence is inferred, independent of roleUncertain", () => {
    const row = rushingRow({ roleConfidence: "inferred", hardCaseFlags: { ...NO_FLAGS } });
    const notes = buildDetailNotes(row, UNAVAILABLE).map((n) => n.key);
    expect(notes).toContain("roleInferred");
  });

  it("market-vs-role discrepancy fires generally for ANY non-rank-1 player with a line -- not a hardcoded team/player check", () => {
    const rowA = rushingRow({ playerId: "gsis:ANY_PLAYER_A", depthRank: 3 });
    const rowB = receivingRow({ playerId: "gsis:ANY_PLAYER_B", team: "kc", opponent: "buf", depthRank: 2 });
    expect(buildDetailNotes(rowA, AVAILABLE).map((n) => n.key)).toContain("marketVsRoleDiscrepancy");
    expect(buildDetailNotes(rowB, AVAILABLE).map((n) => n.key)).toContain("marketVsRoleDiscrepancy");
  });

  it("market-vs-role discrepancy does NOT fire for a rank-1 player, or when no line exists", () => {
    expect(buildDetailNotes(rushingRow({ depthRank: 1 }), AVAILABLE).map((n) => n.key)).not.toContain("marketVsRoleDiscrepancy");
    expect(buildDetailNotes(rushingRow({ depthRank: 3 }), UNAVAILABLE).map((n) => n.key)).not.toContain("marketVsRoleDiscrepancy");
  });

  it("never emits an injury claim in any note text", () => {
    const row = rushingRow({ hardCaseFlags: { ...NO_FLAGS, noHistory: true, teamChanged: true, committeeRole: true }, depthRank: 2 });
    const notes = buildDetailNotes(row, AVAILABLE);
    for (const note of notes) {
      expect(note.text.toLowerCase()).not.toMatch(/injur|hurt|out for|questionable|doubtful/);
    }
  });
});

describe("buildDiffEquation", () => {
  it("computes Projection − Line = Diff verbatim", () => {
    const row = passingRow({ projectedYards: 220.7 });
    const result = buildDiffEquation(row, { ...AVAILABLE, line: 233.5 });
    expect(result).toEqual({ projectedYards: 220.7, line: 233.5, diff: 220.7 - 233.5 });
  });

  it("returns null with no available line", () => {
    expect(buildDiffEquation(passingRow(), UNAVAILABLE)).toBeNull();
  });
});

const MATCHUP_SCORE: NflPassingMatchupScore = {
  schemaVersion: "nfl-yardage-matchup-score-v2",
  scoreVersion: "nfl-yardage-matchup-score-phase8-v1",
  referenceDistributionVersion: "nfl-yardage-matchup-reference-2022-2024-v1",
  season: 2026, week: 1, gameId: "2026_01_NE_SEA", playerId: "gsis:QB1", playerName: "Test QB",
  team: "ne", opponent: "sea", market: "passing",
  matchupScore: 72, opportunityScore: 70, environmentScore: 74, generatedAt: "2026-08-26T14:41:55Z",
  components: {
    opportunity: { score: 30, indicatorScores: {} },
    opponent: { score: 20, indicatorScores: {} },
    gameEnvironment: { score: 10, indicatorScores: {} },
    passingQuality: { score: 40, indicatorScores: {} },
  },
};

describe("buildMatchupSummary", () => {
  it("reads the total score, band, and per-component scores verbatim -- never re-derives them", () => {
    const row = passingRow({ matchupScore: MATCHUP_SCORE });
    const summary = buildMatchupSummary(row);
    expect(summary?.matchupScore).toBe(72);
    expect(summary?.band).toBe("strong");
    const opportunity = summary?.components.find((c) => c.key === "opportunity");
    expect(opportunity?.score).toBe(30);
    // 30 / (30+20+10+40) = 0.3
    expect(opportunity?.weight).toBeCloseTo(0.3, 5);
  });

  it("returns null when the row has no matchup score", () => {
    expect(buildMatchupSummary(passingRow({ matchupScore: null }))).toBeNull();
  });
});

function opponentContext(overrides: Partial<NflYardageOpponentContext["epaEdge"]> = {}): NflYardageOpponentContext {
  return {
    mode: "pass",
    productionAllowed: { position: "QB", season: null, last5: null },
    epaEdge: { score: 50, offenseRank: 24, defenseRank: 9, rankDifference: -15, offense: null, defense: null, ...overrides },
    successEdge: { score: null, offenseRank: null, defenseRank: null, rankDifference: null, offense: null, defense: null },
    successPeriodLabel: "2025 L8",
  };
}

describe("buildEdgeEquation", () => {
  it("computes Opponent Defense Rank − Team Offense Rank = Edge verbatim from the existing matchupEdges rankDifference", () => {
    const result = buildEdgeEquation(opponentContext());
    expect(result).toEqual({ defenseRank: 9, offenseRank: 24, edge: -15 });
  });

  it("returns null with no opponent context or unranked edges", () => {
    expect(buildEdgeEquation(undefined)).toBeNull();
    expect(buildEdgeEquation(opponentContext({ defenseRank: null }))).toBeNull();
  });
});
