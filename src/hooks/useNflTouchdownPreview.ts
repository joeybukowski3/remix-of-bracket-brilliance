import { useEffect, useState } from "react";
import type { TouchdownPreviewArtifact } from "@/lib/nfl/touchdown-preview/types";
import { useCurrentNflWeek } from "@/hooks/useCurrentNflWeek";

export function useNflTouchdownPreview(season: number) {
  const current = useCurrentNflWeek(season);
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: TouchdownPreviewArtifact | null }>({ loading: true, error: null, data: null });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    if (current.loading) return;
    if (current.error || current.week === null) {
      setState({ loading: false, error: current.error ?? "Current NFL schedule unavailable.", data: null });
      return;
    }
    fetch(`/data/nfl/${season}/touchdown-preview.json`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`TD Scorer data unavailable (${response.status}).`);
        const data = await response.json() as TouchdownPreviewArtifact;
        if (data.schemaVersion !== "nfl-touchdown-preview-v1" || !Array.isArray(data.players)) throw new Error("TD Scorer artifact is malformed.");
        if (data.season !== season || data.week !== current.week) throw new Error(`Week ${current.week} TD Scorer data unavailable; artifact targets another slate.`);
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error: unknown) => { if (!cancelled) setState({ loading: false, error: error instanceof Error ? error.message : "TD Scorer data failed to load.", data: null }); });
    return () => { cancelled = true; };
  }, [season, current.loading, current.error, current.week]);
  return { ...state, currentWeek: current.week };
}
