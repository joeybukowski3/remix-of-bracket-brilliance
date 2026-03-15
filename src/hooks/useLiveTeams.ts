import { useQuery } from "@tanstack/react-query";
import type { LiveTeamMetadata } from "@/data/ncaaTeams";

export function useLiveTeams() {
  return useQuery({
    queryKey: ["live-teams"],
    queryFn: async (): Promise<LiveTeamMetadata[]> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const resp = await fetch(`${supabaseUrl}/functions/v1/espn-teams`, {
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
      });

      if (!resp.ok) {
        throw new Error(`Failed to fetch teams: ${resp.status}`);
      }

      const result = await resp.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch teams");
      }

      return result.teams;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}
