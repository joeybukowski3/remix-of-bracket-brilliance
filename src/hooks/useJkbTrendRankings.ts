import { useEffect, useMemo, useState } from "react";
import { normalizePlayerKey } from "@/lib/pga/historyModel";

export type JkbTrendConfidence = "official" | "provisional" | "unranked";

export type JkbTrendRanking = {
  player: string;
  rank: number | null;
  trendScore: number | null;
  recent20: number | null;
  baseline: number | null;
  vsBaseline: number | null;
  recent20Percentile?: number | null;
  vsBaselinePercentile?: number | null;
  finishForm: number | null;
  roundsUsed: number;
  startsUsed: number;
  latestRoundDate: string | null;
  confidence: JkbTrendConfidence;
  sourceCounts: Record<string, number>;
};

export type JkbTrendPayload = {
  version: number;
  name: string;
  generatedAt: string;
  asOf?: string;
  validation?: { status?: "valid" | "invalid" };
  sources?: Record<string, {
    status?: "available" | "unavailable";
    usableRoundCount?: number;
    rejectedRoundCount?: number;
    newestUsableRoundDate?: string | null;
    sourceUrl?: string;
  }>;
  players: JkbTrendRanking[];
};

export function useJkbTrendRankings() {
  const [payload, setPayload] = useState<JkbTrendPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/data/pga/jkb-trend-rankings.json", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Trend ranking request failed (${response.status})`);
        const payload = await response.json() as JkbTrendPayload;
        if (payload.version >= 2 && payload.validation?.status !== "valid") {
          throw new Error("Trend ranking validation status is not valid");
        }
        return payload;
      })
      .then((nextPayload) => {
        if (!active) return;
        setPayload(nextPayload);
        setError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setPayload(null);
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const rankingMap = useMemo(
    () => new Map((payload?.players ?? []).map((row) => [normalizePlayerKey(row.player), row])),
    [payload],
  );

  return { payload, rankingMap, loading, error };
}
