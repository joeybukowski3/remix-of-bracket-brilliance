import { useEffect, useState } from "react";

export type PowerRankingMetric = {
  value: number | null;
  rank: number | null;
  normalizedScore: number | null;
};

export type PowerRankingTeamMetrics = {
  era: PowerRankingMetric;
  fip: PowerRankingMetric;
  xba: PowerRankingMetric;
  ops: PowerRankingMetric;
  wrcPlus: PowerRankingMetric;
  runDifferential: PowerRankingMetric;
  scheduleAdjPerformance: PowerRankingMetric;
};

export type PowerRankingNextMonthGame = {
  date: string;
  opponent: string;
  opponentId: number;
  home: boolean;
};

export type PowerRankingTeam = {
  team: string;
  teamName: string;
  teamId: number;
  league: string;
  division: string;
  leagueId: number;
  divisionId: number;

  seasonRank: number | null;
  seasonCompositeScore: number | null;
  last30Rank: number | null;
  last30CompositeScore: number | null;

  record: string | null;
  gamesPlayed: number;
  runDifferential: number | null;

  currentSos: number | null;
  currentSosRank: number | null;

  next30Sos: number | null;
  next30SosRank: number | null;
  next30GamesCount: number;

  restOfSeasonSos: number | null;
  restOfSeasonSosRank: number | null;
  restOfSeasonGamesCount: number;

  seasonMetrics: PowerRankingTeamMetrics;
  last30Metrics: PowerRankingTeamMetrics;

  nextMonthGames: PowerRankingNextMonthGame[];
};

export type PowerRankingsPayload = {
  generatedAt: string;
  season: number;
  modelVersion: string;
  weights: Record<string, number>;
  teamsCount: number;
  teams: PowerRankingTeam[];
};

export function normalizePowerRankingsPayload(value: unknown): PowerRankingsPayload | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.teams)) return null;
  return v as unknown as PowerRankingsPayload;
}

export function useMlbPowerRankings() {
  const [data, setData] = useState<PowerRankingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/data/mlb/power-rankings.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => {
        if (!active) return;
        const normalized = normalizePowerRankingsPayload(json);
        if (!normalized) {
          setError("Power rankings data is unavailable.");
          setData(null);
        } else {
          setData(normalized);
          setError(null);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load power rankings.");
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}
