import { useEffect, useState } from "react";
import type { WalterSeasonIndex, WalterWeekArtifact } from "@/lib/walter/types";

const SEASON = 2026;

type WeekState = {
  loading: boolean;
  error: string | null;
  data: WalterWeekArtifact | null;
};

type IndexState = {
  loading: boolean;
  error: string | null;
  weeks: number[];
};

/**
 * Fetches public/data/walter/{season}/index.json -- the list of weeks that
 * have any captured research -- for the week selector.
 */
export function useWalterSeasonIndex(): IndexState {
  const [state, setState] = useState<IndexState>({ loading: true, error: null, weeks: [] });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const response = await fetch(`/data/walter/${SEASON}/index.json`, { cache: "no-store", signal: controller.signal });
        if (response.status === 404) {
          if (!cancelled) setState({ loading: false, error: null, weeks: [] });
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as WalterSeasonIndex;
        if (!cancelled) setState({ loading: false, error: null, weeks: data.weeks ?? [] });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load Walter season index";
        setState({ loading: false, error: message, weeks: [] });
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return state;
}

/**
 * Fetches public/data/walter/{season}/week-{NN}.json for a given week.
 */
export function useWalterWeek(week: number | null): WeekState {
  const [state, setState] = useState<WeekState>({ loading: true, error: null, data: null });

  useEffect(() => {
    if (week == null) {
      setState({ loading: false, error: null, data: null });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setState({ loading: true, error: null, data: null });
      try {
        const weekPadded = String(week).padStart(2, "0");
        const response = await fetch(`/data/walter/${SEASON}/week-${weekPadded}.json`, { cache: "no-store", signal: controller.signal });
        if (response.status === 404) {
          if (!cancelled) setState({ loading: false, error: null, data: null });
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as WalterWeekArtifact;
        if (!cancelled) setState({ loading: false, error: null, data });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load Walter week research";
        setState({ loading: false, error: message, data: null });
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [week]);

  return state;
}

export { SEASON as WALTER_SEASON };
