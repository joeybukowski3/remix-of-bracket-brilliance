import { useEffect, useState } from "react";
import {
  PROJECTED_MATCHUP_METRICS_PATH,
  validateProjectedMatchupMetrics,
  type ProjectedMatchupMetricsArtifact,
  type ProjectionTeamIdentity,
} from "@/lib/nfl/projectedMatchupMetrics";

type State = { loading: boolean; error: string | null; artifact: ProjectedMatchupMetricsArtifact | null };

export async function loadProjectedMatchupMetrics(
  teams: readonly ProjectionTeamIdentity[],
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ProjectedMatchupMetricsArtifact | null> {
  const response = await fetcher(PROJECTED_MATCHUP_METRICS_PATH, { cache: "no-store", signal });
  if (response.status === 404) return null; // No season-stat model has published yet.
  if (!response.ok) throw new Error(`Projected comparison unavailable (${response.status}).`);
  return validateProjectedMatchupMetrics(await response.json(), teams);
}

export function useNflProjectedMatchupMetrics(enabled: boolean, teams: readonly ProjectionTeamIdentity[] | undefined): State {
  const [state, setState] = useState<State>({ loading: false, error: null, artifact: null });
  useEffect(() => {
    if (!enabled || !teams) return;
    const controller = new AbortController();
    setState({ loading: true, error: null, artifact: null });
    loadProjectedMatchupMetrics(teams, fetch, controller.signal)
      .then((artifact) => {
        if (!controller.signal.aborted) setState({ loading: false, error: null, artifact });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ loading: false, error: "Projected statistics could not be loaded. They remain unavailable.", artifact: null });
      });
    return () => controller.abort();
  }, [enabled, teams]);
  return state;
}
