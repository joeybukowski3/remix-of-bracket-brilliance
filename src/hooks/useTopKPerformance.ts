import { useEffect, useState } from "react";
import type { TopKPerformanceFile, TopKPerformanceSummaryFile } from "@/types/mlbTopKPerformance";

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}data/mlb/${path}`;
}

interface UseTopKPerformanceResult {
  summary: TopKPerformanceSummaryFile | null;
  history: TopKPerformanceFile | null;
  loading: boolean;
  error: string | null;
}

export function useTopKPerformance(): UseTopKPerformanceResult {
  const [summary, setSummary] = useState<TopKPerformanceSummaryFile | null>(null);
  const [history, setHistory] = useState<TopKPerformanceFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(dataUrl("top-k-performance-summary.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading top-k-performance-summary.json`);
        return res.json() as Promise<TopKPerformanceSummaryFile>;
      }),
      fetch(dataUrl("top-k-performance.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading top-k-performance.json`);
        return res.json() as Promise<TopKPerformanceFile>;
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
        setError(reason instanceof Error ? reason.message : "Failed to load Top K Props performance data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { summary, history, loading, error };
}
