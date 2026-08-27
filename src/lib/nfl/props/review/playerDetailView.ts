/**
 * Read-only detail-panel assembly for the NFL Yardage Props Review UI's
 * expandable player row/card. Pure field selection and reshaping over
 * already-computed artifact/join data -- no model input is ever recomputed
 * here. Sources:
 *
 *   - `NflCurrentWeekProjectionRow` (public/data/nfl/{season}/yardage-
 *     projections.json), including its `featureSnapshot` block -- a
 *     diagnostic-only field-selection from the generator's own "ForTarget"
 *     feature-row builders (see the header comment on
 *     `NflCurrentWeekMarketContext`/`NflCurrentWeekPassingFeatureSnapshot`
 *     in `types/currentWeekProjection.ts`). `featureSnapshot` values are
 *     never shrunk-score transforms (that's `matchupScore.components.*
 *     .indicatorScores`, a different, intentionally NOT reused shape here).
 *   - `NflYardageReviewMarketInfo` (sportsbook join, `yardageMarketJoin.ts`).
 *   - `NflYardageOpponentContext` (opponent EPA/Success/production-allowed
 *     join, `opponentContext.ts`).
 *
 * Every note-generating function is general-purpose: it fires on the
 * pattern (e.g. "a sportsbook line exists for a non-primary depth-chart
 * rank"), never on a specific player or team name.
 */
import type {
  NflCurrentWeekProjectionRow,
  NflCurrentWeekHistoryStatus,
  NflEstimatedRange,
} from "../types/currentWeekProjection";
import type { NflWindowedRate } from "../types/qbPassingFeatures";
import type { NflProjectionMarket } from "../types/projectionOutput";
import type { NflYardageReviewMarketInfo } from "./yardageMarketJoin";
import type { NflYardageOpponentContext } from "./opponentContext";
import { matchupScoreBand, type NflMatchupScoreBand } from "./yardageMarketJoin";

// ---------------------------------------------------------------------------
// Projection summary
// ---------------------------------------------------------------------------

export type NflYardageDetailProjectionSummary = {
  projectedYards: number | null;
  estimatedRange: NflEstimatedRange | null;
  market: NflProjectionMarket;
  modelVersion: string;
  historyStatus: NflCurrentWeekHistoryStatus;
  generatedAt: string;
};

export function buildProjectionSummary(row: NflCurrentWeekProjectionRow): NflYardageDetailProjectionSummary {
  return {
    projectedYards: row.projectedYards,
    estimatedRange: row.estimatedRange,
    market: row.market,
    modelVersion: row.modelVersion,
    historyStatus: row.historyStatus,
    generatedAt: row.generatedAt,
  };
}

// ---------------------------------------------------------------------------
// Projection components (market-specific)
// ---------------------------------------------------------------------------

export type NflYardageDetailMarketContext = {
  spread: number | null;
  total: number | null;
  impliedTeamTotal: number | null;
  homeAway: "home" | "away";
  isDome: boolean | null;
};

export type NflYardageDetailPassingComponents = {
  qbAttemptsPerGame: NflWindowedRate;
  yardsPerAttempt: NflWindowedRate;
  completionPct: NflWindowedRate;
  teamPassAttemptsPerGame: NflWindowedRate;
  teamDropbackRate: NflWindowedRate;
  earlyDownNeutralPassRate: NflWindowedRate;
  passRateOverExpected: NflWindowedRate;
  market: NflYardageDetailMarketContext;
};

export type NflYardageDetailRushingComponents = {
  projectedCarries: number | null;
  /** The model's shrunk YPC -- the production value, distinct from the raw rolling `rollingYardsPerCarry` below. */
  projectedYardsPerCarry: number | null;
  carriesPerGame: NflWindowedRate;
  carryShare: NflWindowedRate;
  rollingYardsPerCarry: NflWindowedRate;
  teamRushAttemptsPerGame: NflWindowedRate;
  teamDropbackRate: NflWindowedRate;
  teamPassRateOverExpected: NflWindowedRate;
  opponentRushAttemptsAllowedPerGame: NflWindowedRate;
  market: NflYardageDetailMarketContext;
};

