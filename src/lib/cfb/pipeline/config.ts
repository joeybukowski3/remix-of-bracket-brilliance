export const CFB_PIPELINE_CONFIG = Object.freeze({
  priorSeason: 2025,
  ratingSeason: 2026,
  opponentAdjustmentIterations: 12,
  opponentAdjustmentStrength: 0.55,
  minimumGames: 1,
  fcsPolicy: "retain-raw-exclude-opponent-adjustment-and-sos" as const,
  provider: "CollegeFootballData.com (CFBD API v2)" as const,
  modelProvenance: "model-computed" as const,
});

export const CFB_TRANSITION_TEAM_PRIOR_FALLBACKS = Object.freeze([
  Object.freeze({ teamId: "ndsu", cfbdName: "North Dakota State", sourceClassification: "fcs" as const }),
  Object.freeze({ teamId: "sac", cfbdName: "Sacramento State", sourceClassification: "fcs" as const }),
]);
