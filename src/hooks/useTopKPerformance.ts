import { useEffect, useMemo, useState } from "react";
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
  summaryError: string | null;
  historyError: string | null;
}

export function useTopKPerformance(): UseTopKPerformanceResult {
  const [summary, setSummary] = useState<TopKPerformanceSummaryFile | null>(null);
  const [history, setHistory] = useState<TopKPerformanceFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      fetch(dataUrl("top-k-performance-summary.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading top-k-performance-summary.json`);
        return res.json() as Promise<TopKPerformanceSummaryFile>;
      }),
      fetch(dataUrl("top-k-performance.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading top-k-performance.json`);
        return res.json() as Promise<TopKPerformanceFile>;
      }),
    ]).then(([summaryResult, historyResult]) => {
      if (cancelled) return;

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setSummaryError(null);
      } else {
        setSummary(null);
        setSummaryError(summaryResult.reason instanceof Error ? summaryResult.reason.message : "Failed to load Top K Props summary.");
      }

      if (historyResult.status === "fulfilled") {
        setHistory(historyResult.value);
        setHistoryError(null);
      } else {
        setHistory(null);
        setHistoryError(historyResult.reason instanceof Error ? historyResult.reason.message : "Failed to load Top K Props performance history.");
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const error = useMemo(() => historyError ?? summaryError, [historyError, summaryError]);

  return { summary, history, loading, error, summaryError, historyError };
}
