import { useEffect, useState } from "react";
import {
  loadWeeklyFantasyRankingState,
  weeklyFantasyArtifactLoadingState,
  type WeeklyFantasyArtifactLoadState,
} from "@/lib/fantasy/weekly/artifactLoader";

/** React adapter for the canonical artifact loader. It never calculates rankings. */
export function useWeeklyFantasyRankingArtifact(season: number, week: number): WeeklyFantasyArtifactLoadState {
  const [state, setState] = useState<WeeklyFantasyArtifactLoadState>(() =>
    weeklyFantasyArtifactLoadingState(season, week),
  );

  useEffect(() => {
    let cancelled = false;
    setState(weeklyFantasyArtifactLoadingState(season, week));
    void loadWeeklyFantasyRankingState(season, week).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [season, week]);

  return state;
}
