import { useEffect, useMemo, useState } from "react";
import {
  buildMajorHistoryMap,
  buildPlayerHistoryMap,
  type PgaMajorHistoryPayload,
  type PgaPlayerHistoryPayload,
} from "@/lib/pga/historyModel";

type HistoryState = {
  playerHistory: PgaPlayerHistoryPayload | null;
  majorHistory: PgaMajorHistoryPayload | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_MAJOR_HISTORY: PgaMajorHistoryPayload = {
  version: 1,
  source: "pga-tour",
  generatedAt: null,
  years: [],
  players: [],
};

export function usePgaPlayerHistory() {
  const [state, setState] = useState<HistoryState>({
    playerHistory: null,
    majorHistory: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [historyResponse, majorResponse] = await Promise.all([
          fetch("/data/pga/player-history.json", { cache: "no-store" }),
          fetch("/data/pga/major-history.json", { cache: "no-store" }),
        ]);

        if (!historyResponse.ok) {
          throw new Error(`Player history request failed with HTTP ${historyResponse.status}`);
        }

        const playerHistory = (await historyResponse.json()) as PgaPlayerHistoryPayload;
        const majorHistory = majorResponse.ok
          ? ((await majorResponse.json()) as PgaMajorHistoryPayload)
          : EMPTY_MAJOR_HISTORY;

        if (active) {
          setState({ playerHistory, majorHistory, loading: false, error: null });
        }
      } catch (error) {
        if (active) {
          setState({
            playerHistory: null,
            majorHistory: EMPTY_MAJOR_HISTORY,
            loading: false,
            error: error instanceof Error ? error.message : "Unable to load PGA history",
          });
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const playerHistoryMap = useMemo(
    () => buildPlayerHistoryMap(state.playerHistory),
    [state.playerHistory],
  );
  const majorHistoryMap = useMemo(
    () => buildMajorHistoryMap(state.majorHistory),
    [state.majorHistory],
  );

  return {
    ...state,
    playerHistoryMap,
    majorHistoryMap,
  };
}
