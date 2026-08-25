export const NFL_QB_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION = "nfl-qb-opportunity-feature-row-v1" as const;

export type NflWindowedRate = {
  seasonPrior: number | null;
  last3: number | null;
  priorSeason: number | null;
};

export type NflQbOpportunityFeatures = {
  teamVolume: {
    offensivePlaysPerGame: NflWindowedRate;
    passAttemptsPerGame: NflWindowedRate;
    rushAttemptsPerGame: NflWindowedRate;
  };
  passTendency: {
    overallDropbackRate: NflWindowedRate;
    earlyDownNeutralPassRate: NflWindowedRate;
    passRateOverExpected: NflWindowedRate;
  };
  /** Opponent's own defensive-allowed context, built by mirroring the team-volume/tendency window logic on the "opponent" side of the same compact play-volume records. */
  opponent: {
    offensivePlaysPerGameAllowed: NflWindowedRate;
    passAttemptsPerGameAllowed: NflWindowedRate;
    overallDropbackRateAllowed: NflWindowedRate;
  };
  market: {
    spread: number | null;
    total: number | null;
    impliedTeamTotal: number | null;
    homeAway: "home" | "away" | null;
  };
  qbRole: {
    /** This specific QB's own attempts-per-game over his own prior starts (not the team's). */
    attemptsPerGameSeasonPrior: number | null;
    attemptsPerGameLast3: number | null;
    attemptsPerGamePriorSeason: number | null;
    gamesStartedPriorThisSeason: number;
    hasPriorSeasonStarts: boolean;
    isFirstStartForTeamThisSeason: boolean;
  };
};

/** Outcome-derived; never a model input, kept for reporting/breakdown only. */
export type NflQbOpportunityDiagnostics = {
  instabilityCategory: "singleQbGame" | "multiQbGame";
  primaryQbAttemptShare: number | null;
};

export type NflQbOpportunityFeatureRow = {
  schemaVersion: typeof NFL_QB_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  team: string;
  opponent: string;
  primaryQbPlayerId: string;
  primaryQbPlayerName: string;
  target: {
    primaryQbAttempts: number;
  };
  features: NflQbOpportunityFeatures;
  diagnostics: NflQbOpportunityDiagnostics;
  split: "train" | "select" | "holdout";
};
