/**
 * WU4 -- pure metrics/rollup/row-shaping core for the NFL starter-props
 * performance artifact (public/data/nfl/performance/props.json).
 *
 * This module contains NO file I/O and NO grading logic of its own: it
 * consumes already-canonical `StarterPropEvaluationRowV1` rows (WU2's
 * generate-nfl-starter-prop-evaluations.mts) and already-persisted
 * `StarterPropExclusion` diagnostics, and only reshapes/aggregates them for
 * the frontend. `directional_result` is read verbatim off each row -- never
 * recomputed -- so grading semantics can never drift between the evaluation
 * archive and this public view.
 */
import { absPointBucket } from "./nfl-evaluation-cohorts";
import type {
  EvaluationExclusionReason,
  StarterPropDirection,
  StarterPropExclusion,
  StarterPropEvaluationRowV1,
  StarterPropMarket,
} from "./nfl-starter-prop-evaluation";
import type { StarterCohortRecordV1 } from "./nfl-starter-cohort";

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// -------------------------------------------------------------------------
// Compact visible rows + nested detail context
// -------------------------------------------------------------------------

export type PropsPerformanceRow = {
  evaluation_row_id: string;
  season: number;
  week: number;
  game_id: string;
  player_id: string;
  player: string | null;
  position: StarterCohortRecordV1["position"];
  team: string;
  opponent: string;
  market: StarterPropMarket;
  line: number;
  jkb_projection: number;
  difference: number;
  actual: number;
  direction: StarterPropDirection;
  result: StarterPropEvaluationRowV1["directional_result"];
  absolute_error: number;
  starter_basis: StarterCohortRecordV1["starter_basis"];
  model_version: string;
  detail: {
    kickoff_time: string;
    home_away: "home" | "away";
    starter_rank: number;
    starter_metric: StarterCohortRecordV1["starter_metric"];
    starter_metric_value: number;
    prediction_id: string;
    prediction_timestamp: string;
    prediction_type: StarterPropEvaluationRowV1["prediction_type"];
    fitted_model_hash: string | null;
    projection_status: StarterPropEvaluationRowV1["projection_status"];
    market_provider: string;
    market_book: string;
    market_snapshot_timestamp: string;
    market_snapshot_ref: string | null;
    over_price: number | null;
    under_price: number | null;
    market_outcome: StarterPropEvaluationRowV1["market_outcome"];
    game_completion_status: StarterPropEvaluationRowV1["game_completion_status"];
    resolution_status: StarterPropEvaluationRowV1["resolution_status"];
    signed_projection_error: number;
    squared_projection_error: number;
    generated_at: string;
    outcome_id: string;
    outcome_revision: number;
    resolver_version: StarterPropEvaluationRowV1["resolver_version"];
    outcome_source_state_hash: string;
    feature_payload_hash: string;
    context: Record<string, unknown>;
  };
};

export function buildPropsPerformanceRow(row: StarterPropEvaluationRowV1): PropsPerformanceRow {
  return {
    evaluation_row_id: row.evaluation_row_id,
    season: row.season,
    week: row.week,
    game_id: row.game_id,
    player_id: row.player_id,
    player: row.player_name,
    position: row.position,
    team: row.team,
    opponent: row.opponent,
    market: row.market,
    line: row.market_line,
    jkb_projection: row.jkb_projection,
    difference: row.projection_difference,
    actual: row.actual,
    direction: row.direction,
    result: row.directional_result,
    absolute_error: row.absolute_projection_error,
    starter_basis: row.starter_basis,
    model_version: row.model_version,
    detail: {
      kickoff_time: row.kickoff_time,
      home_away: row.home_away,
      starter_rank: row.starter_rank,
      starter_metric: row.starter_metric,
      starter_metric_value: row.starter_metric_value,
      prediction_id: row.prediction_id,
      prediction_timestamp: row.prediction_timestamp,
      prediction_type: row.prediction_type,
      fitted_model_hash: row.fitted_model_hash,
      projection_status: row.projection_status,
      market_provider: row.market_provider,
      market_book: row.market_book,
      market_snapshot_timestamp: row.market_snapshot_timestamp,
      market_snapshot_ref: row.market_snapshot_ref,
      over_price: row.over_price,
      under_price: row.under_price,
      market_outcome: row.market_outcome,
      game_completion_status: row.game_completion_status,
      resolution_status: row.resolution_status,
      signed_projection_error: row.signed_projection_error,
      squared_projection_error: row.squared_projection_error,
      generated_at: row.generated_at,
      outcome_id: row.outcome_id,
      outcome_revision: row.outcome_revision,
      resolver_version: row.resolver_version,
      outcome_source_state_hash: row.outcome_source_state_hash,
      feature_payload_hash: row.feature_payload_hash,
      context: row.context,
    },
  };
}

