/**
 * WU4A team opportunity model — types.
 *
 * The team opportunity model describes the OFFENSE/TEAM ENVIRONMENT for one
 * team entering one game: how many eligible run/pass plays it should run,
 * and what fraction of those should be dropbacks. It deliberately contains
 * no player identity or player history — it is the finite pool that WU4B
 * will later allocate to players.
 *
 * "Plays" here means nflfastR eligible rush + pass plays (the compact
 * play-volume cache's `eligible_plays`), which by construction equals
 * `pass_plays + rush_plays`. It EXCLUDES kneels, spikes, two-point
 * attempts, and penalty-nullified plays. "Pass attempts" means dropbacks
 * (`pass_plays`: attempts + sacks + scrambles). "Rush attempts" means
 * designed rushes (`rush_plays`, excludes scrambles). By this accounting
 * `pass_attempts + rush_attempts == team_plays` exactly, with no hidden
 * sack/kneel/scramble residual.
 */

export const NFL_TEAM_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION = "nfl-team-opportunity-feature-row-v1" as const;
export const NFL_TEAM_OPPORTUNITY_PROJECTION_SCHEMA_VERSION = "nfl-team-opportunity-projection-v1" as const;
export const NFL_TEAM_OPPORTUNITY_TEMPORAL_CONTRACT = "weekly-snapshot-v1" as const;

/** Model family + semantic version (Model Versioning Guide format). */
export const NFL_TEAM_OPPORTUNITY_MODEL_NAME = "nfl-team-opportunity" as const;
export const NFL_TEAM_OPPORTUNITY_MODEL_VERSION = "nfl-team-opportunity-ridge-market-v1.0.0" as const;
export const NFL_TEAM_OPPORTUNITY_FEATURE_SCHEMA_VERSION = NFL_TEAM_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION;
export const NFL_TEAM_OPPORTUNITY_PIPELINE_VERSION = "nfl-team-opportunity-archive-v1" as const;

/**
 * Three separate raw windows, never blended into one number here (choosing
 * a blend is model-fitting, done in `teamOpportunityModel.ts`). `null` (not
 * zero) when a window has no games.
 */
export type NflWindowedScalar = {
  seasonPrior: number | null;
  last3: number | null;
  priorSeason: number | null;
};

export type NflTeamOpportunityFeatures = {
  teamOffense: {
    offensivePlaysPerGame: NflWindowedScalar;
    dropbackRate: NflWindowedScalar;
    rushAttemptsPerGame: NflWindowedScalar;
    passAttemptsPerGame: NflWindowedScalar;
    earlyDownNeutralPassRate: NflWindowedScalar;
    passRateOverExpected: NflWindowedScalar;
  };
  opponentDefense: {
    offensivePlaysPerGameAllowed: NflWindowedScalar;
    dropbackRateAllowed: NflWindowedScalar;
  };
  /**
   * Pregame market/game context. Used ONLY as pregame information and only
   * promoted into the projection when walk-forward validation supports it.
   */
  market: {
    spread: number | null;
    total: number | null;
    impliedTeamTotal: number | null;
    isHome: 0 | 1;
    isNeutralSite: 0 | 1;
  };
};

export type NflTeamOpportunityTarget = {
  /** Actual eligible rush+pass plays (`eligible_plays`). */
  offensivePlays: number;
  /** Actual dropbacks / actual eligible plays. */
  dropbackRate: number;
  /** Actual dropbacks (`pass_plays`). */
  passAttempts: number;
  /** Actual designed rushes (`rush_plays`). */
  rushAttempts: number;
};

export type NflTeamOpportunityFeatureRow = {
  schemaVersion: typeof NFL_TEAM_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  neutralSite: boolean;
  gameDateUtc: string;
  features: NflTeamOpportunityFeatures;
  diagnostics: {
    gamesPlayedPriorThisSeason: number;
    hasPriorSeason: boolean;
    opponentGamesPriorThisSeason: number;
    opponentHasPriorSeason: boolean;
  };
  /** Present only for historical rows (never for a live/current-week target). */
  target?: NflTeamOpportunityTarget;
};

export type NflTeamOpportunityModelStatus = "projected" | "eligibleInsufficientHistory";

export type NflTeamOpportunityRow = {
  schemaVersion: typeof NFL_TEAM_OPPORTUNITY_PROJECTION_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  neutralSite: boolean;
  kickoff: string;
  generatedAt: string;
  modelName: typeof NFL_TEAM_OPPORTUNITY_MODEL_NAME;
  modelVersion: string;
  status: NflTeamOpportunityModelStatus;
  projectedTeamPlays: number;
  projectedDropbackRate: number;
  projectedPassAttempts: number;
  projectedRushAttempts: number;
  flags: {
    noPriorSeasonHistory: boolean;
    opponentNoPriorSeasonHistory: boolean;
    playsClampApplied: boolean;
    dropbackRateClampApplied: boolean;
    marketContextAvailable: boolean;
  };
  featureSnapshot: {
    teamOffense: NflTeamOpportunityFeatures["teamOffense"];
    opponentDefense: NflTeamOpportunityFeatures["opponentDefense"];
    market: NflTeamOpportunityFeatures["market"];
  };
  diagnostics: NflTeamOpportunityFeatureRow["diagnostics"] & {
    playsBeforeClamp: number;
    dropbackRateBeforeClamp: number;
  };
};

export type NflTeamOpportunityQaSummary = {
  gamesExpected: number;
  gamesResolved: number;
  teamRowsEmitted: number;
  eligibleInsufficientHistoryRows: number;
  bothTeamsPresentForEveryGame: boolean;
  coherenceViolations: number;
  playsRange: { min: number; max: number; mean: number };
  passAttemptsRange: { min: number; max: number; mean: number };
  rushAttemptsRange: { min: number; max: number; mean: number };
  dropbackRateRange: { min: number; max: number; mean: number };
  largestPlaysOutliers: { team: string; gameId: string; projectedTeamPlays: number }[];
};

export type NflTeamOpportunityArtifact = {
  schemaVersion: typeof NFL_TEAM_OPPORTUNITY_PROJECTION_SCHEMA_VERSION;
  season: number;
  week: number;
  generatedAt: string;
  generationMode: "currentWeek" | "historicalReplay";
  temporalContract: typeof NFL_TEAM_OPPORTUNITY_TEMPORAL_CONTRACT;
  modelName: typeof NFL_TEAM_OPPORTUNITY_MODEL_NAME;
  modelVersion: string;
  trainingSeasons: number[];
  marketSource: string;
  rows: NflTeamOpportunityRow[];
  qa: NflTeamOpportunityQaSummary;
};
