// CFB Model V2 — production artifact contracts (Phase 10 §9-§13, WU1).
//
// IPR/MIC boundary (Phase 10 §6): every rating field here is Independent
// Predictive Rating (IPR) — derived only from CFBD box-score/schedule/
// roster data, never market data. A bare, ambiguous `powerRating` field is
// intentionally never used; each field name/namespace makes its provenance
// unambiguous. See production/v2/architectureGuard.test.ts for the
// enforcement side of this rule.

import type { CfbV2CalibrationVersion, CfbV2ModelVersion, CfbV2ProbabilityVersion, CfbV2ScoringVersion } from "./versions";
import type { CfbV2PriorTier } from "./config";

/**
 * Marks a value as Independent Predictive Rating — derived only from CFBD
 * box-score/schedule/roster data, never from market data. Purely a type-
 * level namespace/marker; see `CfbV2TeamRating` for the concrete shape.
 */
export type CfbIprNamespace = "ipr";

/**
 * Marks a value as Market-Informed Consensus — any rating/projection that
 * blends market data in (today's V1.1 `marketAnchor.ts` output is a MIC,
 * even though it predates this name). No MIC type is defined in this
 * module: production/v2 is IPR-only by construction (§16 architecture
 * guard forbids importing marketAnchor.ts from this directory).
 */
export type CfbMicNamespace = "mic";

// ---------------------------------------------------------------------------
// §9 — Production team-rating contract.
// ---------------------------------------------------------------------------

export type CfbV2RatingStatus = "computed" | "insufficient-data";

export type CfbV2Connectivity = {
  componentSize: number;
  regularizationMultiplier: number;
};

/**
 * IPR team rating for one team, as of a given week. Every provenance field
 * is required (never optional) — an artifact row that omits provenance is
 * a type error, not a runtime surprise (WU1 §9/§13).
 */
export type CfbV2TeamRating = {
  // Identity
  teamId: string;
  season: number;
  /** Ratings reflect games completed strictly before this week (Phase 10 §13 — a completed-game-set cutoff, not a calendar week). */
  asOfWeek: number;
  modelVersion: CfbV2ModelVersion;

  // Ratings (IPR — standardized, never raw box-score numbers)
  offenseRating: number;
  defenseRating: number;
  /** 0.5*(offense+defense) — display convenience, not a model input. */
  overallRating: number;

  // Prior/context
  preseasonPriorOffense: number | null;
  preseasonPriorDefense: number | null;
  priorTier: CfbV2PriorTier;
  gamesPlayed: number;
  /** Team classification at time of rating (e.g. FCS-transition detection). Null when unknown. */
  classification: string | null;

  // Connectivity
  connectivity: CfbV2Connectivity;

  // Availability/status
  ratingStatus: CfbV2RatingStatus;

  // Provenance
  configVersion: string;
  generatedAt: string;
  dataAsOf: string;
};

// ---------------------------------------------------------------------------
// §10 — Production game-projection contract.
// ---------------------------------------------------------------------------

export type CfbV2MatchupPopulation = "fbs_vs_fbs" | "fbs_vs_fcs" | "unsupported";

export type CfbV2ProjectionStatus = "computed" | "unavailable";

/**
 * IPR game projection for one scheduled game. Deliberately excludes: edge,
 * EV, recommendedSide, confidenceBet, units, or any market-adjusted value
 * (Phase 10 §10/§27 — this is an analytics product, not a picks product).
 */
export type CfbV2GameProjection = {
  // Identity
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;

  // Independent model output (null when matchupPopulation !== "fbs_vs_fbs" or projectionStatus === "unavailable")
  expectedHomePoints: number | null;
  expectedAwayPoints: number | null;
  /** home - away. See legacyCompat.ts for the UI-spread sign conversion. */
  projectedMargin: number | null;
  projectedTotal: number | null;
  homeWinProbability: number | null;
  awayWinProbability: number | null;

  // Intervals
  marginInterval80: [number, number] | null;
  totalInterval80: [number, number] | null;

  // Metadata
  matchupPopulation: CfbV2MatchupPopulation;
  projectionStatus: CfbV2ProjectionStatus;
  modelVersion: CfbV2ModelVersion;
  scoringVersion: CfbV2ScoringVersion;
  calibrationVersion: CfbV2CalibrationVersion;
  probabilityVersion: CfbV2ProbabilityVersion;
  configVersion: string;
  generatedAt: string;
  dataAsOf: string;
};
