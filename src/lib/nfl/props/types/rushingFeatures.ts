export const NFL_RUSHING_FEATURE_ROW_SCHEMA_VERSION = "nfl-rushing-feature-row-v1" as const;

export type NflWindowedRate = {
  seasonPrior: number | null;
  last3: number | null;
  priorSeason: number | null;
};

export type NflRushingFeatures = {
  /** This player's own rolling usage. */
  playerUsage: {
    carriesPerGame: NflWindowedRate;
    carryShare: NflWindowedRate;
  };
  /** This player's own rolling efficiency. */
  playerEfficiency: {
    yardsPerCarry: NflWindowedRate;
  };
  /** Team-level rushing environment (Phase 2, reused) + pass tendency (rush volume is partly a residual of pass tendency). */
  teamEnvironment: {
    rushAttemptsPerGame: NflWindowedRate;
    overallDropbackRate: NflWindowedRate;
    passRateOverExpected: NflWindowedRate;
  };
  opponentRushDefense: {
    rushAttemptsPerGameAllowed: NflWindowedRate;
    rushEpaPerPlayAllowed: NflWindowedRate;
  };
  market: {
    spread: number | null;
    total: number | null;
    impliedTeamTotal: number | null;
    homeAway: "home" | "away" | null;
    isDome: boolean | null;
  };
};

export type NflRushingDiagnostics = {
  position: "QB" | "RB" | "WR" | "TE";
  isQb: boolean;
  gamesWithCarriesPriorThisSeason: number;
  hasPriorSeasonCarries: boolean;
  /** Team carry-share concentration among the top rusher over the player's own rolling window -- a committee-instability proxy, diagnostic/investigative only (see docs "Committee/role-volatility findings"). */
  recentTeamTopCarryShareConcentration: number | null;
};

export type NflRushingFeatureRow = {
  schemaVersion: typeof NFL_RUSHING_FEATURE_ROW_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  team: string;
  opponent: string;
  playerId: string;
  playerName: string;
  target: {
    rushingYards: number;
  };
  features: NflRushingFeatures;
  diagnostics: NflRushingDiagnostics;
};
