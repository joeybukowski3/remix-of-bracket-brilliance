import { useEffect, useState } from "react";
import {
  NFL_SITUATIONAL_TRENDS_PATH,
  isNflSituationalTrendsArtifact,
  type NflSituationalTrendsArtifact,
} from "@/lib/nfl/situationalTrends";

type State = {
  loading: boolean;
  error: string | null;
  artifact: NflSituationalTrendsArtifact | null;
};

/** Loads the generated qualification artifact; the browser never reruns rules. */
export function useNflSituationalTrends(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    fetch(NFL_SITUATIONAL_TRENDS_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Situational trends unavailable (${response.status}).`);
        const value: unknown = await response.json();
        if (!isNflSituationalTrendsArtifact(value)) throw new Error("Situational trend artifact is malformed.");
        if (!cancelled) setState({ loading: false, error: null, artifact: value });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ loading: false, error: error.message, artifact: null });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
