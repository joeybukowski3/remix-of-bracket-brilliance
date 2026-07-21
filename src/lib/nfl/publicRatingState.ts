/**
 * Deterministic public rating-state selection for nfl-power-v0.3.0.
 *
 * Selection is driven by artifact validity and completed-game availability,
 * never by calendar date alone. Final-eight is not a primary public board.
 */

import type {
  NflV03FullSeasonArtifact,
  NflV03FullSeasonTeam,
  NflV03PreseasonArtifact,
  NflV03ReviewSeason,
} from "@/lib/nfl/v03Review";

export const NFL_V03_PUBLIC_RATING_STATES = Object.freeze([
  "preseason",
  "full_season",
] as const);

export type NflPublicRatingState = (typeof NFL_V03_PUBLIC_RATING_STATES)[number];

export type NflPublicWindowType = "preseason" | "full_season";

/** Minimum completed team-game appearances required before leaving preseason. */
export const NFL_V03_PUBLIC_MIN_COMPLETED_TEAM_GAMES = 1;

export type FullSeasonEligibility = {
  eligible: boolean;
  completedTeamGames: number;
  ratedTeamCount: number;
  reason:
    | "eligible"
    | "missing"
    | "season_mismatch"
    | "model_mismatch"
    | "empty"
    | "insufficient_games"
    | "insufficient_rated_teams";
};

export type PublicRatingSelectionInput = {
  season: NflV03ReviewSeason;
  preseason: NflV03PreseasonArtifact | null;
  fullSeason: NflV03FullSeasonArtifact | null;
  /** Set when the current-season full-season artifact failed to load/validate. */
  fullSeasonLoadFailed?: boolean;
};

