import { useEffect, useState } from "react";
import {
  TRENCH_METRICS_ARTIFACT_PATH,
  type TrenchMetricsArtifact,
} from "@/lib/nfl/trenchMetricsData";

type State = {
  loading: boolean;
  error: string | null;
  artifact: TrenchMetricsArtifact | null;
};

/**
 * Loads the generated ESPN trench win-rate artifact.
 *
 * Optional enrichment loaded independently of the Phase 2 conventional artifact
 * and the Phase 3A success-rate artifact: if this file is missing or malformed,
 * the Trenches section stays visible with N/A values and every other metric
 * keeps working. ESPN is never called from the browser.
 */
export function useNflTrenchMetrics(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(TRENCH_METRICS_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Trench metrics unavailable (${response.status}).`);
        const json = (await response.json()) as TrenchMetricsArtifact;
        if (!json || typeof json !== "object" || !json.seasons) {
          throw new Error("Trench metrics artifact is malformed.");
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
