/**
 * Frontend-facing types for the NFL Performance Center
 * (public/data/nfl/performance/{overview,totals,props,health}.json).
 *
 * These mirror the canonical shapes produced by scripts/lib/nfl-performance-*.ts
 * and scripts/lib/nfl-{totals,props}-performance.ts. They are intentionally
 * redeclared here (rather than imported from scripts/lib, which is outside the
 * Vite app's compiled surface) so the UI has an explicit, stable contract for
 * what it reads. Do not add fields here that the generators do not produce.
 */

export type TeamAdvantage = "home" | "away" | "even";

export type EpaContext = {
  metric: "off.epaPerPlay";
  window: "prior-season-full";
  home_epa_value: number | null;
  away_epa_value: number | null;
  epa_advantage_team: TeamAdvantage | null;
  epa_differential: number | null;
  source_season: number | null;
  source_timestamp: string | null;
  provenance_status: "available" | "unavailable";
};

export type YppContext = {
  metric: "off.yardsPerPlay";
  window: "prior-season-full";
  home_ypp: number | null;
  away_ypp: number | null;
  ypp_advantage_team: TeamAdvantage | null;
  ypp_differential: number | null;
  source_season: number | null;
  source_timestamp: string | null;
  provenance_status: "available" | "unavailable";
};

export type TrenchesComponents = {
  off_pass_block_win_rate: number | null;
  off_run_block_win_rate: number | null;
  def_pass_rush_win_rate: number | null;
  def_run_stop_win_rate: number | null;
};

export type TrenchesContext = {
  metric: "espn_trench_composite";
  window: "prior_season_through_week_18";
  home_trenches_value: TrenchesComponents | null;
  away_trenches_value: TrenchesComponents | null;
  trenches_advantage_team: TeamAdvantage | null;
  trenches_differential: number | null;
  source_season: number | null;
  source_timestamp: string | null;
  provenance_status: "available" | "unavailable";
};

export type CoachingContext = {
  home_coaching_rating: null;
  away_coaching_rating: null;
  coaching_advantage_team: null;
  coaching_differential: null;
  coaching_context_status: "NOT_IMPLEMENTED";
};

export type PregameGameContext = {
  epa: EpaContext;
  ypp: YppContext;
  trenches: TrenchesContext;
  coaching: CoachingContext;
};

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type NflPerformanceFamilyStatus = "AVAILABLE" | "NOT_AVAILABLE" | "NOT_IMPLEMENTED";

export type NflOverviewTotals = {
  status: NflPerformanceFamilyStatus;
  graded_games: number;
  mae: number | null;
  bias: number | null;
  directional_hit_rate: number | null;
  latest_grade_timestamp: string | null;
};

export type NflOverviewProps = {
  status: NflPerformanceFamilyStatus;
  graded_props: number;
  directional_hit_rate: number | null;
  mae: number | null;
  passing_n: number;
  rushing_n: number;
  receiving_n: number;
  latest_grade_timestamp: string | null;
};

export type NflOverviewSides = {
  status: NflPerformanceFamilyStatus;
  graded_games: number;
  spread_mae: number | null;
  market_direction_metric: {
    comparable_n: number;
    jkb_mae: number | null;
    market_mae: number | null;
    jkb_minus_market_mae: number | null;
  };
  winner_accuracy: number | null;
  latest_grade_timestamp: string | null;
  note?: string;
};

export type NflPerformanceOverviewArtifact = {
  schemaVersion: string;
  performanceMeta: { schemaVersion: string; generatedAt: string; season: number };
  totals: NflOverviewTotals;
  props: NflOverviewProps;
  sides: NflOverviewSides;
};

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type MarketDirection = "JKB_OVER" | "JKB_UNDER" | "NEUTRAL";
export type MarketOutcomeLabel = "OVER" | "UNDER" | "PUSH";
export type DirectionalResult = "WIN" | "LOSS" | "PUSH" | "NEUTRAL";

export type TotalsPerformanceRow = {
  season: number;
  week: number;
  game_id: string;
  kickoff_time: string;
  away_team: string;
  home_team: string;
  away_expected_points: number;
  home_expected_points: number;
  projected_game_total: number;
  model_version: string;
  fitted_model_hash: string;
  prediction_timestamp: string;
  actual_away_points: number;
  actual_home_points: number;
  actual_game_total: number;
  game_completion_status: "final" | "not_final" | "missing";
  resolution_status: string;
  signed_total_error: number;
  absolute_total_error: number;
  squared_total_error: number;
  away_team_signed_error: number;
  home_team_signed_error: number;
  away_team_absolute_error: number;
  home_team_absolute_error: number;
  market_total: number | null;
  market_timestamp: string | null;
  market_provider: string | null;
  market_snapshot_ref: string | null;
  jkb_minus_market: number | null;
  jkb_market_direction: MarketDirection | null;
  market_outcome: MarketOutcomeLabel | null;
  directional_result: DirectionalResult | null;
  projected_total_bucket: string | null;
  jkb_market_difference_bucket: string | null;
  context: PregameGameContext;
  provenance: {
    home_prediction_id_ref: string;
    away_prediction_id_ref: string;
  };
};

export type TotalsSummaryMetrics = {
  graded_games: number;
  game_total_mae: number | null;
  game_total_rmse: number | null;
  game_total_median_absolute_error: number | null;
  mean_signed_error: number | null;
  correlation_projected_actual: number | null;
  team_score_mae: number | null;
  team_score_rmse: number | null;
  directional_wins: number;
  directional_losses: number;
  directional_pushes: number;
  directional_neutral: number;
  directional_hit_rate: number | null;
  average_abs_jkb_market_difference: number | null;
};

