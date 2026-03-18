import { useQuery } from "@tanstack/react-query";

export interface Last10Record {
  wins: number;
  losses: number;
}

interface Last10Response {
  teams: Record<string, Last10Record>;
  fetchedAt: string;
  cached: boolean;
}

export function useLast10() {
  return useQuery<Last10Response>({
    queryKey: ["last10"],
    queryFn: async () => {
      const resp = await fetch("/api/last10");
      if (!resp.ok) throw new Error(`last10 API returned ${resp.status}`);
      return resp.json();
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}
