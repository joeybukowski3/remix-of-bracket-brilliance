import { useEffect, useState } from "react";
import type { NflCurrentWeekProjectionArtifact } from "@/lib/nfl/props/types/currentWeekProjection";
import { useCurrentNflWeek } from "@/hooks/useCurrentNflWeek";

type State = {
  loading: boolean;
  error: string | null;
  data: NflCurrentWeekProjectionArtifact | null;
};

/**
 * Loads `public/data/nfl/{season}/yardage-projections.json` (Phase 9
 * current-week yardage projection artifact). Fetch + basic shape check
 * only -- no model or scoring math lives here.
 */
export function useNflYardageProjections(season: number): State {
  const current = useCurrentNflWeek(season);
  const [state, setState] = useState<State>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    if (current.loading) return;
    if (current.error || current.week === null) {
      setState({ loading: false, error: current.error ?? "Current NFL schedule unavailable.", data: null });
      return;
    }

    fetch(`/data/nfl/${season}/yardage-projections.json`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Yardage projections unavailable (${response.status}).`);
        const json = (await response.json()) as NflCurrentWeekProjectionArtifact;
        if (!json || !Array.isArray(json.rows)) throw new Error("Yardage projections artifact is malformed.");
        if (json.season !== season || json.week !== current.week || json.rows.some((row) => row.season !== season || row.week !== current.week)) {
          throw new Error(`Week ${current.week} yardage projections unavailable; artifact targets another slate.`);
        }
        if (!cancelled) setState({ loading: false, error: null, data: json });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Yardage projections failed to load.";
        if (!cancelled) setState({ loading: false, error: message, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [season, current.loading, current.error, current.week]);

  return state;
}
