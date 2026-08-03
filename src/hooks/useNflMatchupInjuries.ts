import { useEffect, useState } from "react";
import { INJURIES_ARTIFACT_PATH, type InjuriesArtifact } from "@/lib/nfl/injuryData";

type State = {
  loading: boolean;
  error: string | null;
  artifact: InjuriesArtifact | null;
};

/**
 * Loads the generated NFL injury availability artifact.
 *
 * Optional enrichment loaded independently of the Phase 2 conventional
 * artifact, the Phase 3A success-rate artifact and the Phase 3B trench
 * artifact: if this file is missing or malformed, the Injuries section stays
 * visible in an unavailable state and every other section keeps working.
 * nflverse is never called from the browser.
 */
export function useNflMatchupInjuries(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(INJURIES_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Injury data unavailable (${response.status}).`);
        const json = (await response.json()) as InjuriesArtifact;
        if (!json || typeof json !== "object" || !json.teams) {
          throw new Error("Injury artifact is malformed.");
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
