import { useQueries } from "@tanstack/react-query";
import { type ScheduleGame } from "@/hooks/useSchedule";

function getUpcomingDates(count: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${yyyy}${mm}${dd}`);
  }
  return dates;
}

async function fetchScheduleForDate(
  date: string,
  supabaseUrl: string,
  anonKey: string,
): Promise<ScheduleGame[]> {
  const resp = await fetch(
    `${supabaseUrl}/functions/v1/espn-schedule?date=${date}`,
    {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
    },
  );
  if (!resp.ok) throw new Error(`Failed to fetch schedule: ${resp.status}`);
  const result = await resp.json();
  if (!result.success) throw new Error(result.error || "Failed to fetch schedule");
  return result.games as ScheduleGame[];
}

export interface UpcomingScheduleResult {
  games: ScheduleGame[];
  isLoading: boolean;
  error: Error | null;
}

export function useUpcomingSchedule(daysAhead = 7): UpcomingScheduleResult {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const dates = getUpcomingDates(daysAhead);

  const results = useQueries({
    queries: dates.map((date) => ({
      queryKey: ["schedule", date],
      queryFn: () => fetchScheduleForDate(date, supabaseUrl, anonKey),
      staleTime: 60 * 1000,
      refetchInterval: 60 * 1000,
    })),
  });

  const isLoading = results.some((r) => r.isLoading) && results.every((r) => !r.data);
  const error =
    results.every((r) => r.error) && results[0]?.error
      ? (results[0].error as Error)
      : null;

  const seen = new Set<string>();
  const games: ScheduleGame[] = [];
  for (const result of results) {
    for (const game of result.data ?? []) {
      if (!seen.has(game.id)) {
        seen.add(game.id);
        games.push(game);
      }
    }
  }

  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return { games, isLoading, error };
}
