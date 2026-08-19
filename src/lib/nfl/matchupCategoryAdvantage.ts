/**
 * Category Advantage — presentation-level roll-up for the matchup analyzer.
 *
 * This module counts metrics that other layers have already resolved. It
 * introduces no ranking, no weighting and no model logic, it never touches the
 * projection, and it produces no pick, confidence, probability, edge or betting
 * language. It is a description of "how many of the statistics shown in this
 * section does each team lead", nothing more.
 *
 * Two hard rules make the count trustworthy:
 *
 *  1. Every decision is made from raw comparable numbers plus the metric's
 *     declared direction. Formatted display strings are never parsed, and rank
 *     is never used to choose a winner — an average of ranks across metrics with
 *     different units is not a comparison.
 *  2. `advantage === "none"` from matchupComparison.ts is deliberately not
 *     consumed here. That value is overloaded: it means both "this metric is not
 *     comparable" and "a value is missing", and those two states must be counted
 *     differently (one is excluded as not applicable, the other is a data gap).
 *     Classification is therefore done here, in order, from direction and raw
 *     values.
 *
 * The category registry below is the single source of order and membership. The
 * Overview table and the Team Comparison accordions both read it, so the two
 * surfaces cannot drift apart, and the hashes are stable category identifiers
 * that contain no team, slug or game reference.
 */

import type { HeroModelRating } from "@/lib/nfl/heroModelRatings";
import type { ComparisonDirection } from "@/lib/nfl/matchupComparison";
import {
  DEFENSE_OVERALL_METRICS,
  DEFENSE_PASS_METRICS,
  DEFENSE_RUN_METRICS,
  OFFENSE_OVERALL_METRICS,
  OFFENSE_PASSING_METRICS,
  OFFENSE_RUSHING_METRICS,
  TRENCH_BATTLES,
} from "@/lib/nfl/matchupMetrics";

export type MatchupCategoryId =
  | "overall"
  | "offense"
  | "defense"
  | "passing"
  | "rushing"
  | "trenches";

/**
 * The Joe Knows Ball power-model baseline values.
 *
 * These are not new metrics. They are the generated team-strength ratings the
 * analyzer already renders — the hero's team blocks and the "JKB Offense
 * Rating" / "JKB Defense Rating" baseline row at the top of each unit
 * comparison — moved into the category they describe, so every row a category
 * displays is also a row it counts.
 *
 * overallRating reads the universal current-rating board (the same source
 * every current-OVR surface on the site reads); offenseRating/defenseRating
 * read the existing objective v0.3.1 unit board. Both come through
 * `heroModelRatings.ts`'s single resolver rather than the guide's 2025
 * composite percentages -- showing a second rating system beside the
 * model-driven metrics is exactly the contradiction that resolver exists to
 * remove. Because they come from those boards rather than the metric
 * artifact, they are declared here instead of as catalogue keys.
 *
 * They are neutral-field ratings on the model's 1-99 public scale, not a game
 * prediction: no spread, win probability or picked winner is derived from them.
 */
export type MatchupTeamMetricId = "overallRating" | "offenseRating" | "defenseRating";

export type MatchupTeamMetricDef = {
  id: MatchupTeamMetricId;
  label: string;
  direction: ComparisonDirection;
  help: string;
  value: (rating: HeroModelRating | null) => number | null;
  rank: (rating: HeroModelRating | null) => number | null;
};

export const MATCHUP_TEAM_METRICS: Record<MatchupTeamMetricId, MatchupTeamMetricDef> = {
  overallRating: {
    id: "overallRating",
    label: "JKB Power Rating",
    direction: "higher-is-better",
    help: "Joe Knows Ball neutral-field team strength on the model's 1-99 public scale, centred on 50. A season baseline — it does not respond to the sample controls.",
    value: (rating) => rating?.rating ?? null,
    rank: (rating) => rating?.rank ?? null,
  },
  offenseRating: {
    id: "offenseRating",
    label: "JKB Offense Rating",
    direction: "higher-is-better",
    help: "Joe Knows Ball offensive strength on the model's 1-99 public scale. A season baseline — it does not respond to the sample controls.",
    value: (rating) => rating?.offenseRating ?? null,
    rank: (rating) => rating?.offenseRank ?? null,
  },
  defenseRating: {
    id: "defenseRating",
    label: "JKB Defense Rating",
    direction: "higher-is-better",
    help: "Joe Knows Ball defensive strength on the model's 1-99 public scale, where higher means a better defense. A season baseline — it does not respond to the sample controls.",
    value: (rating) => rating?.defenseRating ?? null,
    rank: (rating) => rating?.defenseRank ?? null,
  },
};

