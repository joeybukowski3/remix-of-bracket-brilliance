import { useEffect, useState } from "react";
import { EPA_ARTIFACT_PATH, type EpaArtifact } from "@/lib/nfl/epaData";

type State = {
  loading: boolean;
  error: string | null;
  artifact: EpaArtifact | null;
};

/**
 * Loads the generated nflverse EPA artifact.
 *
 * Optional enrichment loaded independently of the Phase 2 conventional
 * artifact and the Phase 3A, 3B, 4 and 5 artifacts: if this file is missing or
 * malformed, only the six EPA rows fall back to N/A and every other section
 * keeps working. Play-by-play is never fetched or parsed in the browser.
 */
export function useNflMatchupEpa(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(EPA_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`EPA data unavailable (${response.status}).`);
        const json = (await response.json()) as EpaArtifact;
        if (!json || typeof json !== "object" || !json.windows) {
          throw new Error("EPA artifact is malformed.");
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
