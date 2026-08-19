import { useEffect, useState } from "react";
import {
  validateTeamPerformanceAnalyticsArtifact,
  type TeamPerformanceAnalyticsArtifact,
} from "@/lib/nfl/teamPerformanceAnalytics";

type State = {
  loading: boolean;
  error: string | null;
  data: TeamPerformanceAnalyticsArtifact | null;
};

/**
 * Loads and validates public/data/nfl/{season}/team-performance-analytics.json
 * (Phase 6). Contains NO rating math of its own — every value in the
 * artifact was already computed by the Phase 5 engine at generation time;
 * this hook only fetches and structurally validates the JSON.
 *
 * Not wired into any page yet.
 */
export function useNflTeamPerformanceAnalytics(season: number): State {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });

    fetch(`/data/nfl/${season}/team-performance-analytics.json`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Team performance analytics unavailable (${response.status}).`);
        const json: unknown = await response.json();
        const validated = validateTeamPerformanceAnalyticsArtifact(json);
        if (!cancelled) setState({ loading: false, error: null, data: validated });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Team performance analytics failed to load.";
        if (!cancelled) setState({ loading: false, error: message, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [season]);

  return state;
}
