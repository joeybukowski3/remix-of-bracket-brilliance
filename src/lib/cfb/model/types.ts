/**
 * JKB College Football Phase 2A model architecture — input/output contracts.
 *
 * This module defines the SHAPE of the deterministic rating and strength-of-schedule
 * engine. It intentionally contains no computation and no hardcoded team data.
 *
 * Every input field is nullable: the model must degrade gracefully (never throw,
 * never fabricate a value) when a given input is unavailable. See preseasonModel.ts
 * for how missing inputs are reweighted rather than defaulted to zero.
 *
 * Convention: higher rating value = better, for every "*Rating" field, matching
 * src/data/cfb/types.ts. SOS ratings are the one deliberate exception noted inline —
 * higher SOS rating = harder schedule, which is still "higher = more of the thing
 * the field measures."
 */

import type { CfbGameStatus } from "@/data/cfb/types";

// ---------------------------------------------------------------------------
// A. Prior team performance (previous completed season)
// ---------------------------------------------------------------------------

export type CfbPriorPerformanceInputs = {
  teamId: string;
  /** The season these inputs describe, e.g. 2025 for a 2026 preseason model. */
  season: number;
  /** Prefer efficiency metrics (yards/play) over raw totals per model philosophy. */
  offensiveYardsPerPlay: number | null;
  defensiveYardsPerPlayAllowed: number | null;
  pointsPerGame: number | null;
  pointsAllowedPerGame: number | null;
  wins: number | null;
  losses: number | null;
  pointDifferentialPerGame: number | null;
};

// ---------------------------------------------------------------------------
// B. Opponent-adjusted performance (separable layer; optional refinement over A)
// ---------------------------------------------------------------------------

export type CfbOpponentAdjustedInputs = {
  teamId: string;
  /** Offensive efficiency after removing opponent-defense quality effects. */
  opponentAdjustedOffensiveEfficiency: number | null;
  /** Defensive efficiency after removing opponent-offense quality effects. */
  opponentAdjustedDefensiveEfficiency: number | null;
  opponentAdjustedPointDifferential: number | null;
};

// ---------------------------------------------------------------------------
// C. Returning production
// ---------------------------------------------------------------------------

export type CfbReturningProductionInputs = {
  teamId: string;
  returningQuarterback: boolean | null;
  /** Count of returning starters, out of 11 per side. */
  returningOffensiveStarters: number | null;
  returningDefensiveStarters: number | null;
  /** 0-100 scale production shares (e.g. % of prior-season snaps/yards returning). */
  returningOffensiveProductionPct: number | null;
  returningDefensiveProductionPct: number | null;
};

// ---------------------------------------------------------------------------
// D. Roster / talent (optional — model must run without it)
// ---------------------------------------------------------------------------

export type CfbRosterTalentInputs = {
  teamId: string;
  recruitingTalentScore: number | null;
  transferPortalTalentScore: number | null;
  rosterCompositeScore: number | null;
};

// ---------------------------------------------------------------------------
// E. Coaching continuity (optional)
// ---------------------------------------------------------------------------

export type CfbCoachingContinuityInputs = {
  teamId: string;
  headCoachReturning: boolean | null;
  offensiveCoordinatorReturning: boolean | null;
  defensiveCoordinatorReturning: boolean | null;
  headCoachTenureYears: number | null;
};

// ---------------------------------------------------------------------------
// Combined preseason input bundle for a single team
// ---------------------------------------------------------------------------

export type CfbPreseasonModelInputs = {
  teamId: string;
  priorPerformance: CfbPriorPerformanceInputs | null;
  priorPerformanceMetadata: {
    source: "prior-fbs-opponent-adjusted" | "prior-fbs-raw" | "prior-fcs-fallback";
    sampleGames: number;
    sourceClassification: "fbs" | "fcs";
    sourceGameIds: string[];
  } | null;
  opponentAdjusted: CfbOpponentAdjustedInputs | null;
  returningProduction: CfbReturningProductionInputs | null;
  rosterTalent: CfbRosterTalentInputs | null;
  coachingContinuity: CfbCoachingContinuityInputs | null;
};