export type NflYardageDetailReceivingComponents = {
  projectedTargets: number | null;
  /** The model's shrunk YPT -- the production value, distinct from the raw rolling `rollingYardsPerTarget` below. */
  projectedYardsPerTarget: number | null;
  targetsPerGame: NflWindowedRate;
  targetShare: NflWindowedRate;
  rollingYardsPerTarget: NflWindowedRate;
  teamPassAttemptsPerGame: NflWindowedRate;
  teamDropbackRate: NflWindowedRate;
  teamPassRateOverExpected: NflWindowedRate;
  targetConcentration: NflWindowedRate;
  opponentTargetsAllowedPerGame: NflWindowedRate;
  market: NflYardageDetailMarketContext;
};

export type NflYardageDetailComponents =
  | { market: "passing"; data: NflYardageDetailPassingComponents }
  | { market: "rushing"; data: NflYardageDetailRushingComponents }
  | { market: "receiving"; data: NflYardageDetailReceivingComponents };

export function buildDetailComponents(row: NflCurrentWeekProjectionRow): NflYardageDetailComponents {
  const marketContext = (m: { spread: number | null; total: number | null; impliedTeamTotal: number | null; isDome: boolean | null }): NflYardageDetailMarketContext => ({
    spread: m.spread,
    total: m.total,
    impliedTeamTotal: m.impliedTeamTotal,
    homeAway: row.homeAway,
    isDome: m.isDome,
  });

  if (row.market === "passing") {
    return {
      market: "passing",
      data: {
        qbAttemptsPerGame: row.featureSnapshot.qbAttemptsPerGame,
        yardsPerAttempt: row.featureSnapshot.yardsPerAttempt,
        completionPct: row.featureSnapshot.completionPct,
        teamPassAttemptsPerGame: row.featureSnapshot.teamPassAttemptsPerGame,
        teamDropbackRate: row.featureSnapshot.teamDropbackRate,
        earlyDownNeutralPassRate: row.featureSnapshot.earlyDownNeutralPassRate,
        passRateOverExpected: row.featureSnapshot.passRateOverExpected,
        market: marketContext(row.featureSnapshot.market),
      },
    };
  }
  if (row.market === "rushing") {
    return {
      market: "rushing",
      data: {
        projectedCarries: row.projectedCarries,
        projectedYardsPerCarry: row.projectedYardsPerCarry,
        carriesPerGame: row.featureSnapshot.carriesPerGame,
        carryShare: row.featureSnapshot.carryShare,
        rollingYardsPerCarry: row.featureSnapshot.rollingYardsPerCarry,
        teamRushAttemptsPerGame: row.featureSnapshot.teamRushAttemptsPerGame,
        teamDropbackRate: row.featureSnapshot.teamDropbackRate,
        teamPassRateOverExpected: row.featureSnapshot.teamPassRateOverExpected,
        opponentRushAttemptsAllowedPerGame: row.featureSnapshot.opponentRushAttemptsAllowedPerGame,
        market: marketContext(row.featureSnapshot.market),
      },
    };
  }
  return {
    market: "receiving",
    data: {
      projectedTargets: row.projectedTargets,
      projectedYardsPerTarget: row.projectedYardsPerTarget,
      targetsPerGame: row.featureSnapshot.targetsPerGame,
      targetShare: row.featureSnapshot.targetShare,
      rollingYardsPerTarget: row.featureSnapshot.rollingYardsPerTarget,
      teamPassAttemptsPerGame: row.featureSnapshot.teamPassAttemptsPerGame,
      teamDropbackRate: row.featureSnapshot.teamDropbackRate,
      teamPassRateOverExpected: row.featureSnapshot.teamPassRateOverExpected,
      targetConcentration: row.featureSnapshot.targetConcentration,
      opponentTargetsAllowedPerGame: row.featureSnapshot.opponentTargetsAllowedPerGame,
      market: marketContext(row.featureSnapshot.market),
    },
  };
}

/** Which window actually backs a rolling value, most-current first. Never fabricates a value -- returns `null` only when every window is null. */
export type NflYardageDetailWindowSource = "seasonPrior" | "last3" | "priorSeason" | null;

export function resolveWindowSource(rate: NflWindowedRate): NflYardageDetailWindowSource {
  if (rate.seasonPrior != null) return "seasonPrior";
  if (rate.last3 != null) return "last3";
  if (rate.priorSeason != null) return "priorSeason";
  return null;
}

