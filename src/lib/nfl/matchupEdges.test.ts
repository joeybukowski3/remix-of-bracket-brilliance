import { describe, expect, it } from "vitest";
import {
  matchupEdgeScore,
  matchupRankDifference,
  selectFantasyMatchupEdges,
  type NflMatchupEdge,
  type NflOffenseMatchupEdges,
} from "@/lib/nfl/matchupEdges";

function edge(score: number): NflMatchupEdge {
  return {
    score,
    offenseRank: null,
    defenseRank: null,
    rankDifference: score,
    offense: null,
    defense: null,
    source: "test",
    sampleLabel: "test",
  };
}

const edges: NflOffenseMatchupEdges = {
  passProtectionEdge: edge(11),
  runBlockingEdge: edge(12),
  passEpaEdge: edge(21),
  rushEpaEdge: edge(22),
  passSuccessEdge: edge(30),
  rushSuccessEdge: edge(31),
};

describe("shared NFL offense matchup edges", () => {
  it("makes a strong offense against a weak defense positive and favorable", () => {
    expect(matchupRankDifference(4, 22)).toBe(18);
    expect(matchupEdgeScore(1, 32)).toBe(100);
    expect(matchupEdgeScore(8, 24)).toBeGreaterThan(0);
  });

  it("makes a weak offense against a strong defense negative and unfavorable", () => {
    expect(matchupRankDifference(21, 8)).toBe(-13);
    expect(matchupEdgeScore(32, 1)).toBe(-100);
    expect(matchupEdgeScore(24, 8)).toBeLessThan(0);
  });

  it("keeps equal unit strength neutral and missing ranks missing", () => {
    expect(matchupRankDifference(12, 12)).toBe(0);
    expect(matchupRankDifference(null, 12)).toBeNull();
    expect(matchupEdgeScore(12, 12)).toBe(0);
    expect(matchupEdgeScore(null, 12)).toBeNull();
    expect(matchupEdgeScore(12, null)).toBeNull();
  });

  it("maps RB to rushing context and QB/WR/TE to passing context", () => {
    expect(selectFantasyMatchupEdges("RB", edges)).toMatchObject({ mode: "rush", trenches: { rankDifference: 12 }, epa: { rankDifference: 22 }, success: { rankDifference: 31 } });
    for (const position of ["QB", "WR", "TE"] as const) {
      expect(selectFantasyMatchupEdges(position, edges)).toMatchObject({ mode: "pass", trenches: { rankDifference: 11 }, epa: { rankDifference: 21 }, success: { rankDifference: 30 } });
    }
  });
});
