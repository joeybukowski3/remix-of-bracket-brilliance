import { useQuery } from "@tanstack/react-query";
import rawKenPomData from "@/data/kenpom.json";

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

const staticKenPomData: KenPomData = {
  teams: (rawKenPomData as { team: string; adjOERank: number; adjDERank: number }[]).map((entry, index) => ({
    teamName: entry.team,
    adjOERank: entry.adjOERank,
    adjDERank: entry.adjDERank,
    overallRank: index + 1,
    adjOE: 0,
    adjDE: 0,
  })),
  source: "kenpom",
  fetchedAt: new Date().toISOString(),
};

export function useKenPom() {
  return useQuery<KenPomData>({
    queryKey: ["kenpom"],
    queryFn: () => Promise.resolve(staticKenPomData),
    staleTime: Infinity,
  });
}
