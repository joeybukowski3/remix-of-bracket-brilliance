import { useMemo } from "react";
import { useWeeklyFantasyResearchArtifact } from "@/hooks/useWeeklyFantasyResearchArtifact";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { joinWeeklyFantasyResearchRows, type WeeklyFantasyResearchRow } from "@/lib/fantasy/weekly/researchJoin";

export type { WeeklyFantasyResearchRow } from "@/lib/fantasy/weekly/researchJoin";

/** Exact playerId join only. Missing or mismatched research degrades to N/A. */
export function useWeeklyFantasyResearchRows(
  rows: readonly WeeklyFantasyProjectionProductionRow[],
  season: number,
  week: number,
): { rows: WeeklyFantasyResearchRow[]; loading: boolean; errors: string[] } {
  const research = useWeeklyFantasyResearchArtifact(season, week);
  const joined = useMemo(
    () => joinWeeklyFantasyResearchRows(rows, research.status === "ready" ? research.artifact : null),
    [research, rows],
  );

  const errors: string[] = [];
  if (research.status === "missing") errors.push("Weekly research context is unavailable; display fields show N/A.");
  if (research.status === "error") errors.push(research.error.message);
  if (joined.missingPlayerIds.length > 0 && research.status === "ready") {
    errors.push(`${joined.missingPlayerIds.length} projection rows have no exact research playerId match.`);
  }
  if (joined.mismatchedPlayerIds.length > 0) {
    errors.push(`${joined.mismatchedPlayerIds.length} research rows disagree with the projection position.`);
  }

  return {
    rows: joined.rows,
    loading: research.status === "loading",
    errors,
  };
}
