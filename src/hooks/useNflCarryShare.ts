import { useEffect, useMemo, useState } from "react";
import playerWeekCsv from "../../data/nfl/nflverse/player-week-stats/stats_player_week_2026.csv?raw";
import { buildCarryShareSamples, parsePlayerWeekCarries, type CarryShareSample } from "@/lib/nfl/props/review/carryShare";

const playerWeeks = parsePlayerWeekCarries(playerWeekCsv);
const EMPTY_SAMPLES: ReadonlyMap<string, CarryShareSample> = new Map();

type Result = { gameId: string; season: number; seasonType: string; final: boolean };

/** Final-game gate stays current with the published results artifact. */
export function useNflCarryShare(season: number): ReadonlyMap<string, CarryShareSample> {
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCompletedIds(null);
    fetch(`/data/nfl/${season}/results.json`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("NFL results unavailable");
        return response.json() as Promise<{ results?: Result[] }>;
      })
      .then((data) => {
        if (controller.signal.aborted || !Array.isArray(data.results)) return;
        setCompletedIds(new Set(data.results.filter((r) => r.season === season && r.seasonType === "REG" && r.final === true).map((r) => r.gameId)));
      })
      .catch(() => { /* Unknown results leave Carry Share unavailable. */ });
    return () => controller.abort();
  }, [season]);

  return useMemo(() => completedIds ? buildCarryShareSamples(playerWeeks, completedIds, season) : EMPTY_SAMPLES, [completedIds, season]);
}
