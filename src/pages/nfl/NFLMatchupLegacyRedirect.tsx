import { useMemo } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import {
  LEGACY_NFL_MATCHUP_SEASON,
  NFL_MATCHUPS_BASE_PATH,
  nflMatchupPath,
  resolveUniqueNflMatchup,
} from "@/lib/nfl/matchupRoutes";

const GUIDE = getNflSeasonGuide(LEGACY_NFL_MATCHUP_SEASON)!;

/**
 * Compatibility redirect: matchup pages moved from the season-agnostic
 * /nfl/matchups/:gameSlug to /nfl/matchups/:season/week-:week/:gameSlug. On
 * Vercel the server answers every known legacy slug with a 301 (vercel.json)
 * before this renders; this covers in-app navigation, old client-side links,
 * non-Vercel hosts and any slug added to the schedule after the rules were
 * generated.
 *
 * Legacy URLs only ever meant a 2026 game, so the slug is resolved against the
 * 2026 schedule and redirected only when it names exactly one game. Unknown or
 * ambiguous slugs are never guessed: they fall back to the matchups landing
 * page. The legacy URL itself is always noindex. Query and hash are kept (e.g.
 * #trends deep links).
 */
export default function NFLMatchupLegacyRedirect() {
  const { gameSlug = "" } = useParams();
  const { search, hash } = useLocation();
  const { loading, data } = useNflSeasonData(LEGACY_NFL_MATCHUP_SEASON);

  const matchup = useMemo(
    () => (data ? resolveUniqueNflMatchup(data.games, GUIDE, LEGACY_NFL_MATCHUP_SEASON, gameSlug) : null),
    [data, gameSlug]
  );
  const target = matchup ? nflMatchupPath(matchup) : null;

  usePageSeo({
    title: "NFL Weekly Matchup | Joe Knows Ball",
    description: "NFL weekly matchup preview.",
    path: target ?? NFL_MATCHUPS_BASE_PATH,
    noindex: true,
  });

  if (loading) return <p className="text-sm text-slate-500">Loading matchup…</p>;
  if (!target) return <Navigate to={NFL_MATCHUPS_BASE_PATH} replace />;
  return <Navigate to={`${target}${search}${hash}`} replace />;
}
