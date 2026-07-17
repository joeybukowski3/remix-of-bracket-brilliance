import { useEffect, useRef, useState } from "react";
// @ts-expect-error -- plain JS module, no type declarations
import { buildBvpHistoryKey } from "../../scripts/lib/mlb-bvp-history-core.mjs";

export type BvpHistorySplit = {
  pa: number | null;
  h: number | null;
  avg: number | null;
  hr: number | null;
};

export type BvpHistoryEntry = {
  key: string;
  batterId: number;
  pitcherId: number;
  batter: string | null;
  pitcher: string | null;
  career: BvpHistorySplit | null;
  last5y: BvpHistorySplit | null;
};

type HistoryPayload = {
  generatedAt?: string;
  source?: string;
  date?: string;
  history?: BvpHistoryEntry[];
};

type State = {
  loading: boolean;
  /** true only when the file itself could not be loaded at all (missing/malformed) */
  fileUnavailable: boolean;
  historyByKey: Map<string, BvpHistoryEntry>;
};

const POLL_INTERVAL_MS = 10 * 60 * 1000;

/** Builds the same key used by the generator, from a batter/pitcher identity pair. Display-only join -- never used in scoring, ranking, filtering, or sorting. */
export function keyForBvpRow(batterId: number | null | undefined, pitcherId: number | null | undefined): string | null {
  if (batterId == null || pitcherId == null) return null;
  return buildBvpHistoryKey(batterId, pitcherId) as string;
}

export function useMlbBvpHistory() {
  const [state, setState] = useState<State>({ loading: true, fileUnavailable: false, historyByKey: new Map() });
  const lastGeneratedAt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/data/mlb/bvp-history.json", { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          setState({ loading: false, fileUnavailable: true, historyByKey: new Map() });
          return;
        }
        const payload = (await response.json()) as HistoryPayload;
        if (!active) return;
        const generatedAt = payload?.generatedAt ?? null;
        if (generatedAt && generatedAt === lastGeneratedAt.current) return;
        lastGeneratedAt.current = generatedAt;
        const history = Array.isArray(payload?.history) ? payload.history : [];
        setState({
          loading: false,
          fileUnavailable: false,
          historyByKey: new Map(history.map((entry) => [entry.key, entry])),
        });
      } catch {
        if (!active) return;
        setState({ loading: false, fileUnavailable: true, historyByKey: new Map() });
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return state;
}
