/**
 * Metric resolution for the Team Comparison surface.
 *
 * The analyzer sources its numbers from four independent, already-verified
 * resolvers, each with its own period policy:
 *
 *   conventional + EPA  the composed NflMatchupMetricResolver, driven by the
 *                       Season / Last 5 and historical-blend controls
 *   success rate        RBSDM, which publishes finished rates without play
 *                       denominators and therefore keeps its own period policy
 *   trench win rates    ESPN, which publishes cumulative season figures only
 *
 * Nothing here computes, aggregates, blends or estimates a statistic. It only
 * decides *which existing resolver answers a given metric key*, and for the
 * two period-based sources it reads the most recent visible period so a single
 * comparison row can show one value per team. The full period-by-period view
 * stays in its own section, unchanged.
 *
 * A key no resolver can answer stays null and renders "N/A" — first downs,
 * third down and time of possession included. Those are declared unavailable by
 * the repository's methodology and are never substituted or interpolated.
 */

import {
  MATCHUP_TEAM_METRICS,
  classifyMetricComparison,
  computeCategoryAdvantage,
  type CategoryAdvantageResult,
  type MatchupCategory,
  type MatchupCategoryId,
  type MetricComparison,
} from "@/lib/nfl/matchupCategoryAdvantage";
import type { ComparisonDirection } from "@/lib/nfl/matchupComparison";
import {
  formatHeroModelRating,
  unavailableHeroModelRatings,
  type HeroModelRatingResolver,
} from "@/lib/nfl/heroModelRatings";
import {
  METRIC_NA,
  getMetricDef,
  type NflMatchupMetricResolver,
} from "@/lib/nfl/matchupMetrics";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import {
  formatSuccessRate,
  isSuccessRateMetric,
  type SuccessPeriodKey,
  type SuccessRateResolver,
} from "@/lib/nfl/successRateData";
import {
  formatTrenchValue,
  isTrenchMetric,
  type TrenchPeriodKey,
  type TrenchResolver,
} from "@/lib/nfl/trenchMetricsData";

export type MatchupDisplaySide = {
  /** Raw comparable value; null when genuinely unavailable. */
  value: number | null;
  rank: number | null;
  /** Pre-formatted display string; "N/A" when unavailable. */
  formatted: string;
};

export type MatchupDisplayMetric = {
  key: string;
  label: string;
  shortLabel?: string;
  help?: string;
  direction: ComparisonDirection;
  away: MatchupDisplaySide;
  home: MatchupDisplaySide;
  comparison: MetricComparison;
};

export type MatchupSuccessRateSource = {
  periods: readonly SuccessPeriodKey[];
  resolve: SuccessRateResolver;
};

export type MatchupTrenchSource = {
  periods: readonly TrenchPeriodKey[];
  resolve: TrenchResolver;
};

export type MatchupMetricSources = {
  /** Conventional + EPA resolver, keyed by team slug. */
  resolver: NflMatchupMetricResolver;
  /** RBSDM success rates, keyed by canonical abbreviation. */
  successRate?: MatchupSuccessRateSource;
  /** ESPN line-of-scrimmage win rates, keyed by canonical abbreviation. */
  trench?: MatchupTrenchSource;
  /** Generated power board, keyed by canonical abbreviation. */
  modelRatings?: HeroModelRatingResolver;
};

const UNAVAILABLE: MatchupDisplaySide = { value: null, rank: null, formatted: METRIC_NA };

/**
 * The period a single comparison row reads.
 *
 * Both period-based sources order their periods oldest first, so the most
 * recent visible period is the last entry. Taking the newest keeps the inline
 * row consistent with what a reader would call "current", and the dedicated
 * period section still shows every visible period side by side.
 */
function latestPeriod<T>(periods: readonly T[] | undefined): T | null {
  if (!periods || periods.length === 0) return null;
  return periods[periods.length - 1];
}

/**
 * A power-board rating. Formatted on the model's 1-99 public scale — never as a
 * percentage, which is what the retired static ratings were and what labelling
 * this value "%" would misstate.
 */
