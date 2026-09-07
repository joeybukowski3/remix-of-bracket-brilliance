/**
 * WU4 -- pure rollup core for the NFL performance-overview artifact
 * (public/data/nfl/performance/overview.json).
 *
 * This is a thin cross-family summary: it reads only already-canonical
 * derived artifacts (totals.json, props.json, and the WU3 spread evaluation
 * summary) and never recomputes a metric itself. No file I/O lives here --
 * see generate-nfl-performance-overview.ts for the I/O wiring.
 */

export type FamilyAvailabilityStatus = "AVAILABLE" | "NOT_AVAILABLE" | "AVAILABLE_BUT_NOT_MATERIALIZED";

export type TotalsOverviewInput = {
  performanceMeta: { seasons: number[] };
  summary: {
    graded_games: number;
    game_total_mae: number | null;
    mean_signed_error: number | null;
    directional_hit_rate: number | null;
  };
  performanceMetaLatestOutcomeTimestamp: string | null;
} | null;

export type PropsOverviewInput = {
  performanceMeta: { seasons: number[] };
  summary: {
    graded_starter_props: number;
    directional_hit_rate: number | null;
    projection_mae: number | null;
    passing_n: number;
    rushing_n: number;
    receiving_n: number;
  };
} | null;

/**
 * WU6 canonical sides performance artifact summary shape, as produced by
 * scripts/lib/nfl-sides-performance.ts (public/data/nfl/performance/sides.json).
 * Only the fields overview.json surfaces are declared here.
 */
export type SidesOverviewInput = {
  performanceMeta: { latestOutcomeTimestamp: string | null };
  summary: {
    graded_games: number;
    margin_mae: number | null;
    mean_signed_error: number | null;
    ats_directional_hit_rate: number | null;
    correlation_projected_actual_margin: number | null;
    average_abs_jkb_market_difference: number | null;
    winner_accuracy: { accuracy: number | null; total: number };
    market_comparison: { comparable_n: number; jkb_mae: number | null; market_mae: number | null; jkb_minus_market_mae: number | null };
  };
} | null;

export type OverviewTotalsSection = {
  status: FamilyAvailabilityStatus;
  graded_games: number;
  mae: number | null;
  bias: number | null;
  directional_hit_rate: number | null;
  latest_grade_timestamp: string | null;
};

export type OverviewPropsSection = {
  status: FamilyAvailabilityStatus;
  graded_props: number;
  directional_hit_rate: number | null;
  mae: number | null;
  passing_n: number;
  rushing_n: number;
  receiving_n: number;
  latest_grade_timestamp: string | null;
};

export type OverviewSidesSection = {
  status: FamilyAvailabilityStatus;
  graded_games: number;
  spread_mae: number | null;
  bias: number | null;
  correlation: number | null;
  ats_directional_hit_rate: number | null;
  average_abs_jkb_market_difference: number | null;
  market_direction_metric: {
    comparable_n: number;
    jkb_mae: number | null;
    market_mae: number | null;
    jkb_minus_market_mae: number | null;
  } | null;
  winner_accuracy: number | null;
  latest_grade_timestamp: string | null;
  note: string;
};

export function buildOverviewTotalsSection(totals: TotalsOverviewInput, latestGradeTimestamp: string | null): OverviewTotalsSection {
  if (totals == null) {
    return { status: "NOT_AVAILABLE", graded_games: 0, mae: null, bias: null, directional_hit_rate: null, latest_grade_timestamp: null };
  }
  return {
    status: "AVAILABLE",
    graded_games: totals.summary.graded_games,
    mae: totals.summary.game_total_mae,
    bias: totals.summary.mean_signed_error,
    directional_hit_rate: totals.summary.directional_hit_rate,
    latest_grade_timestamp: latestGradeTimestamp,
  };
}

export function buildOverviewPropsSection(props: PropsOverviewInput, latestGradeTimestamp: string | null): OverviewPropsSection {
  if (props == null) {
    return {
      status: "NOT_AVAILABLE",
      graded_props: 0,
      directional_hit_rate: null,
      mae: null,
      passing_n: 0,
      rushing_n: 0,
      receiving_n: 0,
      latest_grade_timestamp: null,
    };
  }
  return {
    status: "AVAILABLE",
    graded_props: props.summary.graded_starter_props,
    directional_hit_rate: props.summary.directional_hit_rate,
    mae: props.summary.projection_mae,
    passing_n: props.summary.passing_n,
    rushing_n: props.summary.rushing_n,
    receiving_n: props.summary.receiving_n,
    latest_grade_timestamp: latestGradeTimestamp,
  };
}

/**
 * WU6: sides now has a dedicated canonical artifact
 * (public/data/nfl/performance/sides.json). This reads that summary
 * verbatim -- it never recomputes a metric and never falls back to the thin
 * WU3 evaluation-summary shortcut. When sides.json is missing, this returns
 * NOT_AVAILABLE rather than fabricating a zero/placeholder metric.
 */
export function buildOverviewSidesSection(sides: SidesOverviewInput, latestGradeTimestamp: string | null): OverviewSidesSection {
  if (sides == null) {
    return {
      status: "NOT_AVAILABLE",
      graded_games: 0,
      spread_mae: null,
      bias: null,
      correlation: null,
      ats_directional_hit_rate: null,
      average_abs_jkb_market_difference: null,
      market_direction_metric: null,
      winner_accuracy: null,
      latest_grade_timestamp: null,
      note: "No canonical sides.json performance artifact found.",
    };
  }
  const s = sides.summary;
  return {
    status: "AVAILABLE",
    graded_games: s.graded_games,
    spread_mae: s.margin_mae,
    bias: s.mean_signed_error,
    correlation: s.correlation_projected_actual_margin,
    ats_directional_hit_rate: s.ats_directional_hit_rate,
    average_abs_jkb_market_difference: s.average_abs_jkb_market_difference,
    market_direction_metric: {
      comparable_n: s.market_comparison.comparable_n,
      jkb_mae: s.market_comparison.jkb_mae,
      market_mae: s.market_comparison.market_mae,
      jkb_minus_market_mae: s.market_comparison.jkb_minus_market_mae,
    },
    winner_accuracy: s.winner_accuracy.accuracy,
    latest_grade_timestamp: latestGradeTimestamp,
    note: "Canonical summary of public/data/nfl/performance/sides.json (jkb-power-number-v1.0.0). Row-level detail, buckets and pregame context live in that artifact.",
  };
}
