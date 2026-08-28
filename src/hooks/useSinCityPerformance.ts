import { useEffect, useMemo, useState } from "react";
import type { SinCityPerformanceFile, SinCityPerformanceSummaryFile } from "@/types/mlbSinCity";

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}data/mlb/${path}`;
}

interface UseSinCityPerformanceResult {
  summary: SinCityPerformanceSummaryFile | null;
  history: SinCityPerformanceFile | null;
  loading: boolean;
  error: string | null;
  summaryError: string | null;
  historyError: string | null;
}

export function useSinCityPerformance(): UseSinCityPerformanceResult {
  const [summary, setSummary] = useState<SinCityPerformanceSummaryFile | null>(null);
  const [history, setHistory] = useState<SinCityPerformanceFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      fetch(dataUrl("sin-city-performance-summary.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading sin-city-performance-summary.json`);
        return res.json() as Promise<SinCityPerformanceSummaryFile>;
      }),
      fetch(dataUrl("sin-city-performance.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading sin-city-performance.json`);
        return res.json() as Promise<SinCityPerformanceFile>;
      }),
    ]).then(([summaryResult, historyResult]) => {
      if (cancelled) return;

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setSummaryError(null);
      } else {
        setSummary(null);
        setSummaryError(summaryResult.reason instanceof Error ? summaryResult.reason.message : "Failed to load Sin City summary.");
      }

      if (historyResult.status === "fulfilled") {
        setHistory(historyResult.value);
        setHistoryError(null);
      } else {
        setHistory(null);
        setHistoryError(historyResult.reason instanceof Error ? historyResult.reason.message : "Failed to load Sin City performance history.");
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const error = useMemo(() => historyError ?? summaryError, [historyError, summaryError]);

  return { summary, history, loading, error, summaryError, historyError };
}
