/**
 * Curated metric selections for the Team Comparison visualizations.
 *
 * Every id below is a metric key already present in that category's entry in
 * `MATCHUP_CATEGORIES` (matchupCategoryAdvantage.ts) — this file adds no new
 * metric membership, it only chooses a headline subset and fixes its default
 * order. Order here always matches registry order; `matchupCuratedMetrics.test.ts`
 * asserts both facts for every category.
 *
 * Context-only metrics (e.g. time of possession, play-calling rate) are never
 * included — they have no better/worse direction and stay chart-ineligible by
 * construction (see `matchupVisualizationModel.ts`).
 */

import type { MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";

/** Curated 6-8 headline metrics per category, in registry order. Rendered by Rank Towers and Signature Profile alike — one shared list, two views. */
export const CURATED_METRIC_DEFAULTS: Record<MatchupCategoryId, readonly string[]> = {
  overall: [
    "team.overallRating",
    "off.epaPerPlay",
    "def.epaPerPlayAllowed",
    "off.successRate",
    "def.successRateAllowed",
  ],
  offense: [
    "team.offenseRating",
    "off.epaPerPlay",
    "off.successRate",
    "off.yardsPerPlay",
    "off.firstDownsPerPlay",
    "off.thirdDownConversion",
    "off.pointsPerGame",
    "off.turnoversPerGame",
  ],
  defense: [
    "team.defenseRating",
    "def.epaPerPlayAllowed",
    "def.successRateAllowed",
    "def.yardsPerPlayAllowed",
    "def.firstDownsPerPlayAllowed",
    "def.thirdDownConversionAllowed",
    "def.pointsAllowedPerGame",
    "def.takeawaysPerGame",
  ],
  passing: [
    "off.epaPerPass",
    "off.passSuccessRate",
    "off.yardsPerPassAttempt",
    "off.sacksAllowedPerGame",
    "def.epaPerPassAllowed",
    "def.passSuccessRateAllowed",
    "def.opponentYardsPerPassAttempt",
    "def.sacksPerGame",
  ],
  rushing: [
    "off.epaPerRush",
    "off.rushSuccessRate",
    "off.yardsPerRushAttempt",
    "off.runBlockWinRate",
    "def.epaPerRushAllowed",
    "def.rushSuccessRateAllowed",
    "def.opponentYardsPerRushAttempt",
    "def.runStopWinRate",
  ],
  trenches: [
    "off.passBlockWinRate",
    "def.passRushWinRate",
    "off.runBlockWinRate",
    "def.runStopWinRate",
  ],
} as const;

/** A selection may never shrink below this — the Metrics selector refuses further deselection at this floor. */
export const MIN_SELECTED_METRICS = 2;

/**
 * The Spine's fixed headline set, addressed by (category, metric key) since
 * the same key can recur across categories with identical resolved values.
 * No metrics dropdown — this list is not user-editable.
 */
export const SPINE_METRICS: readonly { categoryId: MatchupCategoryId; metricId: string }[] = [
  { categoryId: "overall", metricId: "team.overallRating" },
  { categoryId: "offense", metricId: "team.offenseRating" },
  { categoryId: "defense", metricId: "team.defenseRating" },
  { categoryId: "overall", metricId: "off.epaPerPlay" },
  { categoryId: "overall", metricId: "def.epaPerPlayAllowed" },
  { categoryId: "overall", metricId: "off.successRate" },
  { categoryId: "overall", metricId: "def.successRateAllowed" },
] as const;
