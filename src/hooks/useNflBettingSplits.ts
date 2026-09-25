import { useEffect, useState } from "react";
import { assessNflDkSplitsAvailability, NFL_DK_SPLITS_PATH, type NflDkSplitsAvailability } from "../lib/nfl/bettingSplitsData";

type State = { loading: boolean; error: string | null } & NflDkSplitsAvailability;

/** Read-only current artifact loader; no page consumes it in WU2B. */
export function useNflBettingSplits(expected: { season: number; week: number }): State {
  const [loaded, setLoaded] = useState<{ loading: boolean; error: string | null; raw: unknown }>({ loading: true, error: null, raw: null });
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded({ loading: true, error: null, raw: null });
    fetch(NFL_DK_SPLITS_PATH, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`NFL betting splits unavailable (${response.status}).`);
        setLoaded({ loading: false, error: null, raw: await response.json() });
        setNowMs(Date.now());
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoaded({ loading: false, error: error.message, raw: null });
      });
    return () => controller.abort();
  }, [expected.season, expected.week]);
  return { loading: loaded.loading, error: loaded.error, ...assessNflDkSplitsAvailability(loaded.raw, expected, nowMs) };
}
