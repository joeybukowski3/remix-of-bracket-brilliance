// CFB Model V2 Phase 8 — connectivity-aware ratings + adaptive prior decay.
// Consumes frozen Phase 0-7 outputs read-only (Phase 2 ridge/eval primitives,
// Phase 3 priors, Phase 4 scoring regression, Phase 6/7 market join for the
// downstream diagnostic only). IPR's Phase 0-7 modules are never modified —
// see architectureGuard.test.ts.

/** Per-team schedule-graph metrics at ONE (season, week) cutoff — built ONLY from games completed strictly before `week`. */
export type TeamGraphMetrics = {
  teamExternalId: string;
  componentId: number;
  componentSize: number;
  uniqueOpponents: number; // unweighted degree
  weightedDegree: number; // games played (== gamesPlayedEnteringWeek)
  crossConferenceOpponents: number;
};

export type WeekGraphSnapshot = {
  season: number;
  week: number;
  componentCount: number;
  byTeam: Map<string, TeamGraphMetrics>;
};

export type LambdaCandidateId = "GLOBAL_BASELINE" | "GAMES_PLAYED" | "COMPONENT_SIZE" | "CROSS_CONFERENCE" | "COMBINED_INFORMATION";

export type StalenessFormId = "NONE" | "THRESHOLD_RAMP" | "BOUNDED_LOGISTIC";

/** A fully-specified Phase 8 candidate: which connectivity multiplier (if any) and which staleness-decay form (if any) modulate the per-team prior-centered Ridge penalty. */
export type Phase8CandidateSpec = {
  id: string;
  label: string;
  baseLambda: number;
  connectivity: LambdaCandidateId;
  staleness: StalenessFormId;
  /** Staleness-form parameters, only used when staleness !== "NONE". */
  stalenessFloor?: number;
  stalenessThresholdLow?: number;
  stalenessThresholdHigh?: number;
};

export type Phase8Prediction = {
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
  homeComponentSize: number | null;
  awayComponentSize: number | null;
  homeGamesPlayed: number | null;
  awayGamesPlayed: number | null;
  homeConference: string | null;
  awayConference: string | null;
  homeTransitionTeam: boolean;
  awayTransitionTeam: boolean;
  homeStaleness: number | null;
  awayStaleness: number | null;
};

export type EvalRow = { n: number; mae: number | null; rmse: number | null; correlation: number | null; calibrationSlope: number | null; calibrationIntercept: number | null };
