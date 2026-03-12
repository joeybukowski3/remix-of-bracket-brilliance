import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      const params: Record<string, string> = {};
      if (date) params.date = date;

      const { data, error } = await supabase.functions.invoke("espn-schedule", {
        body: null,
        headers: { "Content-Type": "application/json" },
      });

      // For GET-style calls, we pass date as query param - but invoke doesn't support query params easily
      // So let's use fetch directly
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || `https://${projectId}.supabase.co`;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      
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
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // auto-refresh every minute
  });
}