export const WINDOW_SOURCE_LABEL: Record<Exclude<NflYardageDetailWindowSource, null>, string> = {
  seasonPrior: "this season",
  last3: "last 3 games",
  priorSeason: "prior season",
};

// ---------------------------------------------------------------------------
// Role / provenance
// ---------------------------------------------------------------------------

export type NflYardageDetailRoleProvenance = {
  depthRank: number | null;
  starterFlag: boolean;
  roleSource: NflCurrentWeekProjectionRow["roleSource"];
  roleConfidence: NflCurrentWeekProjectionRow["roleConfidence"];
  fallbackProvenance: NflCurrentWeekProjectionRow["fallbackProvenance"];
  historyStatus: NflCurrentWeekHistoryStatus;
  /** Games with recorded prior usage this season -- attempts (passing) / carries (rushing) / targets (receiving). */
  gamesWithPriorUsage: number;
  teamChanged: boolean;
  noHistory: boolean;
  limitedHistory: boolean;
  roleUncertain: boolean;
  multiQbRoleUncertain: boolean;
  committeeRole: boolean;
  zeroTargetRisk: boolean;
};

export function buildRoleProvenance(row: NflCurrentWeekProjectionRow): NflYardageDetailRoleProvenance {
  const gamesWithPriorUsage =
    row.market === "passing"
      ? row.diagnostics.gamesStartedPriorThisSeason
      : row.market === "rushing"
        ? row.diagnostics.gamesWithCarriesPriorThisSeason
        : row.diagnostics.gamesWithTargetsPriorThisSeason;

  return {
    depthRank: row.depthRank,
    starterFlag: row.starterFlag,
    roleSource: row.roleSource,
    roleConfidence: row.roleConfidence,
    fallbackProvenance: row.fallbackProvenance,
    historyStatus: row.historyStatus,
    gamesWithPriorUsage,
    teamChanged: row.hardCaseFlags.teamChanged,
    noHistory: row.hardCaseFlags.noHistory,
    limitedHistory: row.hardCaseFlags.limitedHistory,
    roleUncertain: row.hardCaseFlags.roleUncertain,
    multiQbRoleUncertain: row.hardCaseFlags.multiQbRoleUncertain,
    committeeRole: row.hardCaseFlags.committeeRole,
    zeroTargetRisk: row.hardCaseFlags.zeroTargetRisk,
  };
}

// ---------------------------------------------------------------------------
// Sportsbook (thin re-export -- the join module already builds exactly what's needed)
// ---------------------------------------------------------------------------

export type NflYardageDetailSportsbook = NflYardageReviewMarketInfo;

export function buildSportsbookDetail(marketInfo: NflYardageReviewMarketInfo): NflYardageDetailSportsbook {
  return marketInfo;
}

// ---------------------------------------------------------------------------
// Diff -- literal equation, never a betting recommendation
// ---------------------------------------------------------------------------

export type NflYardageDetailDiff = {
  projectedYards: number;
  line: number;
  diff: number;
} | null;

/** Projection − Sportsbook Line = Diff, shown as a literal equation. Research context only. */
export function buildDiffEquation(row: NflCurrentWeekProjectionRow, marketInfo: NflYardageReviewMarketInfo): NflYardageDetailDiff {
  if (!marketInfo.available || row.projectedYards == null) return null;
  return { projectedYards: row.projectedYards, line: marketInfo.line, diff: row.projectedYards - marketInfo.line };
}

// ---------------------------------------------------------------------------
// Matchup -- total score, band, components, weights (the frozen authority, never re-derived)
// ---------------------------------------------------------------------------

export type NflYardageDetailMatchupComponent = { key: string; score: number; weight: number | null };

export type NflYardageDetailMatchup = {
  matchupScore: number;
  band: NflMatchupScoreBand | null;
  opportunityScore: number;
  environmentScore: number;
  components: NflYardageDetailMatchupComponent[];
} | null;

/**
 * Total Matchup Score + band + per-component scores, read verbatim from
 * the row's already-frozen `matchupScore` block -- never a second matchup
 * model. Per-component weights are not carried on the row itself (only
 * each component's already-weighted `score`); this surfaces every
 * component's contribution proportionally (component score / sum of
 * component scores) as a simple, transparent approximation for display,
 * clearly distinct from the frozen weights baked into `matchupScore`
 * itself, which live in the committed `matchup-score-research.json`
 * research artifact, not on the live row.
 */
