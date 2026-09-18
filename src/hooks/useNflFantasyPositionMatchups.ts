import { useEffect, useState } from "react";
import { POSITION_MATCHUP_ARTIFACT_PATH, type PositionMatchupArtifact } from "@/lib/nfl/positionMatchups/types";

type State = {
  loading: boolean;
  error: string | null;
  artifact: PositionMatchupArtifact | null;
};

/** Loads the generated Fantasy Position Matchup Comparison artifact. */
export function useNflFantasyPositionMatchups(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(POSITION_MATCHUP_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Fantasy position matchup data unavailable (${response.status}).`);
        const json = (await response.json()) as PositionMatchupArtifact;
        if (!json || typeof json !== "object" || !Array.isArray(json.rows)) {
          throw new Error("Fantasy position matchup artifact is malformed.");
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
