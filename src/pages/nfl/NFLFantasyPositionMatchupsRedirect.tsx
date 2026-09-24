import { Navigate } from "react-router-dom";

/**
 * Compatibility redirect: the "Fantasy Position Matchup Comparison" feature
 * used to be its own nav destination at this route. It now lives as the
 * "Matchup Comparison" tab inside /nfl/fantasy-points-allowed, so any old
 * links or bookmarks to this route land on that tab instead of a 404.
 */
export default function NFLFantasyPositionMatchupsRedirect() {
  return <Navigate to="/nfl/fantasy-points-allowed?view=matchups" replace />;
}
