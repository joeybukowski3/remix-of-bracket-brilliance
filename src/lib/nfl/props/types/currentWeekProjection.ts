/**
 * Phase 9: canonical current-week (production-candidate) yardage projection
 * artifact schema. Extends the Phase 7 projection envelope
 * (`types/projectionOutput.ts`) and reuses the Phase 8 Matchup Score schema
 * (`types/matchupScore.ts`) verbatim -- a current-week row embeds a real
 * `NflYardageMatchupScore` rather than re-declaring flat score fields, so
 * there is exactly one Matchup Score shape in this codebase. Adds only the
 * operational fields a live weekly run needs: history status, estimated
 * range, hard-case flags, provenance, and a QA summary. No sportsbook line,
 * edge, probability, confidence, or betting field exists anywhere in this
 * schema -- see the Phase 9 report, "No sportsbook integration".
 */
import type { NflProjectionMarket, NflProjectionStatus } from "./projectionOutput";
import type { NflYardageMatchupScore } from "./matchupScore";
import type { NflPropPosition } from "./identity";

export const NFL_CURRENT_WEEK_PROJECTION_SCHEMA_VERSION = "nfl-current-week-yardage-projection-v1" as const;

/**
 * How much target-season/prior-season history backs this player's own
 * rolling features. Distinct from `NflProjectionStatus`: a player can be
 * pregame-eligible (`status: "projected"`) and still carry
 * `historyStatus: "limitedHistory"` -- diagnostic only, never used to lower
 * a Matchup Score (Phase 8 principle, preserved here).
 */
export type NflCurrentWeekHistoryStatus = "normal" | "limitedHistory" | "noHistory";

/** Pregame-observable hard-case flags. Diagnostics only -- never converted into a Matchup Score penalty or a confidence/betting score. */
export type NflCurrentWeekHardCaseFlags = {
  noHistory: boolean;
  limitedHistory: boolean;
  /** Passing only: more than one roster QB has a plausible claim on the start. */
  multiQbRoleUncertain: boolean;
  /** Rushing only: no single back holds a clearly dominant recent carry share. */
  committeeRole: boolean;
  /** Receiving only: meaningful chance of a true zero-target game given recent role. */
  zeroTargetRisk: boolean;
  /** Any market: the player's team this week differs from their most recent prior-season team. */
  teamChanged: boolean;
  /**
   * True whenever this row's market eligibility came from roster/role
   * evidence rather than a qualifying prior-season/current-season volume
   * threshold (Phase 9.1) -- i.e. a rookie, a new starter, or a
   * roster-scarcity-floor admit. Distinct from `noHistory`/`limitedHistory`
   * (which describe how much rolling data backs the projection): a player
   * can have `roleUncertain: false` and still be `noHistory` (a rookie who
   * IS the clear only-credible-starter, e.g. resolved as the sole ACT QB),
   * or `roleUncertain: true` with some thin history (a committee back with
   * a handful of games). Never used to lower a Matchup Score.
   */
  roleUncertain: boolean;
};

export type NflEstimatedRange = {
  estimatedLow: number;
  estimatedHigh: number;
  nominalLevel: number;
  /** Realized coverage was measured at 87-89% against a 90% nominal level on the 2025 frozen benchmark (Phase 7 Section 8) -- never presented as a guaranteed confidence interval. */
  intervalVersion: string;
};

export type NflCurrentWeekRowIdentity = {
  schemaVersion: typeof NFL_CURRENT_WEEK_PROJECTION_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string;
  kickoff: string;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  position: NflPropPosition;
  market: NflProjectionMarket;
  status: NflProjectionStatus;
  historyStatus: NflCurrentWeekHistoryStatus;
  generatedAt: string;
  modelVersion: string;
  /**
   * How this row's market eligibility was established. `"historicalVolume"`
   * -- the player cleared the Phase 5.5 prior-season/current-season
   * activity threshold (the large majority of rows). `"rosterScarcityFloor"`
   * -- no/insufficient historically-eligible players exist at this
   * position on this team, so an ACT roster candidate was admitted on
   * roster/role evidence alone (Phase 9.1); `roleUncertain` is always true
   * alongside this value, and the SPECIFIC player chosen among equally
   * unknown roster candidates is a deterministic tie-break, not a depth-
   * chart-informed pick -- no depth-chart/snap-share source exists in this
   * repository yet. `"starterHeuristic"` -- passing only: the row exists
   * because this player is the rolling-attempts leader (or sole candidate)
   * among this team's ACT quarterbacks, independent of whether that
   * leader's own history clears any threshold.
   */
  fallbackProvenance: "historicalVolume" | "rosterScarcityFloor" | "starterHeuristic";
};