function ratingSide(value: number | null, rank: number | null): MatchupDisplaySide {
  if (value == null || !Number.isFinite(value)) return { value: null, rank: null, formatted: METRIC_NA };
  return { value, rank, formatted: formatHeroModelRating(value) };
}

function resolveCatalogueSide(
  team: NflMatchupTeam,
  metricKey: string,
  sources: MatchupMetricSources
): MatchupDisplaySide {
  if (isSuccessRateMetric(metricKey) && sources.successRate) {
    const period = latestPeriod(sources.successRate.periods);
    const value = period ? sources.successRate.resolve(team.abbr, metricKey, period) : null;
    if (!value) return UNAVAILABLE;
    return { value: value.pct, rank: value.rank, formatted: formatSuccessRate(value) };
  }

  if (isTrenchMetric(metricKey) && sources.trench) {
    const period = latestPeriod(sources.trench.periods);
    const value = period ? sources.trench.resolve(team.abbr, metricKey, period) : null;
    if (!value) return UNAVAILABLE;
    return { value: value.valuePct, rank: value.espnRank, formatted: formatTrenchValue(value) };
  }

  const resolved = sources.resolver(team.slug, metricKey);
  if (!resolved) return UNAVAILABLE;
  return { value: resolved.value, rank: resolved.rank, formatted: resolved.formattedValue };
}

/**
 * Resolve every row of one category for one matchup.
 *
 * The comparison stored on each row is computed from the raw values and the
 * catalogue's declared direction — the formatted strings beside them play no
 * part in it.
 */
export function resolveCategoryMetrics(
  category: MatchupCategory,
  matchup: NflMatchup,
  sources: MatchupMetricSources
): MatchupDisplayMetric[] {
  const rows: MatchupDisplayMetric[] = [];

  for (const ref of category.metrics) {
    if (ref.kind === "team") {
      const def = MATCHUP_TEAM_METRICS[ref.id];
      const resolveRating = sources.modelRatings ?? unavailableHeroModelRatings;
      const awayRating = resolveRating(matchup.away.abbr);
      const homeRating = resolveRating(matchup.home.abbr);
      const away = ratingSide(def.value(awayRating), def.rank(awayRating));
      const home = ratingSide(def.value(homeRating), def.rank(homeRating));
      rows.push({
        key: `team.${def.id}`,
        label: def.label,
        help: def.help,
        direction: def.direction,
        away,
        home,
        comparison: classifyMetricComparison({
          key: `team.${def.id}`,
          direction: def.direction,
          awayValue: away.value,
          homeValue: home.value,
        }),
      });
      continue;
    }

    const def = getMetricDef(ref.key);
    if (!def) continue;
    const away = resolveCatalogueSide(matchup.away, ref.key, sources);
    const home = resolveCatalogueSide(matchup.home, ref.key, sources);
    rows.push({
      key: ref.key,
      label: def.label,
      shortLabel: def.shortLabel,
      help: def.help,
      direction: def.direction,
      away,
      home,
      comparison: classifyMetricComparison({
        key: ref.key,
        direction: def.direction,
        awayValue: away.value,
        homeValue: home.value,
      }),
    });
  }

  return rows;
}

/** Roll one category's resolved rows up into its advantage result. */
export function categoryResultFrom(
  categoryId: MatchupCategoryId,
  rows: readonly MatchupDisplayMetric[]
): CategoryAdvantageResult {
  return computeCategoryAdvantage(
    categoryId,
    rows.map((row) => ({
      key: row.key,
      direction: row.direction,
      awayValue: row.away.value,
      homeValue: row.home.value,
    }))
  );
}

/** Advantage stated in words, using the matchup's live abbreviations. */
export function describeMetricAdvantage(
  comparison: MetricComparison,
  awayAbbr: string,
  homeAbbr: string
): string {
  switch (comparison) {
    case "away":
      return `${awayAbbr.toUpperCase()} advantage`;
    case "home":
      return `${homeAbbr.toUpperCase()} advantage`;
    case "tie":
      return "Even";
    case "missing":
      return "No data";
    default:
      return "Not compared";
  }
}
