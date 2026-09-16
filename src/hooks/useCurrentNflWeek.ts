import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { resolveNflWeekSelection } from "@/lib/nfl/weekSelection";

/** Current slate comes from the schedule, never from available projection files. */
export function useCurrentNflWeek(season: number) {
  const schedule = useNflSeasonData(season);
  return {
    loading: schedule.loading,
    error: schedule.error,
    week: resolveNflWeekSelection(schedule.data?.games ?? []).week,
  };
}
