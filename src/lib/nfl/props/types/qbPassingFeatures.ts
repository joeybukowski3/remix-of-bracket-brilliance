export const NFL_QB_PASSING_FEATURE_ROW_SCHEMA_VERSION = "nfl-qb-passing-feature-row-v1" as const;

export type NflWindowedRate = {
  seasonPrior: number | null;
  last3: number | null;
  priorSeason: number | null;
};

export type NflQbPassingFeatures = {
  /** Team play-volume + this QB's own rolling attempts -- "how much will he throw." */
  opportunity: {
    offensivePlaysPerGame: NflWindowedRate;
    passAttemptsPerGame: NflWindowedRate;
    qbAttemptsPerGame: NflWindowedRate;
  };
  /** This QB's own efficiency -- "how well does he throw when he does." */
  qbEfficiency: {
    yardsPerAttempt: NflWindowedRate;
    completionPct: NflWindowedRate;
  };
  /** This QB's own rolling passing-yards-per-game -- Baseline B's raw input. Kept OUTSIDE the ablatable groups (it is the naive-rolling baseline itself, not a model feature group). */
  qbRollingPassingYardsPerGame: NflWindowedRate;
  /** Opponent's own defensive-allowed context. */
  opponentPassDefense: {
    passAttemptsPerGameAllowed: NflWindowedRate;
    overallDropbackRateAllowed: NflWindowedRate;
    passEpaPerPlayAllowed: NflWindowedRate;
  };
  /** Own-team pass-tendency/PROE, kept as its own ablation group per the Phase 4 brief. */
  proePassTendency: {
    overallDropbackRate: NflWindowedRate;
    earlyDownNeutralPassRate: NflWindowedRate;
    passRateOverExpected: NflWindowedRate;
  };
  market: {
    spread: number | null;
    total: number | null;
    impliedTeamTotal: number | null;
    homeAway: "home" | "away" | null;
    isDome: boolean | null;
  };
};

/** Outcome-derived; never a model input. */
export type NflQbPassingDiagnostics = {
  instabilityCategory: "singleQbGame" | "multiQbGame";
  primaryQbAttemptShare: number | null;
  hasPriorSeasonStarts: boolean;
  gamesStartedPriorThisSeason: number;
};

export type NflQbPassingFeatureRow = {
  schemaVersion: typeof NFL_QB_PASSING_FEATURE_ROW_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  team: string;
  opponent: string;
  primaryQbPlayerId: string;
  primaryQbPlayerName: string;
  target: {
    primaryQbPassingYards: number;
  };
  features: NflQbPassingFeatures;
  diagnostics: NflQbPassingDiagnostics;
};
