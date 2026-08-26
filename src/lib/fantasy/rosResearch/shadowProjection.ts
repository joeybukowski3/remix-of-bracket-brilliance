/**
 * ROS projection authority -- Phase 3 shadow model calculation.
 *
 * Pure functions only: every formula, weight, and cap is imported from
 * `shadowProjectionConfig.ts`. Nothing here reads or writes the live
 * ranking/PAR/projection sources directly -- the generator
 * (`scripts/generate-ros-shadow-projections.ts`) supplies plain data and
 * this module returns plain data. React must never perform this
 * calculation; it only renders what the generator already computed.
 *
 * This is a SHADOW research experiment. Nothing computed here is a
 * replacement for the live Overall Rank, POS RK, PAR/G, Projection RK, or
 * replacement levels.
 */
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { PlayerSeasonBaseline } from "@/lib/fantasy/rosResearch/historicalBaseline";
import type { SeasonUsageAverage } from "@/lib/fantasy/rosResearch/usageRoleContext";
import type { TeamGameEnvironment } from "@/lib/fantasy/rosResearch/teamMarketContext";
import type { TeamPositionFpaContext } from "@/lib/fantasy/rosResearch/scheduleFpaContext";
import {
  ADJUSTMENT_CAPS,
  COMBINED_ADJUSTMENT_CAP,
  MIN_MARKET_GAMES_FOR_TEAM_FACTOR,
  MIN_SAMPLE_GAMES,
  RECENCY_WEIGHTS,
  SHADOW_CANDIDATE_IDS,
  SHADOW_CANDIDATE_INPUTS,
  USAGE_SIGNAL_FIELD_BY_POSITION,
  type HistoricalBaselineWeightingId,
  type ShadowCandidateId,
} from "@/lib/fantasy/rosResearch/shadowProjectionConfig";

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// ---------------------------------------------------------------------------
// 1. Historical baseline weighting options
// ---------------------------------------------------------------------------

export type HistoricalBaselineOption = {
  ppg: number | null;
  seasonsUsed: number[];
  weights: Record<number, number> | null;
  minSampleFallbackApplied?: boolean;
};

export type HistoricalBaselineOptions = Record<HistoricalBaselineWeightingId, HistoricalBaselineOption>;

function latestSeasonOption(seasons: readonly PlayerSeasonBaseline[]): HistoricalBaselineOption {
  const latest = seasons.at(-1);
  if (!latest) return { ppg: null, seasonsUsed: [], weights: null };
  return { ppg: latest.ppg, seasonsUsed: [latest.season], weights: { [latest.season]: 1 } };
}

function recencyWeightedOption(
  seasons: readonly PlayerSeasonBaseline[],
  minGames: number,
): HistoricalBaselineOption {
  const eligible = seasons.filter((season) => season.gamesPlayed >= minGames);
  const pool = eligible.length ? eligible : seasons;
  if (!pool.length) return { ppg: null, seasonsUsed: [], weights: null };

  // No season met the minimum-sample threshold: fall back to a plain, equally
  // weighted average of whatever seasons exist (still explicit and
  // deterministic, never fabricated) rather than trusting the normal recency
  // weights on a season the safeguard just judged too thin to weight highly.
  const fallbackApplied = !eligible.length && seasons.length > 0;
  const totalWeight = pool.reduce((sum, season) => sum + (RECENCY_WEIGHTS[season.season] ?? 0), 0);
  const weights: Record<number, number> =
    !fallbackApplied && totalWeight > 0
      ? Object.fromEntries(pool.map((season) => [season.season, (RECENCY_WEIGHTS[season.season] ?? 0) / totalWeight]))
      : Object.fromEntries(pool.map((season) => [season.season, 1 / pool.length]));

  const ppg = pool.reduce((sum, season) => sum + season.ppg * weights[season.season], 0);
  return {
    ppg,
    seasonsUsed: pool.map((season) => season.season),
    weights,
    minSampleFallbackApplied: fallbackApplied,
  };
}

/** Computes and reports all three tested historical baseline weighting options; picks none of them for the caller -- selection is a separate, documented step. */
export function computeHistoricalBaselineOptions(seasons: readonly PlayerSeasonBaseline[]): HistoricalBaselineOptions {
  return {
    "latest-season": latestSeasonOption(seasons),
    "recency-weighted": recencyWeightedOption(seasons, 0),
    "recency-weighted-min-sample": recencyWeightedOption(seasons, MIN_SAMPLE_GAMES),
  };
}

// ---------------------------------------------------------------------------
// 2. Bounded, null-safe adjustment factors
// ---------------------------------------------------------------------------

export type AdjustmentFactor = {
  factor: number;
  applied: boolean;
  reason: string | null;
};

const NEUTRAL = (reason: string): AdjustmentFactor => ({ factor: 1, applied: false, reason });

export function computeUsageAdjustment(
  position: FantasyPosition,
  seasons: readonly SeasonUsageAverage[],
): AdjustmentFactor {
  const field = USAGE_SIGNAL_FIELD_BY_POSITION[position];
  if (!field) return NEUTRAL(`no reliable usage signal available for ${position} in the current source`);

  const withSignal = [...seasons]
    .sort((a, b) => a.season - b.season)
    .filter((season) => season[field].average != null);
  if (withSignal.length < 2) return NEUTRAL("fewer than two seasons with a usable usage sample");

  const recent = withSignal.at(-1)!;
  const prior = withSignal.at(-2)!;
  const recentValue = recent[field].average as number;
  const priorValue = prior[field].average as number;
  if (priorValue === 0) return NEUTRAL("prior-season usage value is zero; trend ratio undefined");

  const ratio = recentValue / priorValue;
  const cap = ADJUSTMENT_CAPS.usage;
  return { factor: clamp(ratio, 1 - cap, 1 + cap), applied: true, reason: null };
}

