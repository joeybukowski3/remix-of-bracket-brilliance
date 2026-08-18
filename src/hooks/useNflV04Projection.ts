import { useEffect, useState } from "react";
import {
  buildPublicProjectionBoard,
  type NflPublicProjectionBoard,
} from "@/lib/nfl/publicProjection2026";
import { validateNflV04ProjectionArtifact } from "@/lib/nfl/v04Projection";

/**
 * Loads the curated 2026 preseason projection layer (nfl-power-v0.4-beta).
 *
 * Deliberately not wired into publicRatingState.ts: that module selects
 * among states of the automated v0.3.1 model (preseason vs. full-season).
 * The v0.4 projection is a separate, hand-curated preseason layer with its
 * own artifact and its own lifecycle — it is not another state of the
 * automated model, so it gets its own loader.
 */
export const NFL_V04_PROJECTION_PATH = "/data/nfl/2026/projected-power-ratings-v04.json";

type State = {
  loading: boolean;
  error: string | null;
  data: NflPublicProjectionBoard | null;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadNflV04Projection(
  fetcher: FetchLike = fetch,
  signal?: AbortSignal
): Promise<NflPublicProjectionBoard> {
  const response = await fetcher(NFL_V04_PROJECTION_PATH, { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `${NFL_V04_PROJECTION_PATH} is missing`
        : `${NFL_V04_PROJECTION_PATH} returned HTTP ${response.status}`
    );
  }
  const json: unknown = await response.json();
  const artifact = validateNflV04ProjectionArtifact(json, NFL_V04_PROJECTION_PATH);
  return buildPublicProjectionBoard(artifact);
}

export function useNflV04Projection(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: null, data: null });
    loadNflV04Projection(fetch, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ loading: false, error: null, data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Unknown error loading 2026 projection",
          data: null,
        });
      });
    return () => controller.abort();
  }, []);

  return state;
}
