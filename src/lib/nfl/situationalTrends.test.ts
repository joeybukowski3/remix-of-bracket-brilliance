import { describe, expect, it } from "vitest";
import {
  compareTrendEvidence,
  filterTrendGames,
  filterTrendLibrary,
  qualificationStatusFor,
  resolveGameQualifiers,
  type NflSituationalTrendsArtifact,
  type SituationalTrendResearch,
} from "@/lib/nfl/situationalTrends";

const metrics = (n: number, pct: number) => ({
  qualifyingTeamGames: n,
  atsWins: Math.round(n * pct),
  atsLosses: n - Math.round(n * pct),
  atsPushes: 0,
  atsWinPct: pct,
  atsRoiAtMinus110: pct - 0.5238,
  sampleSizeLabel: "LARGE",
});

const trend = (overrides: Partial<SituationalTrendResearch>): SituationalTrendResearch => ({
  id: "base",
  name: "Base trend",
  definition: "Locked definition.",
  category: "Travel",
  researchPhase: "PHASE_1",
  classification: "CONTEXT-DEPENDENT",
  confidence: "Moderate",
  recentEvidenceClassification: "MIXED",
  fullHistory: metrics(200, 0.5),
  recentForm: metrics(70, 0.5),
  robustnessLabel: "SUBGROUP-DEPENDENT",
  robustnessInterpretation: "Depends on subgroup.",
  articleNote: "Descriptive context.",
  stability: { recentChange: "STABLE" },
  variants: [],
  tier: "CONTEXTUAL",
  historicalDirection: "MIXED",
  ...overrides,
});

const library = [
  trend({ id: "high-ats-classic", name: "High ATS classic", tier: "CLASSIC_ANGLE", fullHistory: metrics(900, 0.7) }),
  trend({ id: "supported", name: "Supported", tier: "NOTEWORTHY", robustnessLabel: "BROADLY SUPPORTED", fullHistory: metrics(100, 0.53) }),
  trend({ id: "context", name: "Context", tier: "CONTEXTUAL", fullHistory: metrics(500, 0.6) }),
];

const artifact: NflSituationalTrendsArtifact = {
  schemaVersion: "nfl-situational-trend-matchups-v1",
  season: 2026,
  generatedAt: null,
  asOf: { schedule: null, results: null, market: null },
  sources: {},
  definitionVersions: { phase1: "p1", phase2: "p2", phase2b: "p2b" },
  evaluatedTrendIds: library.map((value) => value.id),
  researchLibrary: library,
  limitations: [],
  games: [{
    gameId: "game-1",
    week: 3,
    away: "sea",
    home: "nyg",
    awayName: "Seattle Seahawks",
    homeName: "New York Giants",
    gameSlug: "seattle-seahawks-at-new-york-giants",
    kickoff: "2026-09-27T17:00:00.000Z",
    status: "scheduled",
    qualifiers: [{
      gameId: "game-1",
      team: "sea",
      trendId: "supported",
      status: "CONFIRMED",
      reason: "Seattle travels west to east for an early kickoff.",
      variantIds: [],
      tier: "NOTEWORTHY",
      classification: "CONTEXT-DEPENDENT",
      confidence: "Moderate",
    }],
    pending: [{
      gameId: "game-1",
      team: "nyg",
      trendId: "context",
      status: "AWAITING_MARKET",
      reason: "Awaiting a current market spread.",
      variantIds: [],
      tier: "CONTEXTUAL",
      classification: "CONTEXT-DEPENDENT",
      confidence: "Moderate",
    }],
  }],
};

describe("situational trend evidence ranking", () => {
  it("uses research strength before ATS percentage", () => {
    const ranked = [...library].sort(compareTrendEvidence);
    expect(ranked.map((value) => value.id)).toEqual(["supported", "context", "high-ats-classic"]);
  });
});

describe("situational trend resolvers and filters", () => {
  it("joins historical evidence and keeps team attribution", () => {
    const [qualifier] = resolveGameQualifiers(artifact, "game-1");
    expect(qualifier.team).toBe("sea");
    expect(qualifier.trend.id).toBe("supported");
  });

  it("distinguishes confirmed, awaiting and not-applicable states", () => {
    const [game] = artifact.games;
    expect(qualificationStatusFor(game, "supported", "sea")).toBe("CONFIRMED");
    expect(qualificationStatusFor(game, "context", "nyg")).toBe("AWAITING_MARKET");
    expect(qualificationStatusFor(game, "high-ats-classic", "sea")).toBe("NOT_APPLICABLE");
  });

  it("filters standalone matchups by team, trend and noteworthy evidence", () => {
    expect(filterTrendGames(artifact.games, { search: "Seattle", trendId: "supported", noteworthyOnly: true })).toHaveLength(1);
    expect(filterTrendGames(artifact.games, { search: "Buffalo" })).toHaveLength(0);
    expect(filterTrendGames(artifact.games, { trendId: "context" })).toHaveLength(1);
  });

  it("searches and filters the full research library without requiring positive results", () => {
    expect(filterTrendLibrary(library, { search: "classic" }).map((value) => value.id)).toEqual(["high-ats-classic"]);
    expect(filterTrendLibrary(library, { category: "Travel" })).toHaveLength(3);
    expect(filterTrendLibrary(library, { classification: "LITTLE/NO EVIDENCE" })).toHaveLength(0);
  });
});
