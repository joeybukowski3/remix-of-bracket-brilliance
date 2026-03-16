import { useQuery } from "@tanstack/react-query";

export interface ScheduleGame {
  id: string;
  name: string;
  shortName: string;
  date: string;
  status: string;
  statusDetail: string;
  completed: boolean;
  venue: string;
  broadcast: string;
  odds: {
    provider: string;
    details: string;
    overUnder: number | null;
    homeMoneyline: number | null;
    awayMoneyline: number | null;
  } | null;
  homeTeam: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string;
    score: string;
    seed: number | null;
    record: string;
  } | null;
  awayTeam: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string;
    score: string;
    seed: number | null;
    record: string;
  } | null;
}

export function useSchedule(date?: string) {
  return useQuery({
    queryKey: ["schedule", date],
    queryFn: async (): Promise<ScheduleGame[]> => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const queryStr = date ? `?date=${date}` : '';
      const resp = await fetch(`${supabaseUrl}/functions/v1/espn-schedule${queryStr}`, {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
      });

      if (!resp.ok) {
        throw new Error(`Failed to fetch schedule: ${resp.status}`);
      }

      const result = await resp.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch schedule");
      }

      return result.games;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