/** One row inside a category: a catalogue metric, or a power-model baseline. */
export type MatchupCategoryMetricRef =
  | { kind: "metric"; key: string }
  | { kind: "team"; id: MatchupTeamMetricId };

export type MatchupCategory = {
  id: MatchupCategoryId;
  /** Display label used by the Overview table and the accordion trigger. */
  label: string;
  /** Stable, team-neutral URL fragment, e.g. "comparison-defense". */
  hash: string;
  metrics: readonly MatchupCategoryMetricRef[];
};

const metricRefs = (
  ...groups: readonly (readonly { key: string }[])[]
): MatchupCategoryMetricRef[] =>
  groups.flat().map((def) => ({ kind: "metric" as const, key: def.key }));

/**
 * Trench membership is taken from TRENCH_BATTLES rather than restated, so the
 * category tracks the four line-of-scrimmage win rates the Trenches surface
 * already pairs. Order follows the battle order: block, then the front it faces.
 */
const TRENCH_METRIC_REFS: MatchupCategoryMetricRef[] = TRENCH_BATTLES.flatMap((battle) => [
  { kind: "metric" as const, key: battle.offenseKey },
  { kind: "metric" as const, key: battle.defenseKey },
]);

/**
 * Category order. This is the order the Overview table lists and the order the
 * Team Comparison accordions stack, by construction.
 *
 * Market Profile, Success Rate by Period, Availability and Model Projection are
 * deliberately absent. Market data describes what a sportsbook priced, not how
 * a team performed, and must never decide a team-performance category.
 *
 * "Overall Quality" pairs the power-model baseline with the whole-team
 * efficiency metrics — offensive and defensive EPA and success rate — plus the
 * context-only time-of-possession row the catalogue declares. Time of
 * possession is displayed and never counted, which is exactly the state the
 * "not comparable" classification exists to express.
 */
export const MATCHUP_CATEGORIES: readonly MatchupCategory[] = [
  {
    id: "overall",
    label: "Overall Quality",
    hash: "comparison-overall",
    metrics: [
      { kind: "team", id: "overallRating" },
      { kind: "metric", key: "off.epaPerPlay" },
      { kind: "metric", key: "def.epaPerPlayAllowed" },
      { kind: "metric", key: "off.successRate" },
      { kind: "metric", key: "def.successRateAllowed" },
      { kind: "metric", key: "off.timeOfPossession" },
    ],
  },
  {
    id: "offense",
    label: "Offense",
    hash: "comparison-offense",
    metrics: [{ kind: "team", id: "offenseRating" }, ...metricRefs(OFFENSE_OVERALL_METRICS)],
  },
  {
    id: "defense",
    label: "Defense",
    hash: "comparison-defense",
    metrics: [{ kind: "team", id: "defenseRating" }, ...metricRefs(DEFENSE_OVERALL_METRICS)],
  },
  {
    id: "passing",
    label: "Passing",
    hash: "comparison-passing",
    metrics: metricRefs(OFFENSE_PASSING_METRICS, DEFENSE_PASS_METRICS),
  },
  {
    id: "rushing",
    label: "Rushing",
    hash: "comparison-rushing",
    metrics: metricRefs(OFFENSE_RUSHING_METRICS, DEFENSE_RUN_METRICS),
  },
  {
    id: "trenches",
    label: "Trenches",
    hash: "comparison-trenches",
    metrics: TRENCH_METRIC_REFS,
  },
] as const;

export const MATCHUP_CATEGORY_IDS: readonly MatchupCategoryId[] = MATCHUP_CATEGORIES.map(
  (category) => category.id
);

export function isMatchupCategoryId(value: string): value is MatchupCategoryId {
  return (MATCHUP_CATEGORY_IDS as readonly string[]).includes(value);
}

export function getMatchupCategory(id: MatchupCategoryId): MatchupCategory {
  const category = MATCHUP_CATEGORIES.find((entry) => entry.id === id);
  // The registry is exhaustive over the id union, so this is unreachable;
  // throwing beats silently rendering an unlabelled category.
  if (!category) throw new Error(`Unknown matchup category: ${id}`);
  return category;
}

/** DOM id of a category's accordion trigger — the jump destination's focus target. */
export function matchupCategoryTriggerId(id: MatchupCategoryId): string {
  return `${getMatchupCategory(id).hash}-trigger`;
}