export type PublicRatingSelection = {
  selectedState: NflPublicRatingState;
  windowType: NflPublicWindowType;
  season: NflV03ReviewSeason;
  sourceSeason: number;
  modelVersion: string | null;
  generatedAt: string | null;
  completedTeamGames: number;
  ratedTeamCount: number;
  fallbackUsed: boolean;
  /** Safe public copy; never internal diagnostics. */
  fallbackExplanation: string | null;
  title: string;
  subtitle: string;
  recordColumnLabel: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isFullSeasonTeamPubliclyRated(team: NflV03FullSeasonTeam): boolean {
  return (
    isFiniteNumber(team.adjustedComposite) &&
    isFiniteNumber(team.metrics?.offEpaPerPlay?.zScore) &&
    isFiniteNumber(team.metrics?.defEpaPerPlay?.zScore) &&
    team.metrics.offEpaPerPlay.missing !== true &&
    team.metrics.defEpaPerPlay.missing !== true &&
    isFiniteNumber(team.gamesPlayed) &&
    team.gamesPlayed > 0
  );
}

export function countCompletedTeamGames(
  fullSeason: NflV03FullSeasonArtifact | null | undefined
): number {
  if (!fullSeason?.teams?.length) return 0;
  return fullSeason.teams.reduce((sum, team) => {
    if (!isFiniteNumber(team.gamesPlayed) || team.gamesPlayed <= 0) return sum;
    return sum + team.gamesPlayed;
  }, 0);
}

export function countPubliclyRatedFullSeasonTeams(
  fullSeason: NflV03FullSeasonArtifact | null | undefined
): number {
  if (!fullSeason?.teams?.length) return 0;
  return fullSeason.teams.filter(isFullSeasonTeamPubliclyRated).length;
}

/**
 * Decide whether a validated full-season artifact is eligible as the public board.
 * Does not consult the calendar.
 */
export function evaluateFullSeasonPublicEligibility(
  fullSeason: NflV03FullSeasonArtifact | null | undefined,
  season: NflV03ReviewSeason,
  expectedModelVersion: string
): FullSeasonEligibility {
  if (!fullSeason) {
    return {
      eligible: false,
      completedTeamGames: 0,
      ratedTeamCount: 0,
      reason: "missing",
    };
  }
  if (fullSeason._meta?.season !== season) {
    return {
      eligible: false,
      completedTeamGames: countCompletedTeamGames(fullSeason),
      ratedTeamCount: countPubliclyRatedFullSeasonTeams(fullSeason),
      reason: "season_mismatch",
    };
  }
  if (fullSeason._meta?.modelVersion !== expectedModelVersion) {
    return {
      eligible: false,
      completedTeamGames: countCompletedTeamGames(fullSeason),
      ratedTeamCount: countPubliclyRatedFullSeasonTeams(fullSeason),
      reason: "model_mismatch",
    };
  }

  const completedTeamGames = countCompletedTeamGames(fullSeason);
  const ratedTeamCount = countPubliclyRatedFullSeasonTeams(fullSeason);

  if (!fullSeason.teams?.length || completedTeamGames === 0) {
    return {
      eligible: false,
      completedTeamGames,
      ratedTeamCount,
      reason: "empty",
    };
  }
  if (completedTeamGames < NFL_V03_PUBLIC_MIN_COMPLETED_TEAM_GAMES) {
    return {
      eligible: false,
      completedTeamGames,
      ratedTeamCount,
      reason: "insufficient_games",
    };
  }
  if (ratedTeamCount < 1) {
    return {
      eligible: false,
      completedTeamGames,
      ratedTeamCount,
      reason: "insufficient_rated_teams",
    };
  }

  return {
    eligible: true,
    completedTeamGames,
    ratedTeamCount,
    reason: "eligible",
  };
}

function preseasonCopy(season: NflV03ReviewSeason, sourceSeason: number): Pick<
  PublicRatingSelection,
  "title" | "subtitle" | "recordColumnLabel"
> {
  return {
    title: `${season} NFL Preseason Power Ratings`,
    subtitle: `Based on ${sourceSeason} regular-season performance`,
    recordColumnLabel: String(sourceSeason),
  };
}

function fullSeasonCopy(season: NflV03ReviewSeason): Pick<
  PublicRatingSelection,
  "title" | "subtitle" | "recordColumnLabel"
> {
  return {
    title: `${season} NFL Power Ratings`,
    subtitle: `Based on completed ${season} regular-season games`,
    recordColumnLabel: String(season),
  };
}

/**
 * Pure selection among available public rating states.
 * Final-eight is intentionally not a primary public state.
 */
export function selectPublicRatingState(
  input: PublicRatingSelectionInput,
  expectedModelVersion: string
): PublicRatingSelection {
  const { season, preseason, fullSeason, fullSeasonLoadFailed = false } = input;
  const eligibility = evaluateFullSeasonPublicEligibility(
    fullSeason,
    season,
    expectedModelVersion
  );

  if (eligibility.eligible && fullSeason) {
    const copy = fullSeasonCopy(season);
    return {
      selectedState: "full_season",
      windowType: "full_season",
      season,
      sourceSeason: season,
      modelVersion: fullSeason._meta.modelVersion,
      generatedAt: fullSeason._meta.generatedAt,
      completedTeamGames: eligibility.completedTeamGames,
      ratedTeamCount: eligibility.ratedTeamCount,
      fallbackUsed: false,
      fallbackExplanation: null,
      ...copy,
    };
  }

  const sourceSeason = preseason?.sourceSeason ?? season - 1;
  const copy = preseasonCopy(season, sourceSeason);
  const honestEmpty =
    !fullSeasonLoadFailed &&
    (eligibility.reason === "missing" ||
      eligibility.reason === "empty" ||
      eligibility.reason === "insufficient_games");

  return {
    selectedState: "preseason",
    windowType: "preseason",
    season,
    sourceSeason,
    modelVersion: preseason?._meta.modelVersion ?? null,
    generatedAt: preseason?._meta.generatedAt ?? null,
    completedTeamGames: eligibility.completedTeamGames,
    ratedTeamCount: 0,
    fallbackUsed: Boolean(fullSeasonLoadFailed) || !honestEmpty,
    fallbackExplanation:
      fullSeasonLoadFailed || !honestEmpty
        ? "Showing preseason ratings because current-season ratings are not available."
        : null,
    ...copy,
  };
}
