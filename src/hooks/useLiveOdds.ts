import { useQuery } from "@tanstack/react-query";

// Mirror of api/_lib/odds-service NormalizedOddsEvent — keep in sync.
export interface LiveOddsEvent {
  id: string;
  commenceTime: string;
  /** Full name from The Odds API, e.g. "Duke Blue Devils" */
  homeTeam: string;
  /** Full name from The Odds API, e.g. "Connecticut Huskies" */
  awayTeam: string;
  sportsbook: string;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  /** Vig-removed win probability for home team (0–1) */
  homeImpliedProb: number | null;
  /** Vig-removed win probability for away team (0–1) */
  awayImpliedProb: number | null;
  /** Point spread for home team (negative = favorite, e.g. -5.5) */
  homeSpread: number | null;
  /** Point spread for away team (positive = underdog, e.g. +5.5) */
  awaySpread: number | null;
  lastUpdated: string;
}

export function useLiveOdds() {
  return useQuery({
    queryKey: ["live-odds"],
    queryFn: async (): Promise<LiveOddsEvent[]> => {
      const resp = await fetch("/api/odds/current");
      if (!resp.ok) throw new Error(`Odds fetch failed: ${resp.status}`);
      const data = (await resp.json()) as { success: boolean; odds: LiveOddsEvent[] };
      return data.success ? data.odds : [];
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });
}
