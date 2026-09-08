import { useEffect, useState } from "react";
import { lineupContextSchema, type DfsLineupContextArtifact } from "@/lib/nfl/dfs/lineupContext";

export function useDfsLineupContext(season: number, week: number) {
  const [state, setState] = useState<{ season: number; week: number; artifact: DfsLineupContextArtifact | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}data/nfl/dfs/${season}/week-${String(week).padStart(2, "0")}.json`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Weekly lineup context unavailable");
        const artifact = lineupContextSchema.parse(await response.json());
        if (artifact.season !== season || artifact.week !== week) throw new Error("Weekly lineup context mismatch");
        if (!controller.signal.aborted) setState({ season, week, artifact });
      }).catch(() => { if (!controller.signal.aborted) setState({ season, week, artifact: null }); });
    return () => controller.abort();
  }, [season, week]);
  return state?.season === season && state.week === week ? state.artifact : null;
}
