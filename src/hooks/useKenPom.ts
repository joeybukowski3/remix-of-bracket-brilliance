import { useQuery } from "@tanstack/react-query";

export interface KenPomTeam {
  teamName: string;
  overallRank: number;
  adjOE: number;
  adjOERank: number;
  adjDE: number;
  adjDERank: number;
}

export interface KenPomData {
  teams: KenPomTeam[];
  source: "kenpom" | "torvik" | null;
  fetchedAt: string;
  error?: string;
}

export function useKenPom() {
  return useQuery<KenPomData>({
    queryKey: ["kenpom"],
    queryFn: async (): Promise<KenPomData> => {
      const resp = await fetch("/api/kenpom");
      if (!resp.ok) throw new Error(`KenPom API error: ${resp.status}`);
      return resp.json() as Promise<KenPomData>;
    },
    staleTime: 6 * 60 * 60 * 1000, // 6 hours — matches server-side cache
    retry: 1,
  });
}
