import { useEffect, useState } from "react";
import type { CanonicalNflTeam, NflDataMeta, NflGameRecord, NflResultRecord } from "@/lib/nfl/standings";

export type NflSeasonData = {
  teams: CanonicalNflTeam[];
  games: NflGameRecord[];
  results: NflResultRecord[];
  gamesMeta: NflDataMeta | null;
  resultsMeta: NflDataMeta | null;
};

type State = { loading: boolean; error: string | null; data: NflSeasonData | null };

/**
 * Loads canonical teams + the generated season files from public/data/nfl.
 * Follows the site's existing pattern (see PgaHubShared): runtime fetch with
 * cache: "no-store" so refreshed pipeline data shows without a rebuild.
 */
export function useNflSeasonData(season: number): State {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    Promise.all([
      fetch("/data/nfl/teams.json", { cache: "no-store" }),
      fetch(`/data/nfl/${season}/games.json`, { cache: "no-store" }),
      fetch(`/data/nfl/${season}/results.json`, { cache: "no-store" }),
    ])
      .then(async ([teamsRes, gamesRes, resultsRes]) => {
        if (!teamsRes.ok || !gamesRes.ok || !resultsRes.ok) {
          throw new Error(`NFL data unavailable for ${season}.`);
        }
        const teamsJson = await teamsRes.json();
        const gamesJson = await gamesRes.json();
        const resultsJson = await resultsRes.json();
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          data: {
            teams: teamsJson.teams ?? [],
            games: gamesJson.games ?? [],
            results: resultsJson.results ?? [],
            gamesMeta: gamesJson._meta ?? null,
            resultsMeta: resultsJson._meta ?? null,
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
