import { createContext, useContext, useEffect, useState } from "react";
import type { CanonicalNflTeam, NflDataMeta, NflGameRecord, NflResultRecord } from "@/lib/nfl/standings";

export type NflSeasonData = {
  teams: CanonicalNflTeam[];
  games: NflGameRecord[];
  results: NflResultRecord[];
  gamesMeta: NflDataMeta | null;
  resultsMeta: NflDataMeta | null;
};

type State = { loading: boolean; error: string | null; data: NflSeasonData | null };

type SeasonJson = { teams?: CanonicalNflTeam[]; games?: NflGameRecord[]; results?: NflResultRecord[]; _meta?: NflDataMeta };

/** The public files one season is built from (served from public/data, copied to dist/data). */
export function nflSeasonDataPaths(season: number) {
  return {
    teams: "/data/nfl/teams.json",
    games: `/data/nfl/${season}/games.json`,
    results: `/data/nfl/${season}/results.json`,
  } as const;
}

/** Shapes the three parsed season files exactly as the hook exposes them. */
export function toNflSeasonData(teamsJson: SeasonJson, gamesJson: SeasonJson, resultsJson: SeasonJson): NflSeasonData {
  return {
    teams: teamsJson.teams ?? [],
    games: gamesJson.games ?? [],
    results: resultsJson.results ?? [],
    gamesMeta: gamesJson._meta ?? null,
    resultsMeta: resultsJson._meta ?? null,
  };
}

/**
 * Build-time prerender only: season data read from the deployment's own
 * dist/data files, keyed by season. The browser app never provides it, so the
 * hook starts in its loading state and fetches exactly as before.
 */
export const NflSeasonDataSeedContext = createContext<ReadonlyMap<number, NflSeasonData> | null>(null);

/**
 * Loads canonical teams + the generated season files from public/data/nfl.
 * Follows the site's existing pattern (see PgaHubShared): runtime fetch with
 * cache: "no-store" so refreshed pipeline data shows without a rebuild.
 */
export function useNflSeasonData(season: number): State {
  const seed = useContext(NflSeasonDataSeedContext)?.get(season) ?? null;
  const [state, setState] = useState<State>(() =>
    seed ? { loading: false, error: null, data: seed } : { loading: true, error: null, data: null },
  );

  useEffect(() => {
    let cancelled = false;
    const paths = nflSeasonDataPaths(season);
    setState({ loading: true, error: null, data: null });
    Promise.all([
      fetch(paths.teams, { cache: "no-store" }),
      fetch(paths.games, { cache: "no-store" }),
      fetch(paths.results, { cache: "no-store" }),
    ])
      .then(async ([teamsRes, gamesRes, resultsRes]) => {
        if (!teamsRes.ok || !gamesRes.ok || !resultsRes.ok) {
          throw new Error(`NFL data unavailable for ${season}.`);
        }
        const teamsJson = await teamsRes.json();
        const gamesJson = await gamesRes.json();
        const resultsJson = await resultsRes.json();
        if (cancelled) return;
        setState({ loading: false, error: null, data: toNflSeasonData(teamsJson, gamesJson, resultsJson) });
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
