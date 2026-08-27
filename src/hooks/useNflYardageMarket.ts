import { useEffect, useState } from "react";
import type { NflYardageMarketArtifact } from "@/lib/nfl/props/review/yardageMarketJoin";

type State = {
  loading: boolean;
  error: string | null;
  data: NflYardageMarketArtifact | null;
};

/**
 * Loads `public/data/nfl/nfl-yardage-market.json` (sportsbook yardage
 * lines). A failure here never blocks the projection review page -- the
 * page renders projections with every sportsbook column marked
 * unavailable, since the projection and market artifacts are independent
 * failure domains.
 */
export function useNflYardageMarket(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });

    fetch(`/data/nfl/nfl-yardage-market.json`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Yardage market unavailable (${response.status}).`);
        const json = (await response.json()) as NflYardageMarketArtifact;
        if (!json || !json.canonical) throw new Error("Yardage market artifact is malformed.");
        if (!cancelled) setState({ loading: false, error: null, data: json });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Yardage market failed to load.";
        if (!cancelled) setState({ loading: false, error: message, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
