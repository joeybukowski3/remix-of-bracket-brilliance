import { useEffect, useState } from "react";
import type { SlotWideDefenseContextArtifact } from "@/lib/nfl/slotWideDefenseContext";

export function useNflSlotWideDefenseContext(season: number) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: SlotWideDefenseContextArtifact | null }>({ loading: true, error: null, data: null });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    fetch(`/data/nfl/${season}/slot-wide-defense-context.json`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Slot/wide defense context unavailable (${response.status}).`);
        const data = await response.json() as SlotWideDefenseContextArtifact;
        if (data.schemaVersion !== "nfl-slot-wide-defense-context-v1" || !Array.isArray(data.teams)) throw new Error("Slot/wide defense context artifact is malformed.");
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error: unknown) => { if (!cancelled) setState({ loading: false, error: error instanceof Error ? error.message : "Slot/wide defense context failed to load.", data: null }); });
    return () => { cancelled = true; };
  }, [season]);
  return state;
}
