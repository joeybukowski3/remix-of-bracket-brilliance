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
        if (data.schemaVersion !== "nfl-touchdown-preview-v1" || !Array.isArray(data.players) || data.players.length === 0) throw new Error("TD Scorer artifact is malformed.");
        if (data.season !== season || !Number.isInteger(data.week)) throw new Error("TD Scorer artifact has an invalid season or week.");
        // Never pass off an archived board as a current-week projection.
        // Allow only the immediately preceding week with an explicit archived label.
        if (data.week !== current.week && data.week !== current.week - 1) {
          throw new Error(`Week ${current.week} TD Scorer data unavailable; artifact targets another slate.`);
        }
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error: unknown) => { if (!cancelled) setState({ loading: false, error: error instanceof Error ? error.message : "TD Scorer data failed to load.", data: null }); });
    return () => { cancelled = true; };
  }, [season, current.loading, current.error, current.week]);
  return { ...state, currentWeek: current.week, archivedWeek: state.data && current.week !== null && state.data.week < current.week ? state.data.week : null };
}