// ---------------------------------------------------------------------------
// Per-metric classification
// ---------------------------------------------------------------------------

/**
 * The outcome of comparing one metric across the two teams.
 *
 *  away / home   — that side leads on the raw value, read through the direction
 *  tie           — the raw values are equal, including 0 vs 0. A real result.
 *  not-comparable— the metric has no better/worse direction. Not a data gap.
 *  missing       — one or both raw values are absent or non-finite.
 */
export type MetricComparison = "away" | "home" | "tie" | "not-comparable" | "missing";

export type CategoryMetricInput = {
  key: string;
  direction: ComparisonDirection;
  /** Raw comparable value. Never a formatted string. */
  awayValue: number | null;
  homeValue: number | null;
};

/**
 * Classify one metric, in the order the specification fixes:
 *
 *   1. no direction to read  -> not comparable (excluded, not a gap)
 *   2. a value is missing or non-finite -> missing (excluded as a gap)
 *   3. otherwise compare the raw numbers through the direction; equal is a tie
 */
export function classifyMetricComparison(input: CategoryMetricInput): MetricComparison {
  const { direction, awayValue, homeValue } = input;
  if (direction === "context-only" || direction === "none") return "not-comparable";
  if (
    awayValue == null ||
    homeValue == null ||
    !Number.isFinite(awayValue) ||
    !Number.isFinite(homeValue)
  ) {
    return "missing";
  }
  if (awayValue === homeValue) return "tie";
  const awayLeads = direction === "higher-is-better" ? awayValue > homeValue : awayValue < homeValue;
  return awayLeads ? "away" : "home";
}

// ---------------------------------------------------------------------------
// Per-category roll-up
// ---------------------------------------------------------------------------

export type CategoryAdvantageResult = {
  categoryId: MatchupCategoryId;
  /** "na" means no metric in the category could be compared at all. */
  result: "away" | "home" | "even" | "na";
  awayLeads: number;
  homeLeads: number;
  ties: number;
  /** Metrics that were actually comparable: leads plus ties. */
  eligible: number;
};

/**
 * Unweighted count of the eligible metrics in one category.
 *
 * Ties are eligible and are counted, but can never decide the category — only
 * the two lead counts are compared. Equal lead counts is a genuine EVEN result;
 * zero eligible metrics is N/A and is never presented as a tie.
 */
export function computeCategoryAdvantage(
  categoryId: MatchupCategoryId,
  metrics: readonly CategoryMetricInput[]
): CategoryAdvantageResult {
  let awayLeads = 0;
  let homeLeads = 0;
  let ties = 0;

  for (const metric of metrics) {
    const comparison = classifyMetricComparison(metric);
    if (comparison === "away") awayLeads += 1;
    else if (comparison === "home") homeLeads += 1;
    else if (comparison === "tie") ties += 1;
  }

  const eligible = awayLeads + homeLeads + ties;
  const result =
    eligible === 0 ? "na" : awayLeads > homeLeads ? "away" : homeLeads > awayLeads ? "home" : "even";

  return { categoryId, result, awayLeads, homeLeads, ties, eligible };
}

/**
 * Accessible label for a category row.
 *
 * The visual row reads only as a category plus an abbreviation, so the full
 * result — which team,
 * how many of how many metrics — is carried here for assistive technology.
 * Built entirely from live data; no team, abbreviation or matchup is baked in.
 */
export function describeCategoryAdvantage(
  result: CategoryAdvantageResult,
  categoryLabel: string,
  awayTeamName: string,
  homeTeamName: string
): string {
  if (result.result === "away" || result.result === "home") {
    const teamName = result.result === "away" ? awayTeamName : homeTeamName;
    const leads = result.result === "away" ? result.awayLeads : result.homeLeads;
    return `${categoryLabel}: ${teamName} advantage, leading ${leads} of ${result.eligible} comparable metrics. Open detailed metrics.`;
  }
  if (result.result === "even") {
    return `${categoryLabel}: even, ${result.awayLeads} metrics each of ${result.eligible} comparable. Open detailed metrics.`;
  }
  return `${categoryLabel}: insufficient data, no comparable metrics available. Open detailed metrics.`;
}

/** Verbatim note rendered beneath the Category Advantage table. */
export const CATEGORY_ADVANTAGE_NOTE =
  "Category advantages are based on an unweighted count of the comparable metrics shown in each section. They are not the model projection.";
