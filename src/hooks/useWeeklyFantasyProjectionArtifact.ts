import { useEffect, useState } from "react";
import {
  loadWeeklyFantasyProjectionState,
  weeklyFantasyProjectionArtifactLoadingState,
  type WeeklyFantasyProjectionArtifactLoadState,
} from "@/lib/fantasy/weekly/projections/production/artifactLoader";

/**
 * The SOLE canonical loader for the production `projectedFantasyPoints`
 * artifact. It never calculates or re-sorts rankings -- `artifact.rows` is
 * already the ranking authority, pre-sorted with `positionRank` assigned.
 * Both the weekly rankings page and the NFL Command Center use this same
 * hook so they read the identical model authority for a given player/week.
 */
export function useWeeklyFantasyProjectionArtifact(season: number, week: number): WeeklyFantasyProjectionArtifactLoadState {
  const [state, setState] = useState<WeeklyFantasyProjectionArtifactLoadState>(() =>
    weeklyFantasyProjectionArtifactLoadingState(season, week),
  );

  useEffect(() => {
    let cancelled = false;
    setState(weeklyFantasyProjectionArtifactLoadingState(season, week));
    void loadWeeklyFantasyProjectionState(season, week).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [season, week]);

  return state;
}
