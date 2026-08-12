import { useEffect, useState } from "react";
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
}

export function useMlbNumerologyPerformance(): UseMlbNumerologyPerformanceResult {
  const [summary, setSummary] = useState<NumerologyPerformanceSummary | null>(null);
  const [history, setHistory] = useState<NumerologyPerformanceFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(dataUrl("performance-summary.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading numerology performance-summary.json`);
        return res.json() as Promise<NumerologyPerformanceSummary>;
      }),
      fetch(dataUrl("performance.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading numerology performance.json`);
        return res.json() as Promise<NumerologyPerformanceFile>;
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
        setError(reason instanceof Error ? reason.message : "Failed to load numerology performance data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { summary, history, loading, error };
}
