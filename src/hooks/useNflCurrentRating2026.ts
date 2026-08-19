import { useMemo } from "react";
import { useNflV03Artifacts } from "@/hooks/useNflV03Artifacts";
import { useNflV04Projection } from "@/hooks/useNflV04Projection";
import { useNflTeamPerformanceAnalytics } from "@/hooks/useNflTeamPerformanceAnalytics";
import { buildCurrentRatingBoard, type CurrentRatingBoard } from "@/lib/nfl/currentRating2026";
import type { NflV03ReviewSeason } from "@/lib/nfl/v03Review";

export const NFL_CURRENT_RATING_SEASON = 2026 as const satisfies NflV03ReviewSeason;

type State = {
  loading: boolean;
  error: string | null;
  data: CurrentRatingBoard | null;
};

/**
 * The one canonical current-OVR/OFF/DEF hook for NFL consumers.
 *
 * Composes three independently-validated loaders — useNflV03Artifacts for
 * the immutable preseason v0.3.1 OFF/DEF anchors, useNflV04Projection for
 * the immutable preseason v0.4 OVR anchor, and useNflTeamPerformanceAnalytics
 * for the live in-season Team Performance Rating — and hands them to the
 * framework-free blender in currentRating2026.ts. No page should read
 * useNflV03PublicPowerRatings, useNflV04Projection, or
 * useNflTeamPerformanceAnalytics directly to decide "current OVR/OFF/DEF" —
 * this hook is the single source of truth for those values.
 */
export function useNflCurrentRating2026(): State {
  const v03 = useNflV03Artifacts(NFL_CURRENT_RATING_SEASON);
  const v04 = useNflV04Projection();
  const performance = useNflTeamPerformanceAnalytics(NFL_CURRENT_RATING_SEASON);

  return useMemo<State>(() => {
    if (v03.loading || v04.loading || performance.loading) return { loading: true, error: null, data: null };
    if (v04.error) return { loading: false, error: v04.error, data: null };
    if (v03.error) return { loading: false, error: v03.error, data: null };
    if (performance.error) return { loading: false, error: performance.error, data: null };

    const preseasonV03 = v03.data?.artifacts.preseason ?? null;
    if (!v04.data || !preseasonV03 || !performance.data) {
      return {
        loading: false,
        error: "NFL current-season rating inputs are unavailable.",
        data: null,
      };
    }

    try {
      const board = buildCurrentRatingBoard({
        season: NFL_CURRENT_RATING_SEASON,
        v04Board: v04.data,
        preseasonV03,
        performanceAnalytics: performance.data,
      });
      return { loading: false, error: null, data: board };
    } catch (error) {
      return {
        loading: false,
        error:
          error instanceof Error ? error.message : "Unknown error building current NFL rating board",
        data: null,
      };
    }
  }, [v03.loading, v03.error, v03.data, v04.loading, v04.error, v04.data, performance.loading, performance.error, performance.data]);
}
