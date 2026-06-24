import { useEffect, useState } from "react";
import type { NumerologyDailyData } from "@/types/mlbNumerology";

function getEtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface UseMLBNumerologyResult {
  data: NumerologyDailyData | null;
  loading: boolean;
  error: string | null;
  isStale: boolean;
}

export function useMLBNumerology(): UseMLBNumerologyResult {
  const [data, setData] = useState<NumerologyDailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/data/mlb/numerology-daily.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: NumerologyDailyData) => {
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load numerology data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const isStale = data != null && data.date !== getEtDate();

  return { data, loading, error, isStale };
}
