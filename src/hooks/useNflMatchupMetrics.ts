import { useEffect, useState } from "react";
import {
  MATCHUP_METRICS_ARTIFACT_PATH,
  type MatchupMetricsArtifact,
} from "@/lib/nfl/matchupMetricsData";

type State = {
  loading: boolean;
  /** Non-null only when the artifact could not be loaded. Never blocks the page. */
  error: string | null;
  artifact: MatchupMetricsArtifact | null;
};

/**
 * Loads the generated conventional-stat artifact for the matchup analyzer.
 *
 * Follows the existing NFL data pattern (see useNflSeasonData): a runtime fetch
 * of a generated file under /data/nfl with `cache: "no-store"`, so refreshed
 * pipeline output appears without a rebuild.
 *
 * Failure is intentionally soft. The analyzer renders fully from the guide model
 * without this artifact; a missing or malformed file simply leaves the detailed
 * statistical rows at "N/A" rather than breaking the page.
 */
export function useNflMatchupMetrics(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(MATCHUP_METRICS_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Matchup metrics unavailable (${response.status}).`);
        const json = (await response.json()) as MatchupMetricsArtifact;
        if (!json || typeof json !== "object" || !json.windows) {
          throw new Error("Matchup metrics artifact is malformed.");
        }
        if (!cancelled) setState({ loading: false, error: null, artifact: json });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ loading: false, error: err.message, artifact: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
