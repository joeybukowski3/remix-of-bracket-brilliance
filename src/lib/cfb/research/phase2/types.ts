// CFB Model V2 Phase 2 — opponent-adjustment tournament. Consumes only
// Phase 1 derived team-game metrics (data/cfb/research/derived). Zero
// dependency on CfbResearchMarketLine, marketAnchor, or any market module
// (see noMarketImportGuard.test.ts, mirrored for phase2/).

export type CfbGarbagePolicy = "NONE" | "SCORE_QUARTER" | "SOFT_WEIGHT";
export type CfbAggregationMode = "playWeighted" | "gameWeighted";
export type CfbOpponentAdjustmentMethod = "ITERATIVE" | "RIDGE" | "PARTIAL_POOLING";

/** One metric extracted from a Phase 1 team-game row, for one policy. */
export type CfbMetricName =
  | "ypp"
  | "ppp"
  | "ppaPerPlay"
  | "ppaSuccessRate"
  | "downDistanceSuccessRate"
  | "explosivePlayRate";

/**
 * One team's side of one game, flattened for opponent-adjustment input.
 * defenseAllowedValue is the OPPONENT's own offensive value in the same
 * game (defense-allowed is definitionally the other side's offense) —
 * joined from the opponent's row rather than stored twice.
 */
export type GameObservation = {
  gameId: string;
  season: number;
  week: number;
  teamExternalId: string;
  opponentExternalId: string;
  teamClassification: string | null;
  opponentClassification: string | null;
  isHome: boolean;
  isNeutral: boolean;
  offenseValue: number | null;
  defenseAllowedValue: number | null;
  /** playWeighted weight basis (the team's own policyVariant totalWeight); 1 for gameWeighted. */
  weight: number;
  actualTeamScore: number | null;
  actualOpponentScore: number | null;
};

export type TeamStrength = {
  teamExternalId: string;
  offense: number | null;
  defense: number | null; // higher = better (already sign-flipped from "allowed")
  gamesCount: number;
};

export type OpponentAdjustmentResult = {
  teams: TeamStrength[];
  leagueMean: number | null;
  method: CfbOpponentAdjustmentMethod;
};

export type WalkForwardPrediction = {
  season: number;
  week: number;
  gameId: string;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  ratingDifferential: number | null;
  predictedMargin: number | null;
  actualMargin: number | null;
};

export type EvaluationSummary = {
  n: number;
  mae: number | null;
  rmse: number | null;
  correlation: number | null;
  calibrationSlope: number | null;
  calibrationIntercept: number | null;
  directionalAccuracy: number | null;
};
