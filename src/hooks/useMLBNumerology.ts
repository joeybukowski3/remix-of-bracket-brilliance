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

function normalizeNumerologyData(value: unknown): NumerologyDailyData {
  if (!value || typeof value !== "object") throw new Error("Invalid numerology payload.");
  const raw = value as Record<string, unknown>;
  if (typeof raw.date !== "string" || !raw.dailyProfile) throw new Error("Numerology payload is incomplete.");
  return {
    ...(raw as unknown as NumerologyDailyData),
    featuredPlays: Array.isArray(raw.featuredPlays) ? raw.featuredPlays as NumerologyDailyData["featuredPlays"] : [],
    watchlist: Array.isArray(raw.watchlist) ? raw.watchlist as NumerologyDailyData["watchlist"] : [],
    countercurrents: Array.isArray(raw.countercurrents) ? raw.countercurrents as NonNullable<NumerologyDailyData["countercurrents"]> : [],
  };
}

export function useMLBNumerology(): UseMLBNumerologyResult {
  const [data, setData] = useState<NumerologyDailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL || "/";
    const url = `${base.endsWith("/") ? base : `${base}/`}data/mlb/numerology-daily.json`;

    fetch(url, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return normalizeNumerologyData(await response.json());
      })
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(reason instanceof Error ? reason.message : "Failed to load numerology data.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const isStale = data != null && data.date !== getEtDate();
  return { data, loading, error, isStale };
}
