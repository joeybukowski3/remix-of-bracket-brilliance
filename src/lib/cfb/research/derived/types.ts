// CFB Model V2 Phase 1 — derived research metrics contracts. Consumes only
// src/lib/cfb/research/types.ts (CfbResearchGame/CfbResearchPlay). Must
// never import CfbResearchMarketLine or anything from market-line modules
// (see src/lib/cfb/research/derived/noMarketImportGuard.test.ts).

export type CfbGameMatchupPopulation =
  | "fbs_vs_fbs"
  | "fbs_vs_fcs"
  | "fcs_vs_fbs"
  | "non_fbs_only"
  | "unknown";

// ---------------------------------------------------------------------------
// Play-team identity QA (Section 2)
// ---------------------------------------------------------------------------

export type PlayTeamIdentityStatus = "resolved" | "unresolved" | "ambiguous" | "invalid_pairing";

export type PlayTeamIdentityAuditRow = {
  gameId: string;
  playId: string;
  status: PlayTeamIdentityStatus;
};

export type SeasonPlayTeamIdentityReport = {
  season: number;
  totalPlays: number;
  resolvedPlays: number;
  unresolvedPlays: number;
  ambiguousPlays: number;
  invalidPairingPlays: number;
  inconsistentMappingCount: number;
  resolutionPct: number;
};

// ---------------------------------------------------------------------------
// Play classification (Section 3)
// ---------------------------------------------------------------------------

export type CfbResearchPlayCategory =
  | "rush"
  | "pass"
  | "sack"
  | "penalty_no_play"
  | "kneel"
  | "spike"
  | "punt"
  | "kickoff"
  | "field_goal"
  | "pat"
  | "two_point_try"
  | "turnover"
  | "defensive_score"
  | "administrative"
  | "unknown";

export type ClassifiedResearchPlay = {
  playId: string;
  gameId: string;
  rawPlayType: string | null;
  category: CfbResearchPlayCategory;
  isTwoPointTry: boolean;
  isOvertime: boolean;
};

export type SeasonPlayTypeReport = {
  season: number;
  totalPlays: number;
  byCategory: Record<CfbResearchPlayCategory, number>;
  byRawPlayType: Array<{ rawPlayType: string; category: CfbResearchPlayCategory; count: number }>;
  unknownRawPlayTypes: string[];
};

// ---------------------------------------------------------------------------
// Garbage-time policy (Section 10)
// ---------------------------------------------------------------------------

export type CfbGarbageTimePolicyName = "NONE" | "SCORE_QUARTER" | "SOFT_WEIGHT" | "LEVERAGE";

export type CfbGarbageTimePolicyMetrics = {
  policy: CfbGarbageTimePolicyName;
  includedPlayCount: number;
  totalWeight: number;
  ypp: number | null;
  ppp: number | null;
  ppaPerPlay: number | null;
  ppaCoveredPlayCount: number;
  ppaCoveragePct: number;
  ppaSuccessRate: number | null;
  earlyDownPpaSuccessRate: number | null;
  passingDownPpaSuccessRate: number | null;
  downDistanceSuccessRate: number | null;
  earlyDownDownDistanceSuccessRate: number | null;
  passingDownDownDistanceSuccessRate: number | null;
  explosivePlayRate: number | null;
  explosivePassRate: number | null;
  explosiveRushRate: number | null;
  secondsPerPlay: number | null;
};

// ---------------------------------------------------------------------------
// Team-game aggregation (Section 12)
// ---------------------------------------------------------------------------

export type CfbHomeAwayNeutral = "home" | "away" | "neutral";

export type CfbDerivedTeamGameMetrics = {
  season: number;
  week: number;
  gameId: string;
  teamExternalId: string;
  teamId: string | null;
  opponentExternalId: string | null;
  opponentTeamId: string | null;
  classification: string | null;
  opponentClassification: string | null;
  homeAwayNeutral: CfbHomeAwayNeutral;
  matchupPopulation: CfbGameMatchupPopulation;

  totalNormalizedPlays: number;
  eligibleScrimmagePlays: number;
  ppaCoveredEligiblePlays: number;
  ppaCoveragePct: number;
  identityResolutionPct: number;
  metricsAvailable: boolean;

  situationNeutralSecondsPerPlay: number | null;
  situationNeutralPlayCount: number;

  // policyVariants.NONE is the unweighted/uncensored control and IS the
  // "raw" ypp/ppp/ppaPerPlay/success/explosive/pace baseline required by
  // Section 9 and Section 12 — kept as a single source of truth instead of
  // a separately duplicated "raw" field (see Section 12 design note in the
  // Work Unit 3 final report).
  policyVariants: Record<
    Exclude<CfbGarbageTimePolicyName, "LEVERAGE">,
    CfbGarbageTimePolicyMetrics
  > & { LEVERAGE: null };
};

// ---------------------------------------------------------------------------
// Season-to-date / rolling aggregation primitives (Section 13)
// ---------------------------------------------------------------------------

export type CfbAggregationMode = "playWeighted" | "gameWeighted";

export type CfbTeamSeasonToDateSlice = {
  teamExternalId: string;
  teamId: string | null;
  season: number;
  throughWeekExclusive: number;
  aggregationMode: CfbAggregationMode;
  policy: CfbGarbageTimePolicyName;
  gamesIncluded: number;
  metrics: CfbGarbageTimePolicyMetrics;
};
