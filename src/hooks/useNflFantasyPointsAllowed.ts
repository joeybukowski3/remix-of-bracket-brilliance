import { useEffect, useState } from "react";
import { FANTASY_ALLOWED_ARTIFACT_PATH, type FantasyAllowedArtifact } from "@/lib/nfl/fantasyAllowed/types";

type State = {
  loading: boolean;
  error: string | null;
  artifact: FantasyAllowedArtifact | null;
};

/** Loads the generated Fantasy Points Allowed by Position artifact. */
export function useNflFantasyPointsAllowed(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(FANTASY_ALLOWED_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Fantasy points allowed data unavailable (${response.status}).`);
        const json = (await response.json()) as FantasyAllowedArtifact;
        if (!json || typeof json !== "object" || !Array.isArray(json.rows)) {
          throw new Error("Fantasy points allowed artifact is malformed.");
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
