import { useEffect, useState } from "react";

export type NflPerformanceArtifactState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

/**
 * Generic fetch-only loader for one public/data/nfl/performance/*.json
 * artifact. Each artifact family (overview/totals/props/health) loads
 * independently through its own hook instance so a failure or malformed
 * payload in one family never blocks the others from rendering
 * (see useNflPerformanceData.ts, which composes four of these).
 */
export function useNflPerformanceArtifact<T>(
  url: string,
  isValidShape: (json: unknown) => json is T,
  label: string,
): NflPerformanceArtifactState<T> {
  const [state, setState] = useState<NflPerformanceArtifactState<T>>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });

    fetch(url, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`${label} unavailable (${response.status}).`);
        const json: unknown = await response.json();
        if (!isValidShape(json)) throw new Error(`${label} artifact is malformed.`);
        if (!cancelled) setState({ loading: false, error: null, data: json });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : `${label} failed to load.`;
        if (!cancelled) setState({ loading: false, error: message, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [url, isValidShape, label]);

  return state;
}
