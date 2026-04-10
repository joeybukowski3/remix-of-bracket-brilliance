import { useQuery } from "@tanstack/react-query";

export type MLBStatKey = "xwOBA" | "xSLG" | "barrelRate" | "kPct" | "bbPct";

export interface MLBPercentilePlayer {
  id: string;
  name: string;
  teamId: string;
  stats: Record<MLBStatKey, number>;
  percentiles: Record<MLBStatKey, number>;
}

interface MLBPercentilesResponse {
  players: MLBPercentilePlayer[];
}

export function useMLBPercentilesSample() {
  return useQuery<MLBPercentilesResponse>({
    queryKey: ["mlb-percentiles-sample"],
    queryFn: async () => {
      const res = await fetch("/data/mlb-percentiles-sample.json");
      if (!res.ok) throw new Error("Failed to load MLB percentile sample");
      return (await res.json()) as MLBPercentilesResponse;
    },
    staleTime: 1000 * 60 * 5,
  });
}
