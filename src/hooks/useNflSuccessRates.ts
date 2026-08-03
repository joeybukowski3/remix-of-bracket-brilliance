import { useEffect, useState } from "react";
import {
  SUCCESS_RATES_ARTIFACT_PATH,
  type SuccessRatesArtifact,
} from "@/lib/nfl/successRateData";

type State = {
  loading: boolean;
  error: string | null;
  artifact: SuccessRatesArtifact | null;
};

/**
 * Loads the generated RBSDM success-rate artifact.
 *
 * Optional enrichment, loaded independently of the Phase 2 conventional-stat
 * artifact: if RBSDM data is missing or malformed, only the success-rate rows
 * fall back to "N/A" and every conventional metric keeps working.
 */
export function useNflSuccessRates(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(SUCCESS_RATES_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Success rates unavailable (${response.status}).`);
        const json = (await response.json()) as SuccessRatesArtifact;
        if (!json || typeof json !== "object" || !json.periods) {
          throw new Error("Success-rate artifact is malformed.");
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
