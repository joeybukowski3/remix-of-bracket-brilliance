import { useQuery } from "@tanstack/react-query";
import type { MoneylineApiResponse } from "@/lib/mlb/polymarketMoneylines";

async function fetchMoneylines(): Promise<MoneylineApiResponse> {
  const resp = await fetch("/api/mlb/polymarket-moneylines");
  if (!resp.ok) throw new Error(`Polymarket fetch failed: ${resp.status}`);
  return resp.json();
}

export function usePolymarketMlbMoneylines() {
  return useQuery<MoneylineApiResponse>({
    queryKey: ["polymarket-mlb-moneylines"],
    queryFn: fetchMoneylines,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: 2,
    retryDelay: 5_000,
  });
}
