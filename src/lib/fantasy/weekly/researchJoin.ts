import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { MATCHUP_GRADES, type MatchupGrade } from "@/lib/fantasy/matchupGrade";
import { createEmptyWeeklyFantasyResearchContext, type WeeklyFantasyResearchContext } from "@/lib/fantasy/weekly/researchContext";
import type { WeeklyFantasyResearchArtifact } from "@/lib/fantasy/weekly/researchArtifact";
import type { FantasyMatchupEdges, NflMatchupEdge } from "@/lib/nfl/matchupEdges";

export type WeeklyFantasyResearchRow = WeeklyFantasyProjectionProductionRow & {
  research: WeeklyFantasyResearchContext;
  matchupRating: MatchupGrade | null;
  matchupEdges: FantasyMatchupEdges;
};

function emptyEdge(): NflMatchupEdge {
  return {
    score: null,
    offenseRank: null,
    defenseRank: null,
    rankDifference: null,
    offense: null,
    defense: null,
    source: "Unavailable",
    sampleLabel: "No research sample",
  };
}

function emptyEdges(position: WeeklyFantasyProjectionProductionRow["position"]): FantasyMatchupEdges {
  return {
    mode: position === "RB" ? "rush" : "pass",
    trenches: emptyEdge(),
    epa: emptyEdge(),
    success: emptyEdge(),
  };
}

export function joinWeeklyFantasyResearchRows(
  projectionRows: readonly WeeklyFantasyProjectionProductionRow[],
  artifact: WeeklyFantasyResearchArtifact | null,
): { rows: WeeklyFantasyResearchRow[]; missingPlayerIds: string[]; mismatchedPlayerIds: string[] } {
  const researchByPlayerId = new Map(artifact?.rows.map((row) => [row.playerId, row]) ?? []);
  const missingPlayerIds: string[] = [];
  const mismatchedPlayerIds: string[] = [];

  const rows = projectionRows.map((projection): WeeklyFantasyResearchRow => {
    const research = researchByPlayerId.get(projection.playerId);
    if (!research) missingPlayerIds.push(projection.playerId);
    else if (research.position !== projection.position) mismatchedPlayerIds.push(projection.playerId);
    const accepted = research?.position === projection.position ? research : null;
    return {
      ...projection,
      research: accepted?.context ?? createEmptyWeeklyFantasyResearchContext(),
      matchupRating: accepted?.matchupGrade
        ? MATCHUP_GRADES.find((grade) => grade.id === accepted.matchupGrade) ?? null
        : null,
      matchupEdges: accepted?.matchupEdges ?? emptyEdges(projection.position),
    };
  });

  return { rows, missingPlayerIds, mismatchedPlayerIds };
}
