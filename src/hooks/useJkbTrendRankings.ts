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
  sources?: Record<string, { rounds?: number; sourceUrl?: string }>;
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
        return response.json() as Promise<JkbTrendPayload>;
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
