/**
 * Focused recovery-pass tests for the NFL Performance Center (WU5).
 *
 * These render each tab component directly with an already-resolved artifact
 * state, so they assert presentation and zero-state handling only -- the
 * fetch layer is covered separately in useNflPerformanceData.test.ts.
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import NflPerformanceOverviewTab from "./NflPerformanceOverviewTab";
import NflPerformanceSidesTab from "./NflPerformanceSidesTab";
import NflPerformanceTotalsTab from "./NflPerformanceTotalsTab";
import NflPerformancePropsTab from "./NflPerformancePropsTab";
import NflPerformanceHealthTab from "./NflPerformanceHealthTab";
import type { NflPerformanceArtifactState } from "@/hooks/useNflPerformanceArtifact";
import type {
  NflPerformanceHealthArtifact,
  NflPerformanceOverviewArtifact,
  NflPropsPerformanceArtifact,
  NflSidesPerformanceArtifact,
  NflTotalsPerformanceArtifact,
  PropsPerformanceRow,
  SidesPerformanceRow,
  TotalsPerformanceRow,
} from "@/types/nfl/performance";

function loaded<T>(data: T): NflPerformanceArtifactState<T> {
  return { loading: false, error: null, data };
}

const zeroOverview: NflPerformanceOverviewArtifact = {
  schemaVersion: "nfl-performance-overview-v1",
  performanceMeta: { schemaVersion: "nfl-performance-overview-v1", generatedAt: "2026-09-05T12:00:00.000Z", season: 2026 },
  totals: { status: "AVAILABLE", graded_games: 0, mae: null, bias: null, directional_hit_rate: null, latest_grade_timestamp: null },
  props: {
    status: "AVAILABLE",
    graded_props: 0,
    directional_hit_rate: null,
    mae: null,
    passing_n: 0,
    rushing_n: 0,
    receiving_n: 0,
    latest_grade_timestamp: null,
  },
  sides: {
    status: "AVAILABLE",
    graded_games: 0,
    spread_mae: null,
    bias: null,
    correlation: null,
    ats_directional_hit_rate: null,
    average_abs_jkb_market_difference: null,
    market_direction_metric: { comparable_n: 0, jkb_mae: null, market_mae: null, jkb_minus_market_mae: null },
    winner_accuracy: null,
    latest_grade_timestamp: null,
  },
};

const zeroSides: NflSidesPerformanceArtifact = {
  schemaVersion: "nfl-sides-performance-v1",
  performanceMeta: {
    schemaVersion: "nfl-sides-performance-v1",
    generatedAt: "2026-09-05T12:00:00.000Z",
    seasons: [2026],
    modelVersions: ["jkb-power-number-v1.0.0"],
    liveModelVersion: "jkb-power-number-v1.0.0",
    gradedGames: 0,
    latestPredictionTimestamp: "2026-09-04T16:17:22.667Z",
    latestOutcomeTimestamp: null,
    marketCoverageCount: 0,
    contextCoverage: { trenches: 0, ypp: 0, epa: 0, coaching: 0 },
  },
  summary: {
    graded_games: 0,
    margin_mae: null,
    margin_rmse: null,
    margin_median_absolute_error: null,
    mean_signed_error: null,
    correlation_projected_actual_margin: null,
    directional_wins: 0,
    directional_losses: 0,
    directional_pushes: 0,
    directional_neutral: 0,
    ats_directional_hit_rate: null,
    average_abs_jkb_market_difference: null,
    winner_accuracy: { correct: 0, total: 0, accuracy: null },
    market_comparison: { comparable_n: 0, jkb_mae: null, market_mae: null, jkb_minus_market_mae: null },
  },
  buckets: {
    by_week: [],
    by_jkb_market_difference_bucket: [],
    by_market_spread_bucket: [],
    by_favorite_underdog: [],
    by_jkb_ats_side: [],
  },
  rows: [],
  exclusions: { missing: 0, model_version_mismatch: 0, not_resolved: 272 },
};

const sidesRow: SidesPerformanceRow = {
  season: 2026,
  week: 1,
  game_id: "2026_01_AAA_BBB",
  kickoff_time: "2026-09-07T17:00:00.000Z",
  away_team: "aaa",
  home_team: "bbb",
  projected_home_margin: 6,
  projected_spread_line: -6,
  projected_spread_team: "bbb",
  home_power_number: 5.8,
  away_power_number: 4.3,
  home_field_adjustment: 2,
  model_version: "jkb-power-number-v1.0.0",
  fitted_model_hash: null,
  prediction_timestamp: "2026-09-04T16:17:22.667Z",
  market_spread: -3,
  market_implied_home_margin: 3,
  market_team_orientation: "home_line",
  market_provider: "the-odds-api/draftkings",
  market_snapshot_timestamp: "2026-09-04T12:00:00.000Z",
  market_snapshot_ref: "hash-dk-0123456789",
  market_observation_id: "obs-dk",
  jkb_minus_market: 3,
  actual_home_points: 27,
  actual_away_points: 17,
  actual_margin: 10,
  game_completion_status: "final",
  resolution_status: "resolved",
  signed_margin_error: -4,
  absolute_margin_error: 4,
  squared_margin_error: 16,
  jkb_ats_side: "home",
  jkb_supports_team: "bbb",
  projected_winner: "home",
  actual_winner: "home",
  projected_winner_correct: true,
  ats_result: "WIN",
  jkb_market_difference_bucket: "3-4",
  market_spread_bucket: "3-7",
  favorite_underdog: "favorite",
  context: {
    epa: {
      metric: "off.epaPerPlay",
      window: "prior-season-full",
      home_epa_value: null,
      away_epa_value: null,
      epa_advantage_team: null,
      epa_differential: null,
      source_season: null,
      source_timestamp: null,
      provenance_status: "unavailable",
    },
    ypp: {
      metric: "off.yardsPerPlay",
      window: "prior-season-full",
      home_ypp: null,
      away_ypp: null,
      ypp_advantage_team: null,
      ypp_differential: null,
      source_season: null,
      source_timestamp: null,
      provenance_status: "unavailable",
    },
    trenches: {
      metric: "espn_trench_composite",
      window: "prior_season_through_week_18",
      home_trenches_value: null,
      away_trenches_value: null,
      trenches_advantage_team: null,
      trenches_differential: null,
      source_season: null,
      source_timestamp: null,
      provenance_status: "unavailable",
    },
    coaching: {
      home_coaching_rating: null,
      away_coaching_rating: null,
      coaching_advantage_team: null,
      coaching_differential: null,
      coaching_context_status: "NOT_IMPLEMENTED",
    },
  },
  provenance: {
    prediction_id_ref: "pred-1",
    market_snapshot_ref: "hash-dk-0123456789",
    market_observation_id: "obs-dk",
    outcome_source_state_hash: "state-hash-0123456789",
  },
};

const sidesWithRow: NflSidesPerformanceArtifact = {
  ...zeroSides,
  performanceMeta: { ...zeroSides.performanceMeta, gradedGames: 1, latestOutcomeTimestamp: "2026-09-08T03:00:00.000Z", marketCoverageCount: 1 },
  summary: {
    ...zeroSides.summary,
    graded_games: 1,
    margin_mae: 4,
    margin_rmse: 4,
    margin_median_absolute_error: 4,
    mean_signed_error: -4,
    directional_wins: 1,
    ats_directional_hit_rate: 1,
    average_abs_jkb_market_difference: 3,
    winner_accuracy: { correct: 1, total: 1, accuracy: 1 },
    market_comparison: { comparable_n: 1, jkb_mae: 4, market_mae: 7, jkb_minus_market_mae: -3 },
  },
  rows: [sidesRow],
  exclusions: { missing: 0, model_version_mismatch: 0, not_resolved: 0 },
};

const totalsRow: TotalsPerformanceRow = {
  season: 2026,
  week: 1,
  game_id: "2026_01_AAA_BBB",
  kickoff_time: "2026-09-07T17:00:00.000Z",
  away_team: "aaa",
  home_team: "bbb",
  away_expected_points: 21.4,
  home_expected_points: 24.1,
  projected_game_total: 45.5,
  model_version: "jkb-nfl-total-ridge-v1.0.0",
  fitted_model_hash: "7e35e3fe3e188932e1b147bd2a639ac5d55fb0a11833f33c91a8012c97ac5602",
  prediction_timestamp: "2026-09-04T17:58:46.030Z",
  actual_away_points: 20,
  actual_home_points: 27,
  actual_game_total: 47,
  game_completion_status: "final",
  resolution_status: "resolved",
  signed_total_error: -1.5,
  absolute_total_error: 1.5,
  squared_total_error: 2.25,
  away_team_signed_error: 1.4,
  home_team_signed_error: -2.9,
  away_team_absolute_error: 1.4,
  home_team_absolute_error: 2.9,
  market_total: 44.5,
  market_timestamp: "2026-09-04T12:00:00.000Z",
  market_provider: "consensus",
  market_snapshot_ref: null,
  jkb_minus_market: 1,
  jkb_market_direction: "JKB_OVER",
  market_outcome: "OVER",
  directional_result: "WIN",
  projected_total_bucket: "44-48",
  jkb_market_difference_bucket: "0-2",
  context: {
    epa: {
      metric: "off.epaPerPlay",
      window: "prior-season-full",
      home_epa_value: null,
      away_epa_value: null,
      epa_advantage_team: null,
      epa_differential: null,
      source_season: null,
      source_timestamp: null,
      provenance_status: "unavailable",
    },
    ypp: {
      metric: "off.yardsPerPlay",
      window: "prior-season-full",
      home_ypp: null,
      away_ypp: null,
      ypp_advantage_team: null,
      ypp_differential: null,
      source_season: null,
      source_timestamp: null,
      provenance_status: "unavailable",
    },
    trenches: {
      metric: "espn_trench_composite",
      window: "prior_season_through_week_18",
      home_trenches_value: null,
      away_trenches_value: null,
      trenches_advantage_team: null,
      trenches_differential: null,
      source_season: null,
      source_timestamp: null,
      provenance_status: "unavailable",
    },
    coaching: {
      home_coaching_rating: null,
      away_coaching_rating: null,
      coaching_advantage_team: null,
      coaching_differential: null,
      coaching_context_status: "NOT_IMPLEMENTED",
    },
  },
  provenance: { home_prediction_id_ref: "pred-home-1", away_prediction_id_ref: "pred-away-1" },
};

const totalsWithRow: NflTotalsPerformanceArtifact = {
  schemaVersion: "nfl-totals-performance-v1",
  performanceMeta: {
    schemaVersion: "nfl-totals-performance-v1",
    generatedAt: "2026-09-05T12:00:00.000Z",
    seasons: [2026],
    modelVersions: ["jkb-nfl-total-ridge-v1.0.0"],
    gradedGames: 1,
    latestPredictionTimestamp: "2026-09-04T17:58:46.030Z",
    latestOutcomeTimestamp: "2026-09-08T03:00:00.000Z",
    marketCoverageCount: 1,
    contextCoverage: { trenches: 0, ypp: 0, epa: 0, coaching: 0 },
  },
  summary: {
    graded_games: 1,
    game_total_mae: 1.5,
    game_total_rmse: 1.5,
    game_total_median_absolute_error: 1.5,
    mean_signed_error: -1.5,
    correlation_projected_actual: null,
    team_score_mae: 2.15,
    team_score_rmse: 2.3,
    directional_wins: 1,
    directional_losses: 0,
    directional_pushes: 0,
    directional_neutral: 0,
    directional_hit_rate: 1,
    average_abs_jkb_market_difference: 1,
  },
  buckets: { by_week: [], by_projected_total_bucket: [], by_jkb_market_difference_bucket: [] },
  rows: [totalsRow],
  exclusions: { missing_home: 0, missing_away: 0, model_version_mismatch: 0, fitted_hash_mismatch: 0, not_resolved: 0 },
};

const propsRow: PropsPerformanceRow = {
  evaluation_row_id: "eval-1",
  season: 2026,
  week: 1,
  game_id: "2026_01_AAA_BBB",
  player_id: "player-1",
  player: "Test Quarterback",
  position: "QB",
  team: "aaa",
  opponent: "bbb",
  market: "passing_yards",
  line: 245.5,
  jkb_projection: 262.0,
  difference: 16.5,
  actual: 271,
  direction: "OVER",
  result: "WIN",
  absolute_error: 9,
  starter_basis: "depth_chart",
  model_version: "jkb-nfl-passing-v1.0.0",
  detail: {
    kickoff_time: "2026-09-07T17:00:00.000Z",
    home_away: "away",
    starter_rank: 1,
    starter_metric: "dropbacks",
    starter_metric_value: 38,
    prediction_id: "pred-p-1",
    prediction_timestamp: "2026-09-04T17:58:46.741Z",
    prediction_type: "passing_yards",
    fitted_model_hash: "abcdef1234567890",
    projection_status: "PROJECTED",
    market_provider: "consensus",
    market_book: "consensus",
    market_snapshot_timestamp: "2026-09-04T12:00:00.000Z",
    market_snapshot_ref: null,
    over_price: -110,
    under_price: -110,
    market_outcome: "OVER",
    game_completion_status: "final",
    resolution_status: "resolved",
    signed_projection_error: -9,
    squared_projection_error: 81,
    generated_at: "2026-09-08T03:00:00.000Z",
    outcome_id: "outcome-1",
    outcome_revision: 1,
    resolver_version: "v1",
    outcome_source_state_hash: "hash",
    feature_payload_hash: "hash",
    context: {},
  },
};

const propsWithRow: NflPropsPerformanceArtifact = {
  schemaVersion: "nfl-props-performance-v1",
  performanceMeta: {
    schemaVersion: "nfl-props-performance-v1",
    generatedAt: "2026-09-05T12:00:00.000Z",
    seasons: [2026],
    modelVersions: ["jkb-nfl-passing-v1.0.0"],
    gradedStarterProps: 1,
    latestPredictionTimestamp: "2026-09-04T17:58:46.741Z",
  },
  summary: {
    graded_starter_props: 1,
    passing_n: 1,
    rushing_n: 0,
    receiving_n: 0,
    wins: 1,
    losses: 0,
    pushes: 0,
    neutral: 0,
    directional_hit_rate: 1,
    over_wins: 1,
    over_losses: 0,
    over_hit_rate: 1,
    under_wins: 0,
    under_losses: 0,
    under_hit_rate: null,
    projection_mae: 9,
    projection_rmse: 9,
    median_absolute_error: 9,
    mean_signed_projection_error: -9,
    average_abs_jkb_line_difference: 16.5,
  },
  buckets: {
    by_week: [],
    by_market: [],
    by_position: [],
    by_direction: [],
    by_starter_basis: [],
    by_jkb_line_difference_bucket: [],
  },
  coverage: { total_cohort_rows: 188, gradeable_rows: 1, excluded_rows: 187, exclusions_by_reason: {} },
  rows: [propsRow],
};

const degradedHealth: NflPerformanceHealthArtifact = {
  schemaVersion: "nfl-performance-health-v1",
  performanceMeta: { schemaVersion: "nfl-performance-health-v1", generatedAt: "2026-09-05T12:00:00.000Z", season: 2026 },
  totals: {
    status: "HEALTHY",
    latest_prediction_timestamp: "2026-09-04T17:58:46.030Z",
    latest_generation_timestamp: "2026-09-05T12:00:00.000Z",
    expected_games: 0,
    archived_games: 16,
    missing_team_total_rows: 0,
    duplicate_prediction_ids: 0,
    unresolved_completed_games: 0,
    model_versions_seen: ["jkb-nfl-total-ridge-v1.0.0"],
    fitted_hashes_seen: ["7e35e3fe"],
    public_artifact_age_ms: 0,
  },
  props: {
    status: "DEGRADED",
    latest_passing_prediction_timestamp: "2026-09-04T17:58:46.741Z",
    latest_rushing_prediction_timestamp: "2026-09-04T17:58:46.741Z",
    latest_receiving_prediction_timestamp: "2026-09-04T17:58:46.741Z",
    starter_cohort_row_count: 188,
    expected_starter_slot_count: 192,
    missing_starter_slots: 4,
    starter_prop_evaluation_row_count: 0,
    unresolved_final_games: 0,
    missing_comparison_line_count: 116,
    player_outcome_backlog: 72,
    model_versions_seen: [],
    fitted_hashes_seen: [],
    public_artifact_age_ms: 0,
  },
  sides: {
    status: "HEALTHY",
    latest_spread_prediction_timestamp: "2026-09-04T16:17:22.667Z",
    latest_spread_evaluation_timestamp: "2026-09-05T09:32:43.533Z",
    latest_sides_artifact_generation_timestamp: "2026-09-05T12:00:00.000Z",
    model_versions_seen: ["jkb-power-number-v1.0.0"],
    unresolved_final_games: 0,
    sides_artifact_graded_games: 0,
    sides_artifact_age_ms: 1000,
    public_performance_view_status: "HEALTHY",
  },
  workflow: { generated_at_by_artifact: {} },
};

describe("NflPerformanceOverviewTab", () => {
  it("shows 'No graded results yet' for every family when nothing is graded", () => {
    render(<MemoryRouter><NflPerformanceOverviewTab state={loaded(zeroOverview)} /></MemoryRouter>);
    expect(screen.getAllByText("No graded results yet")).toHaveLength(3);
  });
});

describe("NflPerformanceSidesTab", () => {
  it("renders the zero-state and the sign-convention note when no sides are graded", () => {
    render(<MemoryRouter><NflPerformanceSidesTab state={loaded(zeroSides)} /></MemoryRouter>);
    expect(screen.getByText("No graded results yet")).toBeInTheDocument();
    expect(screen.getByTestId("nfl-sides-artifact-note")).toHaveTextContent(/home margin/i);
  });

  it("renders a graded fixture row, the KPI strip, and toggles the detail drawer", () => {
    render(<MemoryRouter><NflPerformanceSidesTab state={loaded(sidesWithRow)} /></MemoryRouter>);
    expect(screen.getByText("ATS Directional Hit Rate")).toBeInTheDocument();
    const list = screen.getByTestId("nfl-sides-mobile-list");
    const expander = within(list).getByRole("button");
    expect(expander).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expander);
    expect(expander).toHaveAttribute("aria-expanded", "true");
    expect(within(list).getByText("Coaching rating")).toBeInTheDocument();
  });

  it("filters rows by ATS result", () => {
    render(<MemoryRouter><NflPerformanceSidesTab state={loaded(sidesWithRow)} /></MemoryRouter>);
    expect(screen.getByTestId("nfl-sides-mobile-list")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /LOSS/ }));
    expect(screen.getByText(/No games match the current filters\./)).toBeInTheDocument();
  });
});

describe("NflPerformanceTotalsTab", () => {
  it("renders a graded fixture row and toggles aria-expanded on the row expander", () => {
    render(<MemoryRouter><NflPerformanceTotalsTab state={loaded(totalsWithRow)} /></MemoryRouter>);
    const list = screen.getByTestId("nfl-totals-mobile-list");
    const expander = within(list).getByRole("button");
    expect(expander).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expander);
    expect(within(list).getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(within(list).getByText(/AAA/)).toBeInTheDocument();
  });
});

describe("NflPerformancePropsTab", () => {
  it("labels the section 'Starter Props' and renders a graded fixture row", () => {
    render(<MemoryRouter><NflPerformancePropsTab state={loaded(propsWithRow)} /></MemoryRouter>);
    expect(screen.getByText("Starter Props")).toBeInTheDocument();
    const list = screen.getByTestId("nfl-props-mobile-list");
    expect(within(list).getByText("Test Quarterback")).toBeInTheDocument();
    const expander = within(list).getByRole("button");
    expect(expander).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expander);
    expect(within(list).getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });
});

describe("NflPerformanceHealthTab", () => {
  it("surfaces the 188 / 192 starter-coverage gap as an evidence-availability message", () => {
    render(<MemoryRouter><NflPerformanceHealthTab state={loaded(degradedHealth)} /></MemoryRouter>);
    const note = screen.getByTestId("nfl-health-props-coverage-note");
    expect(note).toHaveTextContent(/188/);
    expect(note).toHaveTextContent(/192/);
    expect(note).toHaveTextContent(/unavailable from valid pregame projection evidence/i);
  });
});
