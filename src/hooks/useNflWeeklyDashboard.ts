import { useMemo } from "react";
import { useNflCurrentRating2026, NFL_CURRENT_RATING_SEASON } from "@/hooks/useNflCurrentRating2026";
import { useNflMatchupMarket } from "@/hooks/useNflMatchupMarket";
import { useNflMatchupProjections } from "@/hooks/useNflMatchupProjections";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useWeeklyFantasyRankingArtifact } from "@/hooks/useWeeklyFantasyRankingArtifact";
import { fantasyRowsFromArtifact } from "@/lib/fantasy/weeklyDashboardFantasyAdapter";
import { buildWeeklyDashboard } from "@/lib/nfl/weeklyDashboard";
import { resolveNflWeekSelection } from "@/lib/nfl/weekSelection";

/** Loads canonical artifacts independently, then joins them through the pure dashboard builder. */
export function useNflWeeklyDashboard(search: string) {
  const season = useNflSeasonData(NFL_CURRENT_RATING_SEASON);
  const market = useNflMatchupMarket();
  const projections = useNflMatchupProjections();
  const ratings = useNflCurrentRating2026();
  const weekSelection = useMemo(
    () => resolveNflWeekSelection(season.data?.games ?? [], { search }),
    [season.data, search],
  );
  const fantasy = useWeeklyFantasyRankingArtifact(NFL_CURRENT_RATING_SEASON, weekSelection.week ?? 1);
  const fantasyRows = useMemo(
    () => fantasyRowsFromArtifact(fantasy.status === "ready" ? fantasy.rankings : null),
    [fantasy],
  );
  const dashboard = useMemo(
    () => {
      if (!season.data || weekSelection.week === null) return null;
      return buildWeeklyDashboard({
        season: NFL_CURRENT_RATING_SEASON,
        week: weekSelection.week,
        games: season.data.games,
        teams: season.data.teams,
        marketArtifact: market.artifact,
        projectionsArtifact: projections.artifact,
        currentRatings: ratings.data?.teams ?? null,
        fantasyRows,
      });
    }, [season.data, weekSelection.week, market.artifact, projections.artifact, ratings.data, fantasyRows],
  );

  const fantasyContextErrors = fantasy.status === "error" || fantasy.status === "missing" ? [fantasy.error.message] : [];

  return { dashboard, weekSelection, season, market, projections, ratings, fantasy: { ...fantasy, contextErrors: fantasyContextErrors } };
}
