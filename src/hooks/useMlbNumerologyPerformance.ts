import { useEffect, useMemo, useState } from "react";
import type { NumerologyPerformanceFile, NumerologyPerformanceSummary } from "@/types/mlbNumerologyPerformance";

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}data/mlb/numerology/${path}`;
}

interface UseMlbNumerologyPerformanceResult {
  summary: NumerologyPerformanceSummary | null;
  history: NumerologyPerformanceFile | null;
  loading: boolean;
  error: string | null;
  summaryError: string | null;
  historyError: string | null;
}

export function useMlbNumerologyPerformance(): UseMlbNumerologyPerformanceResult {
  const [summary, setSummary] = useState<NumerologyPerformanceSummary | null>(null);
  const [history, setHistory] = useState<NumerologyPerformanceFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      fetch(dataUrl("performance-summary.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading numerology performance-summary.json`);
        return res.json() as Promise<NumerologyPerformanceSummary>;
      }),
      fetch(dataUrl("performance.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading numerology performance.json`);
        return res.json() as Promise<NumerologyPerformanceFile>;
      }),
    ]).then(([summaryResult, historyResult]) => {
      if (cancelled) return;

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setSummaryError(null);
      } else {
        setSummary(null);
        setSummaryError(summaryResult.reason instanceof Error ? summaryResult.reason.message : "Failed to load numerology summary.");
      }

      if (historyResult.status === "fulfilled") {
        setHistory(historyResult.value);
        setHistoryError(null);
      } else {
        setHistory(null);
        setHistoryError(historyResult.reason instanceof Error ? historyResult.reason.message : "Failed to load numerology performance history.");
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const error = useMemo(() => historyError ?? summaryError, [historyError, summaryError]);

  return { summary, history, loading, error, summaryError, historyError };
}
