import { useEffect, useState } from "react";
import type { HrModelPerformanceSummary, HrPredictionHistoryFile } from "@/types/mlbHrModelPerformance";

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}data/mlb/${path}`;
}

interface UseMlbHrModelPerformanceResult {
  summary: HrModelPerformanceSummary | null;
  history: HrPredictionHistoryFile | null;
  loading: boolean;
  error: string | null;
}

export function useMlbHrModelPerformance(): UseMlbHrModelPerformanceResult {
  const [summary, setSummary] = useState<HrModelPerformanceSummary | null>(null);
  const [history, setHistory] = useState<HrPredictionHistoryFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(dataUrl("hr-model-performance.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading hr-model-performance.json`);
        return res.json() as Promise<HrModelPerformanceSummary>;
      }),
      fetch(dataUrl("hr-prediction-history.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading hr-prediction-history.json`);
        return res.json() as Promise<HrPredictionHistoryFile>;
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
        setError(reason instanceof Error ? reason.message : "Failed to load HR model performance data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { summary, history, loading, error };
}
