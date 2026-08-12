import { useEffect, useState } from "react";
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
}

export function useSinCityPerformance(): UseSinCityPerformanceResult {
  const [summary, setSummary] = useState<SinCityPerformanceSummaryFile | null>(null);
  const [history, setHistory] = useState<SinCityPerformanceFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(dataUrl("sin-city-performance-summary.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading sin-city-performance-summary.json`);
        return res.json() as Promise<SinCityPerformanceSummaryFile>;
      }),
      fetch(dataUrl("sin-city-performance.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading sin-city-performance.json`);
        return res.json() as Promise<SinCityPerformanceFile>;
      }),
    ])
      .then(([summaryData, historyData]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setHistory(historyData);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setSummary(null);
        setHistory(null);
        setError(reason instanceof Error ? reason.message : "Failed to load Sin City performance data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { summary, history, loading, error };
}
