// Test-only factories for WU3 weekly research fixtures. Not used by production code.

import { createEmptyWeeklyFantasyResearchContext, WEEKLY_RESEARCH_CONTEXT_VERSION, type WeeklyFantasyResearchContext, type WeeklyResearchMetric } from "@/lib/fantasy/weekly/researchContext";
import type { WeeklyFantasyResearchArtifact, WeeklyFantasyResearchArtifactRow } from "@/lib/fantasy/weekly/researchArtifact";
import { FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";
import type { FantasyMatchupEdges, NflMatchupEdge } from "@/lib/nfl/matchupEdges";

export function buildMetric(overrides: Partial<WeeklyResearchMetric> = {}): WeeklyResearchMetric {
  return { value: null, rank: null, poolSize: 0, sampleSize: 0, sampleSeason: null, games: [], ...overrides };
}

export function buildResearchContext(overrides: Partial<WeeklyFantasyResearchContext> = {}): WeeklyFantasyResearchContext {
  return {
    ...createEmptyWeeklyFantasyResearchContext(),
    ...overrides,
  };
}

function buildEdge(overrides: Partial<NflMatchupEdge> = {}): NflMatchupEdge {
  return {
    score: null,
    offenseRank: null,
    defenseRank: null,
    rankDifference: null,
    offense: null,
    defense: null,
    source: "test-fixture",
    sampleLabel: "test sample",
    ...overrides,
  };
}

export function buildMatchupEdges(overrides: Partial<FantasyMatchupEdges> = {}): FantasyMatchupEdges {
  return { trenches: buildEdge(), epa: buildEdge(), success: buildEdge(), mode: "pass", ...overrides };
}

export function buildResearchRow(
  overrides: Partial<WeeklyFantasyResearchArtifactRow> & Pick<WeeklyFantasyResearchArtifactRow, "playerId" | "position">,
): WeeklyFantasyResearchArtifactRow {
  return {
    context: buildResearchContext(),
    matchupGrade: null,
    matchupEdges: buildMatchupEdges({ mode: overrides.position === "RB" ? "rush" : "pass" }),
    ...overrides,
  };
}

export function buildResearchArtifact(
  overrides: Partial<WeeklyFantasyResearchArtifact> & Pick<WeeklyFantasyResearchArtifact, "season" | "week" | "rows">,
): WeeklyFantasyResearchArtifact {
  return {
    schemaVersion: "weekly-fantasy-research-artifact-v1",
    researchContextVersion: WEEKLY_RESEARCH_CONTEXT_VERSION,
    scoringVersion: FANTASY_SCORING_VERSION,
    generatedAt: "2026-09-10T12:00:00.000Z",
    inputAsOf: "2026-09-10T12:00:00.000Z",
    projectionArtifact: { path: "/data/fantasy/projections/2026/week-01.json", schemaVersion: "weekly-fantasy-projection-production-artifact-v2", sourceHash: "test" },
    matchupGradeAuthority: { input: "opponentFpaSeason.rank", bands: "1-6 Great; 7-12 Good; 13-20 Neutral; 21-26 Tough; 27-32 Very Tough" },
    provenance: [{ source: "test-fixture", sourceVersion: "v1", sourceHash: "test", inputAsOf: "2026-09-10T12:00:00.000Z" }],
    ...overrides,
  };
}
