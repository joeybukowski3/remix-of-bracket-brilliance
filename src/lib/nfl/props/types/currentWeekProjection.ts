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
import type { NflWindowedRate } from "./qbPassingFeatures";

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

/**
 * Diagnostic-only snapshot of the literal (unshrunk-score, pre-Matchup-
 * Score-transform) pregame feature values the generator already computes
 * to produce this row -- a straight field-selection from the "ForTarget"
 * feature-row builders (`qbPassingFeatures.ts` / `rushingFeatures.ts` /
 * `receivingFeatures.ts`), never a new computation. Distinct from
 * `matchupScore.components.*.indicatorScores`, which are 0-100
 * percentile-style scores, not literal values. Never feeds `projectedYards`
 * or the Matchup Score -- purely presentation/diagnostic provenance for the
 * Yardage Props Review detail panel. Each `NflWindowedRate` explicitly
 * carries which prior-season/current-season window backs it
 * (seasonPrior/last3/priorSeason), so a null `seasonPrior` with a populated
 * `priorSeason` truthfully discloses an early-season fallback rather than
 * hiding it.
 */
export type NflCurrentWeekMarketContext = {
  spread: number | null;
  total: number | null;
  impliedTeamTotal: number | null;
  isDome: boolean | null;
};

export type NflCurrentWeekPassingFeatureSnapshot = {
  qbAttemptsPerGame: NflWindowedRate;
  yardsPerAttempt: NflWindowedRate;
  completionPct: NflWindowedRate;
  teamPassAttemptsPerGame: NflWindowedRate;
  teamDropbackRate: NflWindowedRate;
  earlyDownNeutralPassRate: NflWindowedRate;
  passRateOverExpected: NflWindowedRate;
  market: NflCurrentWeekMarketContext;
};

export type NflCurrentWeekRushingFeatureSnapshot = {
  carriesPerGame: NflWindowedRate;
  carryShare: NflWindowedRate;
  /** This player's own raw rolling YPC, pre-shrinkage -- distinct from `projectedYardsPerCarry`, the model's shrunk value. */
  rollingYardsPerCarry: NflWindowedRate;
  teamRushAttemptsPerGame: NflWindowedRate;
  teamDropbackRate: NflWindowedRate;
  teamPassRateOverExpected: NflWindowedRate;
  opponentRushAttemptsAllowedPerGame: NflWindowedRate;
  market: NflCurrentWeekMarketContext;
};

export type NflCurrentWeekReceivingFeatureSnapshot = {
  targetsPerGame: NflWindowedRate;
  targetShare: NflWindowedRate;
  /** This player's own raw rolling YPT, pre-shrinkage -- distinct from `projectedYardsPerTarget`, the model's shrunk value. */
  rollingYardsPerTarget: NflWindowedRate;
  teamPassAttemptsPerGame: NflWindowedRate;
  teamDropbackRate: NflWindowedRate;
  teamPassRateOverExpected: NflWindowedRate;
  targetConcentration: NflWindowedRate;
  opponentTargetsAllowedPerGame: NflWindowedRate;
  market: NflCurrentWeekMarketContext;
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
   * leader's own history clears any threshold -- used only when sourced
   * depth-chart evidence was unavailable or ambiguous for this team.
   * `"depthChart"` (Phase 9.2) -- admitted primarily on sourced
   * ESPN/nflverse depth-chart evidence (`roleSource`/`depthRank` below),
   * independent of historical volume. This is how a legitimate rookie/new
   * starter enters with zero prior NFL usage.
   */
  fallbackProvenance: "historicalVolume" | "depthChart" | "rosterScarcityFloor" | "starterHeuristic";
  /**
   * Phase 9.2 role-evidence disclosure. `roleSource` is
   * `"nflverse-depth-charts-espn"` when sourced depth-chart data actually
   * informed this row, `"historicalVolume"`/`"rosterScarcityFloor"` when it
   * did not (mirrors `fallbackProvenance`), or `"unavailable"` when the
   * depth-chart source itself could not be used this run (stale/missing --
   * see the artifact-level `depthChartSource` block). `depthRank`/
   * `starterFlag` are null/false whenever `roleConfidence` is `"inferred"`.
   * This block answers ONLY "should this player plausibly be in the
   * universe" -- it never feeds `projectedYards` or the Matchup Score.
   */
  roleSource: "nflverse-depth-charts-espn" | "historicalVolume" | "rosterScarcityFloor" | "unavailable";
  roleSourceUpdatedAt: string | null;
  depthRank: number | null;
  starterFlag: boolean;
  roleConfidence: "sourced" | "inferred";
};

