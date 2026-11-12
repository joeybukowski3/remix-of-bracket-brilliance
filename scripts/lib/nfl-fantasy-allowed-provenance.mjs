/**
 * Provenance for public/data/nfl/fantasy-points-allowed.json: how much of the
 * completed schedule the artifact's ranks actually reflect.
 *
 * The artifact is a full deterministic rebuild from the nflverse player-week
 * cache, so every game the cache holds is already incorporated. But the cache
 * and results.json come from two independent publications, and either can lag
 * the other. Rather than leaving that implicit, the artifact states it, so the
 * page can say "Data through Week 9 (14 of 15 games)" instead of silently
 * presenting partial data as complete.
 *
 *   missingFinalGameIds  FINAL in results.json but not yet in the cache (upstream stats lag)
 *   notYetFinalGameIds   in the cache but results.json has not marked them FINAL (results lag)
 */
import { classifyPlayerWeekCoverage } from "./nfl-allowed-by-position-coverage.mjs";

/**
 * @param {{season:number, games:object[], results:object[], playerWeekRows:object[]}} input
 * @returns {{
 *   status: "complete"|"partial",
 *   finalGames: number,
 *   incorporatedGames: number,
 *   dataThroughWeek: number|null,
 *   missingFinalGameIds: string[],
 *   notYetFinalGameIds: string[]
 * }}
 */
export function buildFantasyAllowedCoverage({ season, games, results, playerWeekRows }) {
  const { summary } = classifyPlayerWeekCoverage({ season, results, games, playerWeekRows });
  const weeksWithData = Object.keys(summary.cacheGamesByWeek).map(Number).filter(Number.isFinite);
  const missingFinalGameIds = [...summary.missingFinalGameIds];
  const notYetFinalGameIds = [...summary.notYetFinalGameIds];
  return {
    status: missingFinalGameIds.length || notYetFinalGameIds.length ? "partial" : "complete",
    finalGames: summary.finalGames,
    incorporatedGames: summary.cacheGames,
    dataThroughWeek: weeksWithData.length ? Math.max(...weeksWithData) : null,
    missingFinalGameIds,
    notYetFinalGameIds,
  };
}