export function buildMatchupSummary(row: NflCurrentWeekProjectionRow): NflYardageDetailMatchup {
  const ms = row.matchupScore;
  if (!ms) return null;
  const entries = Object.entries(ms.components) as [string, { score: number; indicatorScores: Readonly<Record<string, number>> }][];
  const totalScore = entries.reduce((sum, [, c]) => sum + c.score, 0);
  return {
    matchupScore: ms.matchupScore,
    band: matchupScoreBand(ms.matchupScore),
    opportunityScore: ms.opportunityScore,
    environmentScore: ms.environmentScore,
    components: entries.map(([key, c]) => ({
      key,
      score: c.score,
      weight: totalScore > 0 ? c.score / totalScore : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Edge -- literal rank-difference equation, distinct from Matchup Score
// ---------------------------------------------------------------------------

export type NflYardageDetailEdge = {
  defenseRank: number;
  offenseRank: number;
  edge: number;
} | null;

/** Opponent Defense EPA Rank − Team Offense EPA Rank = Team Edge, shown as a literal equation. `edge` is `rankDifference`, read verbatim from the existing matchupEdges authority -- never re-derived, only re-labeled for display. */
export function buildEdgeEquation(opponentContext: NflYardageOpponentContext | undefined): NflYardageDetailEdge {
  const edge = opponentContext?.epaEdge;
  if (!edge || edge.defenseRank == null || edge.offenseRank == null || edge.rankDifference == null) return null;
  return { defenseRank: edge.defenseRank, offenseRank: edge.offenseRank, edge: edge.rankDifference };
}

// ---------------------------------------------------------------------------
// Player-level notes -- concise, factual, general-purpose (never player/team-specific)
// ---------------------------------------------------------------------------

export type NflYardageDetailNote = { key: string; text: string };

/**
 * Builds context footnotes for one row. Every condition is a general
 * pattern over existing flags/fields -- none names a specific player or
 * team. In particular, "a sportsbook line exists but the role context is
 * unusual" fires for ANY player whose depth rank is not the top rank at
 * their position when a line exists, not a hardcoded Seattle-style check.
 */
export function buildDetailNotes(
  row: NflCurrentWeekProjectionRow,
  marketInfo: NflYardageReviewMarketInfo,
): NflYardageDetailNote[] {
  const notes: NflYardageDetailNote[] = [];
  const flags = row.hardCaseFlags;

  if (flags.noHistory) {
    notes.push({ key: "noHistory", text: "No prior-season or current-season usage history for this player -- the projection relies on the model's shrinkage fallback." });
  } else if (flags.limitedHistory) {
    notes.push({ key: "limitedHistory", text: "Limited history: fewer than three games of recorded usage back this projection." });
  }

  if (flags.teamChanged) {
    notes.push({ key: "teamChanged", text: "This player's team this week differs from their most recently recorded team." });
  }

  if (row.roleConfidence === "inferred") {
    notes.push({ key: "roleInferred", text: "Role inferred from historical volume rather than a sourced depth chart." });
  } else if (flags.roleUncertain) {
    notes.push({ key: "roleUncertain", text: "Admitted on roster/role evidence rather than a qualifying volume threshold -- role is uncertain." });
  }

  if (flags.multiQbRoleUncertain) {
    notes.push({ key: "multiQbRoleUncertain", text: "More than one quarterback on this roster has a plausible claim on the start." });
  }
  if (flags.committeeRole) {
    notes.push({ key: "committeeRole", text: "Committee backfield -- no single back holds a clearly dominant recent carry share." });
  }
  if (flags.zeroTargetRisk) {
    notes.push({ key: "zeroTargetRisk", text: "Meaningful chance of a true zero-target game given this player's recent role." });
  }

  // General pattern, not a specific-player check: a sportsbook has posted a
  // line for a player the depth-chart source does NOT list at rank 1.
  if (marketInfo.available && row.depthRank != null && row.depthRank > 1) {
    notes.push({
      key: "marketVsRoleDiscrepancy",
      text: `A sportsbook line exists for this player even though the depth chart lists them at rank ${row.depthRank}, not the top option at this position -- compare against the team's higher-ranked options before relying on either number.`,
    });
  }

  return notes;
}
