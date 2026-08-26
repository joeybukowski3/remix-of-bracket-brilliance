import type { CfbSeasonStats } from "../../data/cfb/types";
import type { CfbRankedStatMetric } from "./seasonStats/rankSeasonStats";

export type CfbTeamSeasonStatsRanks = Partial<Record<CfbRankedStatMetric, number>>;

export type CfbMatchupSeasonStatsContext = {
  /** e.g. "2026 Season" or "Last Season · 2025" — always render this, never hide it in a tooltip. */
  seasonLabel: string;
  season: number;
  isCurrentSeason: boolean;
  away: CfbSeasonStats;
  home: CfbSeasonStats;
  awayRanks: CfbTeamSeasonStatsRanks;
  homeRanks: CfbTeamSeasonStatsRanks;
};

type TeamSeasonStatsInput = {
  current: CfbSeasonStats;
  currentRanks: CfbTeamSeasonStatsRanks;
  previous: CfbSeasonStats | undefined;
  previousRanks: CfbTeamSeasonStatsRanks | undefined;
};

function emptySeasonStats(teamId: string): CfbSeasonStats {
  return {
    teamId,
    gamesPlayed: 0,
    pointsPerGame: null,
    yardsPerPlay: null,
    pointsPerPlay: null,
    rushYardsPerGame: null,
    yardsPerRush: null,
    passYardsPerGame: null,
    yardsPerPass: null,
    thirdDownPct: null,
    completionPct: null,
    turnovers: null,
    pointsAllowedPerGame: null,
    yardsPerPlayAllowed: null,
    opponentPointsPerPlay: null,
    rushYardsAllowedPerGame: null,
    yardsPerRushAllowed: null,
    passYardsAllowedPerGame: null,
    yardsPerPassAllowed: null,
    opponentThirdDownPct: null,
    opponentCompletionPct: null,
    takeaways: null,
  };
}

/**
 * Picks ONE coherent season for the whole matchup-detail Season Stats table
 * — current 2026 stats for both teams, or 2025 "Last Season" stats for both
 * teams, never a mix of the two seasons in the same comparison.
 *
 * Activation rule (deterministic, based on gamesPlayed — not calendar date):
 *   1. Current season activates only once BOTH teams have gamesPlayed > 0.
 *      A single team having played does not switch the table to current
 *      stats, because the other team's honest 0-game current row would look
 *      like a real (terrible) performance rather than "hasn't played yet".
 *   2. Otherwise, fall back to the previous season if EITHER team has
 *      previous-season data (gamesPlayed > 0). A team with no previous-season
 *      data (e.g. a first-year FBS transition team) renders as an honest
 *      null row on its side, still under the previous season's label —
 *      that is showing "the available side and null treatment for the
 *      missing side", not season-mixing, because both sides share one label.
 *   3. If neither season has usable data for either team, return null so the
 *      caller renders the existing compact "unavailable" placeholder.
 */
export function selectMatchupSeasonStatsContext(options: {
  currentSeason: number;
  currentSeasonLabel?: string;
  previousSeason: number | null;
  previousSeasonLabel?: string;
  away: TeamSeasonStatsInput;
  home: TeamSeasonStatsInput;
}): CfbMatchupSeasonStatsContext | null {
  const { currentSeason, previousSeason, away, home } = options;
  const currentSeasonLabel = options.currentSeasonLabel ?? `${currentSeason} Season`;

  const bothPlayedCurrent = away.current.gamesPlayed > 0 && home.current.gamesPlayed > 0;
  if (bothPlayedCurrent) {
    return {
      seasonLabel: currentSeasonLabel,
      season: currentSeason,
      isCurrentSeason: true,
      away: away.current,
      home: home.current,
      awayRanks: away.currentRanks,
      homeRanks: home.currentRanks,
    };
  }

  if (previousSeason !== null) {
    const previousSeasonLabel = options.previousSeasonLabel ?? `Last Season · ${previousSeason}`;
    const awayHasPrevious = (away.previous?.gamesPlayed ?? 0) > 0;
    const homeHasPrevious = (home.previous?.gamesPlayed ?? 0) > 0;
    if (awayHasPrevious || homeHasPrevious) {
      return {
        seasonLabel: previousSeasonLabel,
        season: previousSeason,
        isCurrentSeason: false,
        away: awayHasPrevious ? (away.previous as CfbSeasonStats) : emptySeasonStats(away.current.teamId),
        home: homeHasPrevious ? (home.previous as CfbSeasonStats) : emptySeasonStats(home.current.teamId),
        awayRanks: awayHasPrevious ? (away.previousRanks ?? {}) : {},
        homeRanks: homeHasPrevious ? (home.previousRanks ?? {}) : {},
      };
    }
  }

  return null;
}