// ---------------------------------------------------------------------------
// Explainability — component contribution breakdown
// ---------------------------------------------------------------------------

export type CfbRatingComponentContribution = {
  component: string;
  /** Raw (pre-weighting) value used for this component, on its native scale. */
  rawValue: number;
  /** Weight actually applied after reweighting for missing siblings (see preseasonModel.ts). */
  appliedWeight: number;
  /** rawValue's contribution to the base score, i.e. rawValue * appliedWeight. */
  weightedContribution: number;
};

export type CfbRatingBreakdown = {
  teamId: string;
  priorPerformanceContribution: CfbRatingComponentContribution | null;
  returningProductionContribution: CfbRatingComponentContribution | null;
  qbContinuityContribution: CfbRatingComponentContribution | null;
  rosterTalentContribution: CfbRatingComponentContribution | null;
  coachingContinuityContribution: CfbRatingComponentContribution | null;
  offensiveBaseContribution: CfbRatingComponentContribution | null;
  defensiveBaseContribution: CfbRatingComponentContribution | null;
};

// ---------------------------------------------------------------------------
// Raw (pre-normalization) and display (0-100 scale) rating outputs
// ---------------------------------------------------------------------------

export type CfbRawTeamRating = {
  teamId: string;
  rawOffensiveRating: number | null;
  rawDefensiveRating: number | null;
  rawPowerRating: number | null;
  breakdown: CfbRatingBreakdown;
  /** "insufficient-data" when zero usable inputs existed for every component. */
  status: "computed" | "insufficient-data";
};

export type CfbDisplayTeamRating = {
  teamId: string;
  jkbOffensiveRating: number | null;
  jkbDefensiveRating: number | null;
  jkbPowerRating: number | null;
  jkbRank: number | null;
};

// ---------------------------------------------------------------------------
// Strength of schedule
// ---------------------------------------------------------------------------

export type CfbGameLocation = "home" | "away" | "neutral";

/** Minimal per-team-per-game shape the SOS engine needs. Schedule-source agnostic. */
export type CfbSosGameInput = {
  gameId: string;
  teamId: string;
  opponentTeamId: string;
  location: CfbGameLocation;
  date: string; // YYYY-MM-DD
  gameStatus: CfbGameStatus;
};

/** Raw (unnormalized) average opponent strength, before percentile display scaling. */
export type CfbRawSosForTeam = {
  teamId: string;
  /** Average opponent power rating across completed games; null if none completed. */
  playedOpponentStrength: number | null;
  /** Average opponent power rating across remaining (not yet final) games; null if none remain. */
  remainingOpponentStrength: number | null;
  gamesPlayedCount: number;
  gamesRemainingCount: number;
};

export type CfbSosDisplay = {
  teamId: string;
  sosPlayedRating: number | null;
  sosPlayedRank: number | null;
  sosRemainingRating: number | null;
  sosRemainingRank: number | null;
};

// ---------------------------------------------------------------------------
// Future-phase placeholders (interfaces only — not computed in Phase 2A)
// ---------------------------------------------------------------------------

/**
 * Per-team home field advantage. Not used to produce spreads in Phase 2A.
 * Kept as a distinct layer from opponentStrengthSOS so location adjustments
 * can be applied (or not) without re-deriving raw opponent quality.
 */
export type CfbHomeFieldAdvantage = {
  teamId: string;
  /** Points of home-field value; null when no team-specific value is available. */
  homeFieldAdvantagePoints: number | null;
  source: "default" | "derived" | "unavailable";
};

export type CfbProjectedWins = {
  teamId: string;
  projectedWins: number | null;
  conferenceProjectedWins: number | null;
};
