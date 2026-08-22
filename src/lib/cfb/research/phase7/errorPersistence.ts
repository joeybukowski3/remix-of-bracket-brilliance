import { correlation } from "./statsUtils";
import { buildTeamSeries, lag1Pairs, longestSameDirectionStreak } from "./teamSeriesUtils";
import type { MissDatasetRow } from "./types";

export type ErrorPersistenceResult = {
  lag1CorrelationPooled: number | null;
  nPairs: number;
  meanLongestSameDirectionStreak: number | null;
  teamsWithEnoughGames: number;
};

const MIN_TEAM_GAMES = 8;

/**
 * Section 17 — team residual persistence. Signed residual per team-game:
 * (actualMargin - modelMargin) from that team's own perspective (positive
 * = team did better than the model implied for them, i.e. model UNDER-rated
 * them that week). Lag-1 correlation across consecutive appearances tests
 * whether a miss on Team X this week predicts the SAME-direction miss next
 * week they play — persistent residuals imply missing team-specific
 * information; near-zero correlation implies irreducible noise.
 */
export function buildErrorPersistenceAnalysis(rows: readonly MissDatasetRow[]): ErrorPersistenceResult {
  const byTeam = buildTeamSeries(
    rows,
    (r) => r.homeTeamExternalId,
    (r) => r.awayTeamExternalId,
    (r, isHome) => (isHome ? r.actualMargin - r.modelMargin : -(r.actualMargin - r.modelMargin)),
  );

  const { current, next } = lag1Pairs(byTeam);
  const lag1CorrelationPooled = correlation(current, next);

  const eligibleTeams = [...byTeam.values()].filter((series) => series.length >= MIN_TEAM_GAMES);
  const streaks = eligibleTeams.map((series) => longestSameDirectionStreak(series.map((s) => s.value)));
  const meanLongestSameDirectionStreak = streaks.length === 0 ? null : streaks.reduce((s, v) => s + v, 0) / streaks.length;

  return {
    lag1CorrelationPooled,
    nPairs: current.length,
    meanLongestSameDirectionStreak,
    teamsWithEnoughGames: eligibleTeams.length,
  };
}