export type BucketRollup = {
  key: string;
  n: number;
  mae: number | null;
  bias: number | null;
  directional_wins: number;
  directional_losses: number;
  directional_pushes: number;
  hit_rate: number | null;
};

export type NflTotalsPerformanceArtifact = {
  schemaVersion: string;
  performanceMeta: {
    schemaVersion: string;
    generatedAt: string;
    seasons: number[];
    modelVersions: string[];
    gradedGames: number;
    latestPredictionTimestamp: string | null;
    latestOutcomeTimestamp: string | null;
    marketCoverageCount: number;
    contextCoverage: { trenches: number; ypp: number; epa: number; coaching: number };
  };
  summary: TotalsSummaryMetrics;
  buckets: {
    by_week: BucketRollup[];
    by_projected_total_bucket: BucketRollup[];
    by_jkb_market_difference_bucket: BucketRollup[];
  };
  rows: TotalsPerformanceRow[];
  exclusions: {
    missing_home: number;
    missing_away: number;
    model_version_mismatch: number;
    fitted_hash_mismatch: number;
    not_resolved: number;
  };
};

// ---------------------------------------------------------------------------
// Starter Props
// ---------------------------------------------------------------------------

export type StarterPropMarket = "passing_yards" | "rushing_yards" | "receiving_yards";
export type StarterPropDirection = "OVER" | "UNDER" | "NEUTRAL";
export type StarterPropMarketOutcome = "OVER" | "UNDER" | "PUSH";
export type StarterPropDirectionalResult = "WIN" | "LOSS" | "PUSH" | "NEUTRAL";
export type StarterPosition = "QB" | "RB" | "WR" | "TE";
export type StarterBasis = string;

export type PropsPerformanceRow = {
  evaluation_row_id: string;
  season: number;
  week: number;
  game_id: string;
  player_id: string;
  player: string | null;
  position: StarterPosition;
  team: string;
  opponent: string;
  market: StarterPropMarket;
  line: number;
  jkb_projection: number;
  difference: number;
  actual: number;
  direction: StarterPropDirection;
  result: StarterPropDirectionalResult;
  absolute_error: number;
  starter_basis: StarterBasis;
  model_version: string;
  detail: {
    kickoff_time: string;
    home_away: "home" | "away";
    starter_rank: number;
    starter_metric: string;
    starter_metric_value: number;
    prediction_id: string;
    prediction_timestamp: string;
    prediction_type: string;
    fitted_model_hash: string | null;
    projection_status: string;
    market_provider: string;
    market_book: string;
    market_snapshot_timestamp: string;
    market_snapshot_ref: string | null;
    over_price: number | null;
    under_price: number | null;
    market_outcome: StarterPropMarketOutcome;
    game_completion_status: string;
    resolution_status: string;
    signed_projection_error: number;
    squared_projection_error: number;
    generated_at: string;
    outcome_id: string;
    outcome_revision: number;
    resolver_version: string;
    outcome_source_state_hash: string;
    feature_payload_hash: string;
    context: Record<string, unknown>;
  };
};

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

export type PropsBucketRollup = {
  key: string;
  n: number;
  mae: number | null;
  bias: number | null;
  hit_rate: number | null;
};

export type NflPropsPerformanceArtifact = {
  schemaVersion: string;
  performanceMeta: {
    schemaVersion: string;
    generatedAt: string;
    seasons: number[];
    modelVersions: string[];
    gradedStarterProps: number;
    latestPredictionTimestamp: string | null;
  };
  summary: PropsSummaryMetrics;
  buckets: {
    by_week: PropsBucketRollup[];
    by_market: PropsBucketRollup[];
    by_position: PropsBucketRollup[];
    by_direction: PropsBucketRollup[];
    by_starter_basis: PropsBucketRollup[];
    by_jkb_line_difference_bucket: PropsBucketRollup[];
  };
  coverage: {
    total_cohort_rows: number;
    gradeable_rows: number;
    excluded_rows: number;
    exclusions_by_reason: Record<string, number>;
  };
  rows: PropsPerformanceRow[];
};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export type NflHealthStatus = "HEALTHY" | "DEGRADED" | "STALE" | "NOT_AVAILABLE" | "NOT_IMPLEMENTED";

export type NflTotalsHealth = {
  status: NflHealthStatus;
  latest_prediction_timestamp: string | null;
  latest_generation_timestamp: string | null;
  expected_games: number;
  archived_games: number;
  missing_team_total_rows: number;
  duplicate_prediction_ids: number;
  unresolved_completed_games: number;
  model_versions_seen: string[];
  fitted_hashes_seen: string[];
  public_artifact_age_ms: number;
};

export type NflPropsHealth = {
  status: NflHealthStatus;
  latest_passing_prediction_timestamp: string | null;
  latest_rushing_prediction_timestamp: string | null;
  latest_receiving_prediction_timestamp: string | null;
  starter_cohort_row_count: number;
  expected_starter_slot_count: number;
  missing_starter_slots: number;
  starter_prop_evaluation_row_count: number;
  unresolved_final_games: number;
  missing_comparison_line_count: number;
  player_outcome_backlog: number;
  model_versions_seen: string[];
  fitted_hashes_seen: string[];
  public_artifact_age_ms: number;
};

export type NflSidesHealth = {
  status: NflHealthStatus;
  latest_spread_prediction_timestamp: string | null;
  latest_spread_evaluation_timestamp: string | null;
  model_versions_seen: string[];
  unresolved_final_games: number;
  public_performance_view_status: NflHealthStatus;
};

export type NflPerformanceHealthArtifact = {
  schemaVersion: string;
  performanceMeta: { schemaVersion: string; generatedAt: string; season: number };
  totals: NflTotalsHealth;
  props: NflPropsHealth;
  sides: NflSidesHealth;
  workflow: { generated_at_by_artifact: Record<string, string> };
};
