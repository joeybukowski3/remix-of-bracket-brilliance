// CFB Model V2 Phase 4 — scoring model architecture. Builds on Phase 3
// (src/lib/cfb/research/phase3) only. Zero dependency on
// CfbResearchMarketLine, marketAnchor, MIC, or production config (see
// noMarketImportGuard.test.ts, mirrored here).

export type CfbHfaTreatment = "NONE" | "NATIONAL" | "SEASON_VARYING";
export type CfbScoringEnvironmentMode = "STATIC_HISTORICAL" | "PREVIOUS_SEASON" | "BLENDED_CURRENT";
export type CfbPaceTreatment = "NONE" | "RAW" | "SITUATION_NEUTRAL";

export type CfbSecondaryFeatureBlock = "PPA" | "SUCCESS" | "EXPLOSIVENESS";

/**
 * One team's side of one game, for the scoring regression. Response
 * variable is `actualPoints`. teamOffenseRating/opponentDefenseRating are
 * the SAME Ridge+prior ratings Phase 3 produced (recomputed here at the
 * same walk-forward cutoff, not reused verbatim — see ratingProvider.ts).
 */
export type ScoringObservation = {
  gameId: string;
  season: number;
  week: number;
  teamExternalId: string;
  opponentExternalId: string;
  teamClassification: string | null;
  opponentClassification: string | null;
  isHome: boolean;
  isNeutral: boolean;
  teamOffenseRating: number | null;
  opponentDefenseRating: number | null;
  teamPaceRaw: number | null;
  opponentPaceRaw: number | null;
  teamPaceSituationNeutral: number | null;
  opponentPaceSituationNeutral: number | null;
  teamPpaPerPlay: number | null;
  opponentPpaAllowed: number | null;
  teamSuccessRate: number | null;
  opponentSuccessRateAllowed: number | null;
  teamExplosiveRate: number | null;
  opponentExplosiveRateAllowed: number | null;
  /** Leakage-safe scoring-environment estimate at this row's (season, week) cutoff — see scoringEnvironment.ts. */
  scoringEnvironmentEstimate: number | null;
  actualPoints: number | null;
};

export type ScoringModelConfig = {
  hfa: CfbHfaTreatment;
  scoringEnvironment: CfbScoringEnvironmentMode;
  pace: CfbPaceTreatment;
  secondary: readonly CfbSecondaryFeatureBlock[];
  lambda: number;
  priorGamesWeight: number;
};

export type FittedScoringModel = {
  config: ScoringModelConfig;
  featureNames: string[];
  coefficients: number[];
  trainingSeasons: number[];
};

export type ScorePrediction = {
  gameId: string;
  season: number;
  week: number;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  expectedHomePoints: number | null;
  expectedAwayPoints: number | null;
  projectedMargin: number | null;
  projectedTotal: number | null;
  actualHomePoints: number | null;
  actualAwayPoints: number | null;
  actualMargin: number | null;
  actualTotal: number | null;
  matchupPopulation: "fbs_vs_fbs" | "fbs_vs_fcs" | "fcs_vs_fbs" | "non_fbs_only" | "unknown";
};
