import { useEffect, useState } from "react";
import type { PowerRatingRow, ResultRow, TeamStatsRow } from "@/lib/nfl/powerRatingsReview";

type RatingsModel = {
  modelVersion: string;
  formula: string;
  weights: Record<string, number>;
  sources: string[];
  advancedMetricsAvailable: boolean;
  scheduleAdjustmentMethod: string;
};

type RatingsMeta = { generatedAt: string; source: string; notes: string[] };

export type NflRatingsReviewData = {
  meta: RatingsMeta | null;
  model: RatingsModel | null;
  ratings: PowerRatingRow[];
  teamStats: TeamStatsRow[];
  results: ResultRow[];
};

type State = { loading: boolean; error: string | null; data: NflRatingsReviewData | null };

/**
 * Loads the generated internal model files for one season. Follows the
 * useNflSeasonData pattern: runtime fetch of repo-local generated JSON with
 * cache "no-store". Never calls external hosts — the frontend must not
 * fetch nflverse; only the generator script does.
 */
export function useNflRatingsReview(season: number): State {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    Promise.all([
      fetch(`/data/nfl/${season}/power-ratings.json`, { cache: "no-store" }),
      fetch(`/data/nfl/${season}/team-stats.json`, { cache: "no-store" }),
      fetch(`/data/nfl/${season}/results.json`, { cache: "no-store" }),
    ])
      .then(async ([ratingsRes, statsRes, resultsRes]) => {
        if (!ratingsRes.ok || !statsRes.ok || !resultsRes.ok) {
          throw new Error(`Internal ratings data unavailable for ${season}.`);
        }
        const ratingsJson = await ratingsRes.json();
        const statsJson = await statsRes.json();
        const resultsJson = await resultsRes.json();
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          data: {
            meta: ratingsJson._meta ?? null,
            model: ratingsJson.model ?? null,
            ratings: ratingsJson.ratings ?? [],
            teamStats: statsJson.teamStats ?? [],
            results: resultsJson.results ?? [],
          },
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ loading: false, error: err.message, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [season]);

  return state;
}
