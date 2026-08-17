import { useEffect, useState } from "react";
import type { KPlusEvArtifact } from "@/lib/mlb/kPlusEvSourceAdapter";

const K_PLUS_EV_URL = "/data/mlb/k-plus-ev.json";
const POLL_INTERVAL_MS = 10 * 60 * 1000;

export type MlbKPlusEvState = {
  loading: boolean;
  status: "loading" | "valid" | "missing" | "invalid";
  artifact: KPlusEvArtifact | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidArtifact(payload: unknown): payload is KPlusEvArtifact {
  return isRecord(payload) && Array.isArray(payload.pitchers) && typeof payload.date === "string";
}

/** Loads the K +EV V1 source artifact (public/data/mlb/k-plus-ev.json). Independent of the K Projection V2 shadow hook. */
export function useMlbKPlusEv(enabled: boolean): MlbKPlusEvState {
  const [state, setState] = useState<MlbKPlusEvState>({ loading: enabled, status: "loading", artifact: null });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, status: "loading", artifact: null });
      return;
    }
    let active = true;

    async function load() {
      try {
        const response = await fetch(K_PLUS_EV_URL, { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          setState({ loading: false, status: "missing", artifact: null });
          return;
        }
        const payload = (await response.json()) as unknown;
        if (!active) return;
        if (!isValidArtifact(payload)) {
          setState({ loading: false, status: "invalid", artifact: null });
          return;
        }
        setState({ loading: false, status: "valid", artifact: payload });
      } catch {
        if (!active) return;
        setState({ loading: false, status: "missing", artifact: null });
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enabled]);

  return state;
}
