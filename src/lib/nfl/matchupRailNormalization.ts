/**
 * Presentation-only normalization for the single head-to-head comparison rail.
 *
 * The matchup analyzer already decides *which* team leads a metric — that is
 * `classifyMetricComparison` in matchupCategoryAdvantage.ts, computed from raw
 * values through the metric's declared direction and nothing else. This module
 * adds only a *visual magnitude* for that lead so one continuous rail can show
 * how large the relative advantage is. It introduces no new winner, changes no
 * raw value and is never consumed by the category roll-up.
 *
 * Magnitude is derived from the league rank differential wherever both ranks
 * exist. Rank is already direction-normalized (1 = best for every metric,
 * higher-is-better and lower-is-better alike), so a single formula covers both
 * directions with no special-casing. When a rank is missing the raw values give
 * a fallback proportional difference. When neither is available the rail shows a
 * neutral centre.
 */

import type { MetricComparison } from "@/lib/nfl/matchupCategoryAdvantage";
import { NFL_TEAM_COUNT } from "@/lib/nfl/rankTier";

/** Which side of the rail the fill points toward. "none" renders no fill at all. */
export type RailSide = "left" | "right" | "even" | "none";

/** What the magnitude was derived from, surfaced for tests and tooltips. */
export type RailBasis = "rank" | "value" | "none";

export type ComparisonRailModel = {
  side: RailSide;
  /** 0..1 — fraction of one half-rail to fill from the centre toward `side`. */
  magnitude: number;
  basis: RailBasis;
};

/**
 * A full league's worth of rank separation (1st vs 32nd) fills a half-rail.
 * A ~half-league gap therefore reads at roughly the halfway mark, and a
 * one-rank gap barely moves off centre — which is the intended "small
 * differences look close to even" behaviour.
 */
export const RANK_DIFFERENTIAL_SPAN = NFL_TEAM_COUNT - 1;

/** A real but tiny lead still shows a sliver so the advantaged side is visible. */
export const MIN_ADVANTAGE_MAGNITUDE = 0.06;

/** Proportional raw-value gaps below this read as effectively even. */
export const NEUTRAL_VALUE_EPSILON = 0.005;

export type RailInput = {
  leftValue: number | null;
  rightValue: number | null;
  leftRank: number | null;
  rightRank: number | null;
  /**
   * true = higher raw value is better, false = lower is better,
   * null = the metric has no better/worse direction (context-only).
   */
  higherIsBetter: boolean | null;
  /**
   * The existing per-metric winner authority. When supplied it decides the
   * side; the raw inputs here only scale the fill. Omit it and the side is
   * derived from ranks, then values.
   */
  comparison?: MetricComparison;
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const NEUTRAL: ComparisonRailModel = { side: "none", magnitude: 0, basis: "none" };

function sideFromComparison(comparison: MetricComparison): RailSide | null {
  switch (comparison) {
    case "away":
      return "left";
    case "home":
      return "right";
    case "tie":
      return "even";
    case "missing":
    case "not-comparable":
      return "none";
    default:
      return null;
  }
}

function sideFromData(input: RailInput): RailSide {
  const { leftRank, rightRank, leftValue, rightValue, higherIsBetter } = input;

  if (isFiniteNumber(leftRank) && isFiniteNumber(rightRank)) {
    if (leftRank === rightRank) return "even";
    // Lower rank is always the better rank.
    return leftRank < rightRank ? "left" : "right";
  }

  if (higherIsBetter !== null && isFiniteNumber(leftValue) && isFiniteNumber(rightValue)) {
    if (leftValue === rightValue) return "even";
    const leftLeads = higherIsBetter ? leftValue > rightValue : leftValue < rightValue;
    return leftLeads ? "left" : "right";
  }

  return "none";
}

function rankMagnitude(leftRank: number | null, rightRank: number | null): number | null {
  if (!isFiniteNumber(leftRank) || !isFiniteNumber(rightRank)) return null;
  return clamp01(Math.abs(rightRank - leftRank) / RANK_DIFFERENTIAL_SPAN);
}

function valueMagnitude(leftValue: number | null, rightValue: number | null): number | null {
  if (!isFiniteNumber(leftValue) || !isFiniteNumber(rightValue)) return null;
  const denominator = Math.abs(leftValue) + Math.abs(rightValue) || 1;
  return clamp01(Math.abs(leftValue - rightValue) / denominator);
}

/**
 * Build the rail model for one metric.
 *
 * Side priority: explicit `comparison` → both ranks → both values. Magnitude
 * priority: rank differential → proportional value difference → a minimum
 * sliver when a side is asserted with no scale data behind it.
 */
export function buildComparisonRailModel(input: RailInput): ComparisonRailModel {
  const side =
    (input.comparison && sideFromComparison(input.comparison)) ?? sideFromData(input);

  if (side === "none") return NEUTRAL;

  const rankMag = rankMagnitude(input.leftRank, input.rightRank);
  const valueMag = rankMag == null ? valueMagnitude(input.leftValue, input.rightValue) : null;

  if (side === "even") {
    const basis: RailBasis = rankMag != null ? "rank" : valueMag != null ? "value" : "none";
    return { side, magnitude: 0, basis };
  }

  // A value-based gap under the epsilon is not worth a directional fill.
  if (rankMag == null && valueMag != null && valueMag < NEUTRAL_VALUE_EPSILON) {
    return { side: "even", magnitude: 0, basis: "value" };
  }

  if (rankMag != null) {
    return { side, magnitude: Math.max(rankMag, MIN_ADVANTAGE_MAGNITUDE), basis: "rank" };
  }
  if (valueMag != null) {
    return { side, magnitude: Math.max(valueMag, MIN_ADVANTAGE_MAGNITUDE), basis: "value" };
  }
  return { side, magnitude: MIN_ADVANTAGE_MAGNITUDE, basis: "none" };
}

/**
 * Winner authority for an asymmetric metric pairing that has no pre-computed
 * comparison of its own — e.g. Pass Block Win Rate against the opposing Pass
 * Rush Win Rate, or an offense metric against the matching defense-allowed
 * metric.
 *
 * The two underlying statistics are not the same raw quantity, so their raw
 * percentages must never be compared directly. Their league ranks, however, are
 * already direction-normalized (1 = best league position for either metric), so
 * the better league position is the stronger side of the matchup. When either
 * rank is missing there is no honest comparison to make and the row must fall
 * back to its neutral "not compared" state rather than inventing one from
 * incompatible values.
 *
 * "away" = the left side leads, "home" = the right side leads — matching the
 * `MetricComparison` vocabulary the row and rail already speak.
 */
export function deriveMetricComparisonFromRanks(
  leftRank: number | null,
  rightRank: number | null
): MetricComparison {
  if (!isFiniteNumber(leftRank) || !isFiniteNumber(rightRank)) return "not-comparable";
  if (leftRank === rightRank) return "tie";
  return leftRank < rightRank ? "away" : "home";
}
