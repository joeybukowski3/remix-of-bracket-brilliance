import { useEffect, useState } from "react";
import { MARKET_ARTIFACT_PATH, type MarketArtifact } from "@/lib/nfl/marketData";

type State = {
  loading: boolean;
  error: string | null;
  artifact: MarketArtifact | null;
};

/**
 * Loads the generated NFL market artifact.
 *
 * Optional enrichment loaded independently of the Phase 2 conventional
 * artifact and the Phase 3A, 3B and 4 artifacts: if this file is missing or
 * malformed, the market rows stay at N/A and every other section keeps
 * working. nflverse is never called from the browser.
 */
export function useNflMatchupMarket(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, artifact: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, artifact: null });

    fetch(MARKET_ARTIFACT_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Market data unavailable (${response.status}).`);
        const json = (await response.json()) as MarketArtifact;
        if (!json || typeof json !== "object" || !json.periods || !json.currentMarket) {
          throw new Error("Market artifact is malformed.");
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
