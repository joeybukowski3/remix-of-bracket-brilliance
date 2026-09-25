import { describe, expect, it } from "vitest";
import {
  buildNflOffenseMatchupEdges,
  matchupEdgeScore,
  matchupRankDifference,
  selectFantasyMatchupEdges,
  type NflMatchupEdge,
  type NflOffenseMatchupEdges,
} from "@/lib/nfl/matchupEdges";
import type { TrenchMetricsArtifact } from "@/lib/nfl/trenchMetricsData";

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

describe("buildNflOffenseMatchupEdges trench season selection", () => {
  const m = (pb: [number, number], pr: [number, number]) => ({
    espnSlug: "x",
    metrics: {
      "off.passBlockWinRate": { valuePct: pb[0], espnRank: pb[1] },
      "def.passRushWinRate": { valuePct: pr[0], espnRank: pr[1] },
    },
  });
  const artifact = (teams2026: TrenchMetricsArtifact["seasons"][string]["teams"]): TrenchMetricsArtifact => ({
    schemaVersion: "test",
    generatedAt: "2026-09-23T00:00:00.000Z",
    source: "test",
    attribution: "ESPN Analytics / NFL Next Gen Stats",
    metricColumns: {},
    provenance: null,
    seasons: {
      "2025": { articleId: "a", throughWeek: 18, sourceUpdatedText: null, sourceLastModified: null, teams: { ne: m([64, 13], [35, 19]), jax: m([68, 9], [38, 14]) } },
      "2026": { articleId: "b", throughWeek: 2, sourceUpdatedText: null, sourceLastModified: null, teams: teams2026 },
    },
  });
  const build = (trench: TrenchMetricsArtifact, games = 2) =>
    buildNflOffenseMatchupEdges({ team: "NE", opponent: "JAX", teamCompletedGames: games, opponentCompletedGames: games, trench, epa: null, success: null }).passProtectionEdge;

  it("uses 2026 values and ranks verbatim well before six completed games", () => {
    const edge = build(artifact({ ne: m([55, 9], [50, 17]), jax: m([46, 26], [37, 30]) }));
    expect(edge.offense).toMatchObject({ value: 55, rank: 9, label: "Team Pass Block" });
    expect(edge.defense).toMatchObject({ value: 37, rank: 30, label: "Opponent Pass Rush" });
    expect(edge.sampleLabel).toBe("2026 Through Week 2");
  });

  it("falls back to 2025 independently per side when 2026 is absent", () => {
    const edge = build(artifact({ ne: m([55, 9], [50, 17]) }));
    expect(edge.offense).toMatchObject({ value: 55, rank: 9 });
    expect(edge.defense).toMatchObject({ value: 38, rank: 14 });
    expect(edge.sampleLabel).toBe("Offense 2026 Through Week 2 / Defense 2025 Season");
  });

  it("labels a fully 2025 fallback as 2025 Season", () => {
    expect(build(artifact({})).sampleLabel).toBe("2025 Season");
  });
});