export type NflCurrentWeekPassingRow = NflCurrentWeekRowIdentity & {
  market: "passing";
  position: "QB";
  projectedYards: number | null;
  directModelPrediction: number | null;
  estimatedRange: NflEstimatedRange | null;
  matchupScore: NflYardageMatchupScore | null;
  hardCaseFlags: NflCurrentWeekHardCaseFlags;
  diagnostics: { starterResolution: "rollingAttemptsLeader" | "onlyActiveQb" | "noHistoryFallback"; gamesStartedPriorThisSeason: number };
};

export type NflCurrentWeekRushingRow = NflCurrentWeekRowIdentity & {
  market: "rushing";
  projectedCarries: number | null;
  projectedYardsPerCarry: number | null;
  projectedYards: number | null;
  estimatedRange: NflEstimatedRange | null;
  matchupScore: NflYardageMatchupScore | null;
  hardCaseFlags: NflCurrentWeekHardCaseFlags;
  diagnostics: { gamesWithCarriesPriorThisSeason: number; recentTeamTopCarryShareConcentration: number | null };
};

export type NflCurrentWeekReceivingRow = NflCurrentWeekRowIdentity & {
  market: "receiving";
  positionSegment: "RB" | "WR" | "TE";
  projectedTargets: number | null;
  projectedYardsPerTarget: number | null;
  projectedYards: number | null;
  estimatedRange: NflEstimatedRange | null;
  matchupScore: NflYardageMatchupScore | null;
  hardCaseFlags: NflCurrentWeekHardCaseFlags;
  diagnostics: { gamesWithTargetsPriorThisSeason: number };
};

export type NflCurrentWeekProjectionRow = NflCurrentWeekPassingRow | NflCurrentWeekRushingRow | NflCurrentWeekReceivingRow;

/** Weekly-snapshot temporal contract -- see the Phase 9 report "Temporal contract selected". */
export const NFL_CURRENT_WEEK_TEMPORAL_CONTRACT = "weekly-snapshot-v1" as const;

export type NflCurrentWeekQaSummary = {
  gamesExpected: number;
  gamesResolved: number;
  playersEvaluated: number;
  projectionsEmittedByMarket: Record<NflProjectionMarket, number>;
  excludedByEligibility: Record<NflProjectionMarket, number>;
  limitedOrNoHistoryRows: Record<NflProjectionMarket, number>;
  unresolvedIdentityRows: number;
  /** Rows admitted via roster/role evidence rather than historical volume -- see `fallbackProvenance`. */
  roleUncertainRows: Record<NflProjectionMarket, number>;
  fallbackCounts: Record<string, number>;
  projectionYardsDistribution: Record<NflProjectionMarket, { n: number; mean: number | null; p10: number | null; p50: number | null; p90: number | null }>;
  matchupScoreDistribution: Record<NflProjectionMarket, { n: number; mean: number | null; p10: number | null; p50: number | null; p90: number | null }>;
  intervalWidthDistribution: Record<NflProjectionMarket, { n: number; mean: number | null; p10: number | null; p50: number | null; p90: number | null }>;
};

export type NflCurrentWeekProjectionArtifact = {
  schemaVersion: typeof NFL_CURRENT_WEEK_PROJECTION_SCHEMA_VERSION;
  season: number;
  week: number;
  generatedAt: string;
  generationMode: "currentWeek" | "historicalReplay";
  temporalContract: typeof NFL_CURRENT_WEEK_TEMPORAL_CONTRACT;
  modelVersions: Record<NflProjectionMarket, string>;
  scoreVersions: { scoreVersion: string; referenceDistributionVersion: string };
  sourceVersions: {
    trainingSeasons: readonly number[];
    rosterSnapshotSeason: number;
    rosterSnapshotWeek: number;
    marketSource: "matchup-market.json (live current-week feed)" | "unavailable";
  };
  rows: readonly NflCurrentWeekProjectionRow[];
  qa: NflCurrentWeekQaSummary;
};
