import { useEffect, useState } from "react";
import { PROJECTIONS_ARTIFACT_PATH, type ProjectionsArtifact } from "@/lib/nfl/projectionData";

type State = {
  loading: boolean;
  error: string | null;
  artifact: ProjectionsArtifact | null;
};

/**
 * Loads the generated JKB projected spread artifact (nfl-spread-v0.1.0).
 *
 * Optional enrichment loaded independently of every other NFL artifact: if this
 * file is missing or malformed, the Model Analysis section reports itself
 * unavailable and all other sections keep working. No modelling runs in the
 * browser.
 */
export function useNflMatchupProjections(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(PROJECTIONS_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Projection data unavailable (${response.status}).`);
        const json = (await response.json()) as ProjectionsArtifact;
        if (!json || typeof json !== "object" || !json.projections || !json.model) {
          throw new Error("Projection artifact is malformed.");
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
