import { useEffect, useState } from "react";
import {
  loadWeeklyFantasyResearchState,
  weeklyFantasyResearchArtifactLoadingState,
  type WeeklyFantasyResearchArtifactLoadState,
} from "@/lib/fantasy/weekly/researchArtifactLoader";

export function useWeeklyFantasyResearchArtifact(
  season: number,
  week: number,
): WeeklyFantasyResearchArtifactLoadState {
  const [state, setState] = useState<WeeklyFantasyResearchArtifactLoadState>(() =>
    weeklyFantasyResearchArtifactLoadingState(season, week),
  );

  useEffect(() => {
    let cancelled = false;
    setState(weeklyFantasyResearchArtifactLoadingState(season, week));
    void loadWeeklyFantasyResearchState(season, week).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [season, week]);

  return state;
}
