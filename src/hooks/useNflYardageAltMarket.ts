import { useEffect, useState } from "react";
import type { NflYardageAltMarketArtifact } from "@/lib/nfl/props/review/yardageMarketJoin";

type State = {
  loading: boolean;
  error: string | null;
  data: NflYardageAltMarketArtifact | null;
};

/**
 * Loads `public/data/nfl/nfl-yardage-alt-market.json` -- the secondary
 * (Kalshi) yardage-market source, consulted by the review page ONLY when
 * the primary sportsbook line is absent for a player.
 *
 * A failure here never blocks the review page and never affects the
 * sportsbook line: the projection, sportsbook and alt-market artifacts are
 * independent failure domains. On failure the page simply shows fewer
 * fallback lines (or none).
 */
export function useNflYardageAltMarket(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });

    fetch(`/data/nfl/nfl-yardage-alt-market.json`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Alt yardage market unavailable (${response.status}).`);
        const json = (await response.json()) as NflYardageAltMarketArtifact;
        if (!json || !json.canonical) throw new Error("Alt yardage market artifact is malformed.");
        if (!cancelled) setState({ loading: false, error: null, data: json });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Alt yardage market failed to load.";
        if (!cancelled) setState({ loading: false, error: message, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
