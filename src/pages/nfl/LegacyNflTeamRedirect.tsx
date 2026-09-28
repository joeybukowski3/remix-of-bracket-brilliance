import { Navigate, useLocation, useParams } from "react-router-dom";
import { nflTeamPath } from "@/lib/nfl/teamRoutes";

/**
 * Compatibility redirect: team dashboards moved from /nfl/guide/team/:teamSlug
 * to the permanent /nfl/teams/:teamSlug. On Vercel the server answers the
 * legacy path with a 301 (vercel.json) before this ever renders; this covers
 * in-app navigation, old client-side links and non-Vercel hosts. The slug is
 * passed through unchanged, so an unknown slug lands on the new route's own
 * invalid-team handling rather than being validated twice. Query and hash are
 * kept (e.g. #coach-of-year-case deep links).
 */
export default function LegacyNflTeamRedirect() {
  const { teamSlug = "" } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`${nflTeamPath(teamSlug)}${search}${hash}`} replace />;
}
