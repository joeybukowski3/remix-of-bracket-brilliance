import { useEffect, useState } from "react";
import { FANTASY_ALLOWED_ARTIFACT_PATH, FANTASY_ALLOWED_SAMPLE_KEYS, type FantasyAllowedArtifact } from "@/lib/nfl/fantasyAllowed/types";

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
        if (!json || typeof json !== "object" || json.schemaVersion !== "nfl-fantasy-points-allowed-v2" || !Array.isArray(json.rows)
          || json.rows.some((row) => FANTASY_ALLOWED_SAMPLE_KEYS.some((sample) => row.samples?.[sample]?.wr == null))) {
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
