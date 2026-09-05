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
 * WU3 spread evaluation summary shape, as already produced by
 * scripts/lib/nfl-evaluation-materializer.ts (data/nfl/prediction-
 * evaluations/jkb-football-evaluation-v1/summary/<season>.json). Only the
 * fields overview.json actually surfaces are declared here -- everything
 * else on that file is out of scope for this thin summary.
 */
export type SpreadEvaluationSummaryInput = {
  metrics: {
    by_prediction_type: {
      spread: {
        n: number;
        mae: number | null;
        market_comparison: { comparable_n: number; jkb_mae: number | null; market_mae: number | null; jkb_minus_market_mae: number | null };
        winner_accuracy: { accuracy: number | null; total: number };
      };
    };
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
 * Sides are already live in production (jkb-power-number-v1.0.0) but their
 * canonical evaluation summary is only read here, never recomputed. When the
 * summary file itself is unreadable (or the season being asked for has no
 * summary yet), this returns AVAILABLE_BUT_NOT_MATERIALIZED rather than
 * fabricating a zero/placeholder metric -- see WU4 spec Part 11.
 */
export function buildOverviewSidesSection(spread: SpreadEvaluationSummaryInput, latestGradeTimestamp: string | null): OverviewSidesSection {
  if (spread == null) {
    return {
      status: "AVAILABLE_BUT_NOT_MATERIALIZED",
      graded_games: 0,
      spread_mae: null,
      market_direction_metric: null,
      winner_accuracy: null,
      latest_grade_timestamp: null,
      note: "No spread evaluation summary file found for the requested season.",
    };
  }
  const spreadMetrics = spread.metrics.by_prediction_type.spread;
  return {
    status: "AVAILABLE",
    graded_games: spreadMetrics.n,
    spread_mae: spreadMetrics.mae,
    market_direction_metric: {
      comparable_n: spreadMetrics.market_comparison.comparable_n,
      jkb_mae: spreadMetrics.market_comparison.jkb_mae,
      market_mae: spreadMetrics.market_comparison.market_mae,
      jkb_minus_market_mae: spreadMetrics.market_comparison.jkb_minus_market_mae,
    },
    winner_accuracy: spreadMetrics.winner_accuracy.accuracy,
    latest_grade_timestamp: latestGradeTimestamp,
    note: "Thin summary of the canonical WU3 spread evaluation dataset (jkb-power-number-v1.0.0). Full Sides performance support (rows/buckets/detail context) is not yet materialized into a dedicated sides.json.",
  };
}
