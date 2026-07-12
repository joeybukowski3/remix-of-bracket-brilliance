/**
 * ML Edges social-table transparency layer.
 *
 * The Moneyline Edge model (see mlbModelEdge.ts, computeModelEdge) produces
 * five weighted factors whose `weightedDifference` values sum EXACTLY to the
 * overall away-minus-home model differential. This module regroups those five
 * factors into three transparent, additive component edges — Pitching,
 * Batting, and Form — each oriented toward the selected (picked) team, so the
 * ML Edges table can show *why* the model leans a side.
 *
 * PER MODEL AUDIT (see ML_EDGE_METHODOLOGY): the model does NOT produce a
 * calibrated win probability. There is therefore no legitimate
 * "model probability − market probability" betting edge, and this module never
 * fabricates one. The headline number is a Model Edge expressed in factor
 * points (a weighted-factor advantage on the model's own 0–100 factor scale),
 * NOT a win-probability edge. The only true probability we surface is the
 * no-vig market implied probability — real market data, computed from
 * two-sided odds, kept clearly separate from the model output.
 */

import {
  getEdgeTierKey,
  getEdgeTierLabel,
  type EdgeTierKey,
  type ModelEdgeResult,
  type ModelFactor,
} from "@/lib/mlb/mlbModelEdge";

// ---------------------------------------------------------------------------
// Component edges
// ---------------------------------------------------------------------------

/**
 * Model factor labels grouped into each display component. Matching by label
 * keeps this resilient if the factor array order ever changes, and a missing
 * label contributes 0 rather than throwing.
 */
const COMPONENT_FACTORS = {
  pitching: ["Pitcher Quality"],
  batting: ["Matchup Edge", "Lineup Offense"],
  form: ["Recent Form", "Season Quality"],
} as const;

export type ComponentEdges = {
  /** Selected team's starting-pitching factor advantage, in factor points. */
  pitching: number;
  /** Selected team's lineup/offense factor advantage, in factor points. */
  batting: number;
  /** Selected team's recent-form + season-quality advantage, in factor points. */
  form: number;
  /** Sum of the three components = selected team's overall model edge (points). */
  overall: number;
};

/** Sum the weighted differences (away − home) for a set of factor labels. */
function sumWeightedDifference(factors: ModelFactor[], labels: readonly string[]): number {
  return labels.reduce((total, label) => {
    const factor = factors.find((f) => f.label === label);
    return total + (factor ? factor.weightedDifference : 0);
  }, 0);
}

/**
 * Derive the three component edges from a model result, oriented so that a
 * POSITIVE value always favors the selected team.
 *
 * `weightedDifference` is defined as (awayScore − homeScore) × weight, so when
 * the pick is the home team we flip the sign. A "push" pick has no selected
 * side; components are returned oriented to the away team by convention but
 * callers should not display component edges for pushes.
 */
export function getComponentEdges(edge: ModelEdgeResult): ComponentEdges {
  const orient = edge.pick === "home" ? -1 : 1;
  const pitching = orient * sumWeightedDifference(edge.factors, COMPONENT_FACTORS.pitching);
  const batting = orient * sumWeightedDifference(edge.factors, COMPONENT_FACTORS.batting);
  const form = orient * sumWeightedDifference(edge.factors, COMPONENT_FACTORS.form);
  return {
    pitching,
    batting,
    form,
    overall: pitching + batting + form,
  };
}

// ---------------------------------------------------------------------------
// Component + edge display bands (labels + colors)
// ---------------------------------------------------------------------------

export type ComponentBandKey = "strong" | "edge" | "even" | "against";

/**
 * Direction/strength band for a single component edge (points favoring the
 * pick). Restrained palette: greens for a real edge, muted slate for even,
 * muted red when the component actually favors the opponent.
 */
export function getComponentBand(value: number): {
  key: ComponentBandKey;
  label: string;
  color: string;
} {
  if (value >= 3.5) return { key: "strong", label: "Advantage", color: "#34d399" };
  if (value >= 1) return { key: "edge", label: "Slight edge", color: "#a3e635" };
  if (value > -1) return { key: "even", label: "Even", color: "#64748b" };
  return { key: "against", label: "Opp edge", color: "#f87171" };
}

/**
 * Grade + numeric-edge color are BOTH derived from `confidence` (a
 * deterministic function of |differential|), so the grade label and the
 * headline Model Edge color can never disagree — item 6 of the redesign spec.
 */
export function getEdgeGrade(confidence: number): {
  key: EdgeTierKey;
  label: string;
  bg: string;
  text: string;
} {
  const key = getEdgeTierKey(confidence);
  const label = getEdgeTierLabel(confidence);
  if (key === "strong") return { key, label, bg: "#16a34a", text: "#ffffff" };
  if (key === "moderate") return { key, label, bg: "#22c55e", text: "#ffffff" };
  if (key === "slight") return { key, label, bg: "#facc15", text: "#000000" };
  return { key, label, bg: "#475569", text: "#ffffff" };
}