export type NflCurrentWeekPassingRow = NflCurrentWeekRowIdentity & {
  market: "passing";
  position: "QB";
  projectedYards: number | null;
  directModelPrediction: number | null;
  estimatedRange: NflEstimatedRange | null;
  matchupScore: NflYardageMatchupScore | null;
  hardCaseFlags: NflCurrentWeekHardCaseFlags;
  featureSnapshot: NflCurrentWeekPassingFeatureSnapshot;
  diagnostics: {
    starterResolution: "sourcedDepthChart" | "rollingAttemptsLeader" | "onlyActiveQb" | "noHistoryFallback";
    gamesStartedPriorThisSeason: number;
    /** True when the depth-chart source listed more than one ACT QB at rank 1 for this team -- never silently resolved; resolution fell back to the historical heuristic. */
    sourceAmbiguous: boolean;
  };
};

export type NflCurrentWeekRushingRow = NflCurrentWeekRowIdentity & {
  market: "rushing";
  projectedCarries: number | null;
  projectedYardsPerCarry: number | null;
  projectedYards: number | null;
  estimatedRange: NflEstimatedRange | null;
  matchupScore: NflYardageMatchupScore | null;
  hardCaseFlags: NflCurrentWeekHardCaseFlags;
  featureSnapshot: NflCurrentWeekRushingFeatureSnapshot;
  diagnostics: { gamesWithCarriesPriorThisSeason: number; recentTeamTopCarryShareConcentration: number | null };
};

/**
 * WU4B S6 diagnostics — present only when the receiving row was produced by
 * `nfl-receiving-share-x-efficiency-v2.0.0` (finite targetable-pass pool
 * allocation). Absent on v1 rows. Additive: no existing field changes
 * meaning, and every archived v1 receiving prediction stays valid under v1.
 */
export type NflReceivingAllocationDiagnostics = {
  allocationModelVersion: string;
  /** WU4A projected dropbacks for this player's team, or null when the pool was unavailable (v1 fallback). */
  projectedTeamOpportunity: number | null;
  /** dropbacks reduced by the calibrated targetable ratio. */
  projectedTargetablePool: number | null;
  impliedTargetableRatio: number | null;
  /** this player's normalised share of the targetable pool. */
  projectedOpportunityShare: number | null;
  /** the player's point-in-time prior target share fed into the model. */
  priorOpportunityShare: number | null;
  /** the player's most recent prior-season team (null if none). */
  priorTeam: string | null;
  /** evidence vector used for the share allocation (deterministic, diagnostic). */
  roleConfidenceEvidence: {
    depthRank: number | null;
    roleSourced: boolean;
    teamChanged: boolean | null;
    noHistory: boolean;
    limitedHistory: boolean;
    priorGamesPlayed: number;
    rosterCompetitionCount: number | null;
  };
  /** "none" | "noTeamOpportunity" (v1 fallback for the whole team) | "equalSplit" (no usable history for any receiver). */
  allocationFallbackReason: "none" | "noTeamOpportunity" | "equalSplit";
  /** team-level residual = targetable pool − sum(allocated targets); ~0 by construction, surfaced not hidden. */
  teamResidualUnallocated: number | null;
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
  featureSnapshot: NflCurrentWeekReceivingFeatureSnapshot;
  diagnostics: { gamesWithTargetsPriorThisSeason: number };
  /** WU4B S6: present only for `nfl-receiving-share-x-efficiency-v2.0.0` rows. */
  allocationDiagnostics?: NflReceivingAllocationDiagnostics;
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
  /** Phase 9.2: rows by which evidence tier actually admitted them (mirrors `fallbackProvenance`). */
  sourcedRoleCandidates: Record<NflProjectionMarket, number>;
  historicalVolumeCandidates: Record<NflProjectionMarket, number>;
  scarcityFloorCandidates: Record<NflProjectionMarket, number>;
  /** Rows with sourced depth-chart evidence AND zero historical volume -- the concrete "rookie/new player captured" count. */
  noHistorySourcedCandidates: Record<NflProjectionMarket, number>;
  /** Passing-only: teams where the source listed >1 ACT QB at rank 1 (never silently resolved). */
  ambiguousQbDepthGroups: readonly string[];
  /** team|position groups with zero rows in the depth-chart snapshot (not an error -- e.g. a team's TE room may be thin that day). */
  missingDepthChartGroups: readonly string[];
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
  /**
   * Phase 9.2 source-failure visibility. `available: false` means no depth
   * chart data was usable this run (missing or stale beyond the source's
   * daily-cadence threshold) -- generation still succeeds, using Phase 9.1
   * historical-volume + roster-scarcity-floor behavior only, never
   * pretending fallback rows are sourced.
   */
  depthChartSource: { available: boolean; stale: boolean; snapshotAt: string | null; ageHours: number | null };
  rows: readonly NflCurrentWeekProjectionRow[];
  qa: NflCurrentWeekQaSummary;
};
