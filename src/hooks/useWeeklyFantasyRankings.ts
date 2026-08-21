import { useMemo } from "react";
import { useNflMatchupEpa } from "@/hooks/useNflMatchupEpa";
import { useNflMatchupMetrics } from "@/hooks/useNflMatchupMetrics";
import { useNflSuccessRates } from "@/hooks/useNflSuccessRates";
import {
  buildWeekOpponentMap,
  buildWeeklyRankingRows,
  WEEKLY_RANKING_POSITIONS,
  type WeeklyRankingRow,
} from "@/lib/fantasy/weeklyRankings";
import type { NflGameRecord } from "@/lib/nfl/standings";
import { createWeeklyStatResolver } from "@/lib/fantasy/weeklyStatResolver";
import type { WeeklyDashboardPosition } from "@/lib/nfl/weeklyDashboard";

export type WeeklyFantasyRowsByPosition = Record<WeeklyDashboardPosition, WeeklyRankingRow[]>;

/**
 * Shared canonical consumer for the weekly fantasy output.
 *
 * Ranking order and projected PPG remain owned by buildWeeklyRankingRows. This
 * hook only supplies its already-existing schedule and context-artifact inputs
 * so the full rankings page and the NFL command center consume identical rows.
 */
export function useWeeklyFantasyRankings(games: readonly NflGameRecord[], week: number | null) {
  const epa = useNflMatchupEpa();
  const metrics = useNflMatchupMetrics();
  const success = useNflSuccessRates();

  const opponentMap = useMemo(
    () => buildWeekOpponentMap(games, week ?? -1),
    [games, week],
  );
  const resolveStat = useMemo(
    () => createWeeklyStatResolver({ epa: epa.artifact, metrics: metrics.artifact, success: success.artifact }),
    [epa.artifact, metrics.artifact, success.artifact],
  );
  const rowsByPosition = useMemo(
    () => Object.fromEntries(
      WEEKLY_RANKING_POSITIONS.map((position) => [
        position,
        buildWeeklyRankingRows(position, opponentMap, resolveStat),
      ]),
    ) as WeeklyFantasyRowsByPosition,
    [opponentMap, resolveStat],
  );

  return {
    rowsByPosition,
    contextLoading: epa.loading || metrics.loading || success.loading,
    contextErrors: [epa.error, metrics.error, success.error].filter((error): error is string => Boolean(error)),
  };
}