/** Signed, one-decimal display of a component/model edge in points (e.g. "+4.2", "-1.1"). */
export function formatEdgePoints(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  // Avoid a signed "-0.0"
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// Market probability (real market data — kept separate from the model)
// ---------------------------------------------------------------------------

/**
 * American moneyline → implied win probability (0–1), vig included.
 * Accepts a numeric or string price ("-136", "+120"). Returns null for
 * missing/invalid input.
 */
export function americanToImpliedProbability(american: string | number | null | undefined): number | null {
  if (american == null || american === "") return null;
  const n = typeof american === "number" ? american : parseFloat(american);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
}

/**
 * No-vig implied probability for the selected side, from a two-sided market.
 * Given the pick's implied probability and the opponent's implied probability
 * (both vig-loaded), normalize out the overround:
 *   noVig(pick) = pickImplied / (pickImplied + oppImplied)
 *
 * Returns null if either side is missing (fails safe rather than presenting a
 * one-sided, vig-loaded number as if it were fair) or the inputs are invalid.
 */
export function noVigProbability(
  pickImplied: number | null | undefined,
  oppImplied: number | null | undefined,
): number | null {
  if (pickImplied == null || oppImplied == null) return null;
  if (!Number.isFinite(pickImplied) || !Number.isFinite(oppImplied)) return null;
  const sum = pickImplied + oppImplied;
  if (sum <= 0) return null;
  const result = pickImplied / sum;
  return Number.isFinite(result) ? result : null;
}

// ---------------------------------------------------------------------------
// Primary reason (one concise, data-derived note)
// ---------------------------------------------------------------------------

/**
 * Build a single concise reason for the lean, derived from the strongest
 * component edge (and any regression context the caller already computed).
 * Returns null when nothing meaningful can be said, so the table can simply
 * omit the note rather than print generic filler.
 */
export function buildPrimaryReason(
  components: ComponentEdges,
  context?: string | null,
): string | null {
  const entries: Array<{ key: keyof ComponentEdges; label: string; value: number }> = [
    { key: "pitching", label: "Starter", value: components.pitching },
    { key: "batting", label: "Lineup", value: components.batting },
    { key: "form", label: "Recent form", value: components.form },
  ];

  const strongest = entries.reduce((best, e) =>
    Math.abs(e.value) > Math.abs(best.value) ? e : best,
  );

  // Nothing is driving the lean with any conviction.
  if (Math.abs(strongest.value) < 1) {
    return context ? context : null;
  }

  // The strongest component actually favors the opponent, yet the overall
  // model still leans the pick — call out what is carrying it instead.
  if (strongest.value < 0 && components.overall > 0) {
    const carriers = entries
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
    if (carriers.length > 0) {
      return `${carriers[0].label} edge offsets weaker ${strongest.label.toLowerCase()}`;
    }
  }

  const driver = strongest.value > 0 ? strongest.label : entries
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)[0]?.label;
  if (!driver) return context ?? null;

  if (driver === "Starter") return "Starter advantage drives the lean";
  if (driver === "Lineup") return "Lineup edge drives the lean";
  return "Recent form tilts the model";
}

// ---------------------------------------------------------------------------
// Data contract
// ---------------------------------------------------------------------------

/**
 * One row of the ML Edges social table. Missing values are preserved as null
 * (never fabricated as 0). See module header for why there is no
 * `mlEdgePercent`/`modelWinProbability`: the model is uncalibrated.
 */
export type MlSocialRow = {
  gamePk: number;
  awayAbbr: string;
  homeAbbr: string;
  awayPitcher: string | null;
  homePitcher: string | null;
  gameTime: string;

  selectedTeam: string;
  fadeTeam: string;
  selectedAmerican: string | null;

  /** Overall model edge for the pick, in factor points (= sum of components). */
  modelEdgePoints: number;
  /** Uncalibrated edge-strength index (50–82) that drives the grade. */
  confidence: number;

  pitchingEdge: number;
  battingEdge: number;
  formEdge: number;

  /** Vig-loaded implied win prob for the pick from its posted moneyline (0–1). */
  marketImpliedProbability: number | null;
  /** Two-sided no-vig implied win prob for the pick (0–1), or null. */
  noVigMarketProbability: number | null;

  polymarketYes: number | null;
  polymarketNo: number | null;

  grade: string;
  primaryReason: string | null;
};

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Deterministic ordering for the ML Edges table:
 *   1. Model Edge (points) descending — strongest model conviction first
 *   2. confidence descending
 *   3. selected team abbreviation ascending
 *   4. gamePk ascending
 *
 * Sorting is by the model's own factor advantage, NOT a market-vs-model
 * probability (which does not exist). The header labels this "Model Edge".
 */
export function compareMlSocialRows(a: MlSocialRow, b: MlSocialRow): number {
  if (b.modelEdgePoints !== a.modelEdgePoints) return b.modelEdgePoints - a.modelEdgePoints;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  if (a.selectedTeam !== b.selectedTeam) return a.selectedTeam < b.selectedTeam ? -1 : 1;
  return a.gamePk - b.gamePk;
}
