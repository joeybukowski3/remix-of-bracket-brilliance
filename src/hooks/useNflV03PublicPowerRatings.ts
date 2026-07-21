import { useEffect, useState } from "react";
import {
  loadPublicPowerBoard,
  NFL_V03_PUBLIC_PRESEASON_SEASON,
  type NflPublicPowerBoard,
} from "@/lib/nfl/publicPowerRatings";
import type { NflV03ReviewSeason } from "@/lib/nfl/v03Review";

type State = {
  loading: boolean;
  error: string | null;
  data: NflPublicPowerBoard | null;
};

export function useNflV03PublicPowerRatings(
  season: NflV03ReviewSeason = NFL_V03_PUBLIC_PRESEASON_SEASON
): State {
  const [state, setState] = useState<State>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: null, data: null });
    loadPublicPowerBoard(season, fetch, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, error: null, data });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load power ratings",
          data: null,
        });
      });
    return () => controller.abort();
  }, [season]);

  return state;
}