// -------------------------------------------------------------------------
// Summary metrics
// -------------------------------------------------------------------------

export type PropsSummaryMetrics = {
  graded_starter_props: number;
  passing_n: number;
  rushing_n: number;
  receiving_n: number;
  wins: number;
  losses: number;
  pushes: number;
  neutral: number;
  directional_hit_rate: number | null;
  over_wins: number;
  over_losses: number;
  over_hit_rate: number | null;
  under_wins: number;
  under_losses: number;
  under_hit_rate: number | null;
  projection_mae: number | null;
  projection_rmse: number | null;
  median_absolute_error: number | null;
  mean_signed_projection_error: number | null;
  average_abs_jkb_line_difference: number | null;
};

/** Market family (rows) driven purely by `row.market`, not `row.position` -- WR/TE share `receiving_yards`. */
function marketToCountKey(market: StarterPropMarket): "passing_n" | "rushing_n" | "receiving_n" {
  if (market === "passing_yards") return "passing_n";
  if (market === "rushing_yards") return "rushing_n";
  return "receiving_n";
}

export function computePropsSummaryMetrics(rows: readonly PropsPerformanceRow[]): PropsSummaryMetrics {
  let passingN = 0;
  let rushingN = 0;
  let receivingN = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let neutral = 0;
  let overWins = 0;
  let overLosses = 0;
  let underWins = 0;
  let underLosses = 0;

  for (const row of rows) {
    const key = marketToCountKey(row.market);
    if (key === "passing_n") passingN += 1;
    else if (key === "rushing_n") rushingN += 1;
    else receivingN += 1;

    if (row.result === "WIN") wins += 1;
    else if (row.result === "LOSS") losses += 1;
    else if (row.result === "PUSH") pushes += 1;
    else neutral += 1;

    if (row.direction === "OVER") {
      if (row.result === "WIN") overWins += 1;
      else if (row.result === "LOSS") overLosses += 1;
    } else if (row.direction === "UNDER") {
      if (row.result === "WIN") underWins += 1;
      else if (row.result === "LOSS") underLosses += 1;
    }
  }

  const absErrors = rows.map((r) => r.absolute_error);
  const signedErrors = rows.map((r) => r.detail.signed_projection_error);
  const lineDiffs = rows.map((r) => Math.abs(r.line - r.jkb_projection));

  return {
    graded_starter_props: rows.length,
    passing_n: passingN,
    rushing_n: rushingN,
    receiving_n: receivingN,
    wins,
    losses,
    pushes,
    neutral,
    directional_hit_rate: wins + losses === 0 ? null : wins / (wins + losses),
    over_wins: overWins,
    over_losses: overLosses,
    over_hit_rate: overWins + overLosses === 0 ? null : overWins / (overWins + overLosses),
    under_wins: underWins,
    under_losses: underLosses,
    under_hit_rate: underWins + underLosses === 0 ? null : underWins / (underWins + underLosses),
    projection_mae: mean(absErrors),
    projection_rmse: signedErrors.length === 0 ? null : Math.sqrt(mean(signedErrors.map((e) => e ** 2)) as number),
    median_absolute_error: median(absErrors),
    mean_signed_projection_error: mean(signedErrors),
    average_abs_jkb_line_difference: mean(lineDiffs),
  };
}

// -------------------------------------------------------------------------
// Bucket / segmentation rollups
// -------------------------------------------------------------------------

export type PropsBucketRollup = {
  key: string;
  n: number;
  mae: number | null;
  bias: number | null;
  wins: number;
  losses: number;
  pushes: number;
  hit_rate: number | null;
};

