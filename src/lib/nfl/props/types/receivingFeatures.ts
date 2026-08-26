export const NFL_RECEIVING_FEATURE_ROW_SCHEMA_VERSION = "nfl-receiving-feature-row-v1" as const;

export type NflWindowedRate = {
  seasonPrior: number | null;
  last3: number | null;
  priorSeason: number | null;
};

export type NflReceivingFeatures = {
  playerUsage: {
    targetsPerGame: NflWindowedRate;
    targetShare: NflWindowedRate;
  };
  playerEfficiency: {
    yardsPerTarget: NflWindowedRate;
    receptionsPerTarget: NflWindowedRate;
    yardsPerReception: NflWindowedRate;
  };
  /** Coverage-gated: see docs "Air-yard availability" -- null throughout if coverage was found insufficient to make load-bearing. */
  airYards: {
    adot: NflWindowedRate;
    airYardsShare: NflWindowedRate;
  };
  teamEnvironment: {
    passAttemptsPerGame: NflWindowedRate;
    overallDropbackRate: NflWindowedRate;
    passRateOverExpected: NflWindowedRate;
  };
  /** Team-level receiving-tree concentration -- the receiving analog of Phase 5's committee-concentration signal. */
  targetConcentration: {
    recentTeamTopTargetShareConcentration: NflWindowedRate;
  };
  opponentPassDefense: {
    targetsPerGameAllowed: NflWindowedRate;
    passEpaPerPlayAllowed: NflWindowedRate;
  };
  market: {
    spread: number | null;
    total: number | null;
    impliedTeamTotal: number | null;
    homeAway: "home" | "away" | null;
    isDome: boolean | null;
  };
};

export type NflReceivingDiagnostics = {
  position: "RB" | "WR" | "TE";
  gamesWithTargetsPriorThisSeason: number;
  hasPriorSeasonTargets: boolean;
  zeroTargetFlag: boolean;
  membershipSource: "statsTable" | "activeRosterConfirmed";
};

export type NflReceivingFeatureRow = {
  schemaVersion: typeof NFL_RECEIVING_FEATURE_ROW_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  team: string;
  opponent: string;
  playerId: string;
  playerName: string;
  target: {
    receivingYards: number;
  };
  features: NflReceivingFeatures;
  diagnostics: NflReceivingDiagnostics;
};