function marketFactorFromGames(
  teamGames: readonly TeamGameEnvironment[],
  leagueAverageImpliedTotal: number,
  cap: number,
  minGames: number,
  unavailableReason: string,
): AdjustmentFactor {
  const withData = teamGames.filter((game) => game.impliedTeamTotal != null);
  if (withData.length < minGames || leagueAverageImpliedTotal <= 0) return NEUTRAL(unavailableReason);
  const teamAverage = withData.reduce((sum, game) => sum + (game.impliedTeamTotal ?? 0), 0) / withData.length;
  const ratio = teamAverage / leagueAverageImpliedTotal;
  return { factor: clamp(ratio, 1 - cap, 1 + cap), applied: true, reason: null };
}

export function computeTeamAdjustment(
  teamGames: readonly TeamGameEnvironment[] | undefined,
  leagueAverageImpliedTotal: number,
): AdjustmentFactor {
  if (!teamGames) return NEUTRAL("no team-environment row for this player's team");
  return marketFactorFromGames(
    teamGames,
    leagueAverageImpliedTotal,
    ADJUSTMENT_CAPS.team,
    MIN_MARKET_GAMES_FOR_TEAM_FACTOR,
    `fewer than ${MIN_MARKET_GAMES_FOR_TEAM_FACTOR} team games with market-derived implied totals`,
  );
}

export function computeMarketAdjustment(
  remainingTeamGames: readonly TeamGameEnvironment[] | undefined,
  leagueAverageRemainingImpliedTotal: number,
): AdjustmentFactor {
  if (!remainingTeamGames) return NEUTRAL("no schedule-scoring-environment row for this player's team");
  return marketFactorFromGames(
    remainingTeamGames,
    leagueAverageRemainingImpliedTotal,
    ADJUSTMENT_CAPS.market,
    MIN_MARKET_GAMES_FOR_TEAM_FACTOR,
    `fewer than ${MIN_MARKET_GAMES_FOR_TEAM_FACTOR} remaining team games with market-derived implied totals (current market coverage is limited this early in the season)`,
  );
}

/** FPA direction follows the approved source exactly: higher average points-allowed across the remaining slate is a MORE favourable schedule, so a team-position average above the league-position average yields a factor > 1. */
export function computeFpaAdjustment(
  fpaContext: TeamPositionFpaContext | undefined,
  leagueAveragePointsAllowed: number,
): AdjustmentFactor {
  if (!fpaContext || fpaContext.averagePointsAllowed == null) {
    return NEUTRAL("no remaining-schedule FPA data for this player's team/position");
  }
  if (leagueAveragePointsAllowed <= 0) return NEUTRAL("league-average points-allowed is non-positive");
  const ratio = fpaContext.averagePointsAllowed / leagueAveragePointsAllowed;
  const cap = ADJUSTMENT_CAPS.fpa;
  return { factor: clamp(ratio, 1 - cap, 1 + cap), applied: true, reason: null };
}

// ---------------------------------------------------------------------------
// 3. Candidate assembly (A-E)
// ---------------------------------------------------------------------------

export type ShadowAdjustments = {
  usage: AdjustmentFactor;
  team: AdjustmentFactor;
  fpa: AdjustmentFactor;
  market: AdjustmentFactor;
};

export type ShadowCandidateOutput = {
  candidate: ShadowCandidateId;
  label: string;
  projectedPpg: number | null;
  adjustmentBreakdown: Array<{ input: "usage" | "team" | "fpa" | "market"; factor: number; applied: boolean; reason: string | null }>;
  combinedFactor: number | null;
  combinedFactorClamped: boolean;
  availableInputs: string[];
  missingInputs: string[];
};

export function buildShadowCandidates(
  baselinePpg: number | null,
  adjustments: ShadowAdjustments,
): ShadowCandidateOutput[] {
  return SHADOW_CANDIDATE_IDS.map((candidate) => {
    const inputs = SHADOW_CANDIDATE_INPUTS[candidate];
    const breakdown = inputs.map((input) => ({ input, ...adjustments[input] }));

    if (baselinePpg == null) {
      return {
        candidate,
        label: candidate,
        projectedPpg: null,
        adjustmentBreakdown: breakdown,
        combinedFactor: null,
        combinedFactorClamped: false,
        availableInputs: [],
        missingInputs: ["historical-baseline", ...inputs.filter((input) => !adjustments[input].applied)],
      };
    }

    const rawCombined = breakdown.reduce((product, entry) => product * entry.factor, 1);
    const lo = 1 - COMBINED_ADJUSTMENT_CAP;
    const hi = 1 + COMBINED_ADJUSTMENT_CAP;
    const combinedFactor = clamp(rawCombined, lo, hi);

    return {
      candidate,
      label: candidate,
      projectedPpg: baselinePpg * combinedFactor,
      adjustmentBreakdown: breakdown,
      combinedFactor,
      combinedFactorClamped: combinedFactor !== rawCombined,
      availableInputs: inputs.filter((input) => adjustments[input].applied),
      missingInputs: inputs.filter((input) => !adjustments[input].applied),
    };
  });
}

/** Confidence is a function of how much of a candidate's requested input chain actually resolved to real data, not a subjective call. */
export function shadowConfidence(candidate: ShadowCandidateOutput): "high" | "medium" | "low" | "none" {
  if (candidate.projectedPpg == null) return "none";
  const requested = candidate.availableInputs.length + candidate.missingInputs.length;
  if (requested === 0) return "high"; // Candidate A: baseline-only by design, nothing missing.
  const resolvedFraction = candidate.availableInputs.length / requested;
  if (resolvedFraction === 1) return "high";
  if (resolvedFraction > 0) return "medium";
  return "low";
}