function rollupGroup(key: string, rows: readonly PropsPerformanceRow[]): PropsBucketRollup {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  for (const row of rows) {
    if (row.result === "WIN") wins += 1;
    else if (row.result === "LOSS") losses += 1;
    else if (row.result === "PUSH") pushes += 1;
  }
  return {
    key,
    n: rows.length,
    mae: mean(rows.map((r) => r.absolute_error)),
    bias: mean(rows.map((r) => r.detail.signed_projection_error)),
    wins,
    losses,
    pushes,
    hit_rate: wins + losses === 0 ? null : wins / (wins + losses),
  };
}

function groupBy<T>(rows: readonly PropsPerformanceRow[], keyOf: (row: PropsPerformanceRow) => T | null): Map<T, PropsPerformanceRow[]> {
  const map = new Map<T, PropsPerformanceRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

export type PropsBucketRollups = {
  by_week: PropsBucketRollup[];
  by_market: PropsBucketRollup[];
  by_position: PropsBucketRollup[];
  by_direction: PropsBucketRollup[];
  by_starter_basis: PropsBucketRollup[];
  by_jkb_line_difference_bucket: PropsBucketRollup[];
};

export function computePropsBucketRollups(rows: readonly PropsPerformanceRow[]): PropsBucketRollups {
  const byWeek = groupBy(rows, (r) => r.week);
  const byMarket = groupBy(rows, (r) => r.market);
  const byPosition = groupBy(rows, (r) => r.position);
  const byDirection = groupBy(rows, (r) => r.direction);
  const byStarterBasis = groupBy(rows, (r) => r.starter_basis);
  const byLineDiffBucket = groupBy(rows, (r) => absPointBucket(Math.abs(r.line - r.jkb_projection), [3, 6, 10, 15]));

  return {
    by_week: [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, groupRows]) => rollupGroup(String(week), groupRows)),
    by_market: [...byMarket.entries()].map(([key, groupRows]) => rollupGroup(key, groupRows)),
    by_position: [...byPosition.entries()].map(([key, groupRows]) => rollupGroup(key, groupRows)),
    by_direction: [...byDirection.entries()].map(([key, groupRows]) => rollupGroup(key, groupRows)),
    by_starter_basis: [...byStarterBasis.entries()].map(([key, groupRows]) => rollupGroup(key, groupRows)),
    by_jkb_line_difference_bucket: [...byLineDiffBucket.entries()].map(([key, groupRows]) => rollupGroup(key, groupRows)),
  };
}

// -------------------------------------------------------------------------
// Exclusion / coverage diagnostics
// -------------------------------------------------------------------------

export type PropsCoverageDiagnostics = {
  total_cohort_rows: number;
  gradeable_rows: number;
  excluded_rows: number;
  exclusions_by_reason: Record<EvaluationExclusionReason, number>;
};

const EXCLUSION_REASONS: EvaluationExclusionReason[] = [
  "NO_VALID_PROJECTION",
  "MODEL_STATUS_NOT_PROJECTED",
  "POST_KICKOFF_ONLY_PROJECTION",
  "NO_VALID_COMPARISON_LINE",
  "GAME_NOT_FINAL",
  "ACTUAL_UNRESOLVED",
  "MARKET_MISMATCH",
];

export function computePropsCoverageDiagnostics(
  totalCohortRows: number,
  rows: readonly PropsPerformanceRow[],
  exclusions: readonly StarterPropExclusion[],
): PropsCoverageDiagnostics {
  const exclusionsByReason: Record<EvaluationExclusionReason, number> = {
    NO_VALID_PROJECTION: 0,
    MODEL_STATUS_NOT_PROJECTED: 0,
    POST_KICKOFF_ONLY_PROJECTION: 0,
    NO_VALID_COMPARISON_LINE: 0,
    GAME_NOT_FINAL: 0,
    ACTUAL_UNRESOLVED: 0,
    MARKET_MISMATCH: 0,
  };
  for (const exclusion of exclusions) exclusionsByReason[exclusion.reason] += 1;
  // Keep a stable, exhaustive key set even when a reason never occurred this run.
  for (const reason of EXCLUSION_REASONS) if (!(reason in exclusionsByReason)) exclusionsByReason[reason] = 0;

  return {
    total_cohort_rows: totalCohortRows,
    gradeable_rows: rows.length,
    excluded_rows: exclusions.length,
    exclusions_by_reason: exclusionsByReason,
  };
}
