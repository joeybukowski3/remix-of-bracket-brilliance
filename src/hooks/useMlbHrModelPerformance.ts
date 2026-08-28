import { useEffect, useMemo, useState } from "react";
import type { HrModelPerformanceSummary, HrPredictionHistoryFile, HrPredictionRecord } from "@/types/mlbHrModelPerformance";
import { isDateInWindow } from "@/lib/mlb/performancePreviewWindows";

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}data/mlb/${path}`;
}

// hr-prediction-history.json is ~41MB (full model history back to launch) while
// this tracker only ever displays Yesterday/7D/30D. There is no existing
// smaller "recent" artifact to read instead, and generating a purpose-built
// recent-window artifact is a pipeline change deferred to a later phase (see
// performance-preview audit, HR payload section). As the lowest-risk mitigation
// available without touching the generation pipeline, this hook:
//   1. only fetches history when `enabled` is true (the HR tab is active), and
//   2. immediately discards every record older than RECENT_RETENTION_DAYS
//      after parsing, so the full 41MB array is never held in memory or
//      re-scanned by every window/band filter on every render.
// The 41MB network transfer itself is not eliminated by this change -- that
// requires a smaller generated artifact and is documented as remaining work.
const RECENT_RETENTION_DAYS = 40;

function trimToRecentHistory(records: HrPredictionRecord[]): HrPredictionRecord[] {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return records.filter((r) => r.date >= cutoffStr || isDateInWindow(r.date, "last30"));
}

interface UseMlbHrModelPerformanceResult {
  summary: HrModelPerformanceSummary | null;
  history: HrPredictionHistoryFile | null;
  loading: boolean;
  error: string | null;
  summaryError: string | null;
  historyError: string | null;
}

export function useMlbHrModelPerformance(enabled = true): UseMlbHrModelPerformanceResult {
  const [summary, setSummary] = useState<HrModelPerformanceSummary | null>(null);
  const [history, setHistory] = useState<HrPredictionHistoryFile | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);

    Promise.allSettled([
      fetch(dataUrl("hr-model-performance.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading hr-model-performance.json`);
        return res.json() as Promise<HrModelPerformanceSummary>;
      }),
      fetch(dataUrl("hr-prediction-history.json"), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading hr-prediction-history.json`);
        return res.json() as Promise<HrPredictionHistoryFile>;
      }),
    ]).then(([summaryResult, historyResult]) => {
      if (cancelled) return;

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setSummaryError(null);
      } else {
        setSummary(null);
        setSummaryError(summaryResult.reason instanceof Error ? summaryResult.reason.message : "Failed to load HR model summary.");
      }

      if (historyResult.status === "fulfilled") {
        setHistory({ ...historyResult.value, records: trimToRecentHistory(historyResult.value.records) });
        setHistoryError(null);
      } else {
        setHistory(null);
        setHistoryError(historyResult.reason instanceof Error ? historyResult.reason.message : "Failed to load HR prediction history.");
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [enabled]);

  const error = useMemo(() => historyError ?? summaryError, [historyError, summaryError]);

  return { summary, history, loading, error, summaryError, historyError };
}
