import { useEffect, useState } from "react";
import type { TopHrPerformanceFile, TopHrPerformanceSummaryFile } from "@/types/mlbTopHrPerformance";

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}data/mlb/${path}`;
}

interface UseTopHrPerformanceResult {
  summary: TopHrPerformanceSummaryFile | null;
  history: TopHrPerformanceFile | null;
  loading: boolean;
  error: string | null;
}

export function useTopHrPerformance(): UseTopHrPerformanceResult {
  const [summary, setSummary] = useState<TopHrPerformanceSummaryFile | null>(null);
  const [history, setHistory] = useState<TopHrPerformanceFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(dataUrl("top-hr-performance-summary.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading top-hr-performance-summary.json`);
        return res.json() as Promise<TopHrPerformanceSummaryFile>;
      }),
      fetch(dataUrl("top-hr-performance.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading top-hr-performance.json`);
        return res.json() as Promise<TopHrPerformanceFile>;
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
        setError(reason instanceof Error ? reason.message : "Failed to load Top HR Props performance data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { summary, history, loading, error };
}
