/**
 * Coaching Rating v1 in the Performance Center surfaces: the Sides detail
 * drawer, the Totals detail drawer and the Model Health tab.
 *
 * The Totals assertions deliberately include negative ones -- coaching must
 * never be rendered as an Over/Under lean, because the rating is not an input
 * to the totals model and says nothing about scoring.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import NflPerformanceSidesDetail from "./NflPerformanceSidesDetail";
import NflPerformanceTotalsDetail from "./NflPerformanceTotalsDetail";
import NflPerformanceHealthTab from "./NflPerformanceHealthTab";
import {
  coachingContextFixture,
  coachingUnavailableFixture,
} from "@/lib/nfl/performance/__fixtures__/coaching";
import type { NflPerformanceArtifactState } from "@/hooks/useNflPerformanceArtifact";
import type {
  CoachingContext,
  NflCoachingHealth,
  NflPerformanceHealthArtifact,
  PregameGameContext,
  SidesPerformanceRow,
  TotalsPerformanceRow,
} from "@/types/nfl/performance";

function pregameContext(coaching: CoachingContext): PregameGameContext {
  return {
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
    coaching,
  };
}

function sidesRow(coaching: CoachingContext): SidesPerformanceRow {
  return {
    season: 2026,
    week: 1,
    game_id: "2026_01_SF_LAR",
    kickoff_time: "2026-09-07T17:00:00.000Z",
    away_team: "sf",
    home_team: "lar",
    projected_home_margin: 6,
    projected_spread_line: -6,
    projected_spread_team: "lar",
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
    jkb_supports_team: "lar",
    projected_winner: "home",
    actual_winner: "home",
    projected_winner_correct: true,
    ats_result: "WIN",
    jkb_market_difference_bucket: "3-4",
    market_spread_bucket: "3-7",
    favorite_underdog: "favorite",
    context: pregameContext(coaching),
    provenance: {
      prediction_id_ref: "pred-1",
      market_snapshot_ref: "hash-dk-0123456789",
      market_observation_id: "obs-dk",
      outcome_source_state_hash: "state-hash-0123456789",
    },
  };
}

function totalsRow(coaching: CoachingContext): TotalsPerformanceRow {
  return {
    season: 2026,
    week: 1,
    game_id: "2026_01_SF_LAR",
    kickoff_time: "2026-09-07T17:00:00.000Z",
    away_team: "sf",
    home_team: "lar",
    away_expected_points: 21.4,
    home_expected_points: 24.1,
    projected_game_total: 45.5,
    model_version: "jkb-nfl-total-ridge-v1.0.0",
    fitted_model_hash: "7e35e3fe3e188932",
    prediction_timestamp: "2026-09-04T17:58:46.030Z",
    actual_away_points: 20,
    actual_home_points: 27,
    actual_game_total: 47,
    signed_total_error: -1.5,
    absolute_total_error: 1.5,
    squared_total_error: 2.25,
    market_total: 44.5,
    market_provider: "nflverse",
    market_timestamp: "2026-09-04T12:00:00.000Z",
    jkb_minus_market: 1,
    context: pregameContext(coaching),
    provenance: { home_prediction_id_ref: "pred-home-1", away_prediction_id_ref: "pred-away-1" },
  } as TotalsPerformanceRow;
}

const coachingHealth: NflCoachingHealth = {
  status: "HEALTHY",
  rating_version: "coaching-v1.0.0",
  artifact_generated_at: "2026-09-06T15:38:21.304Z",
  source_cutoff: "completed games through 2025 season",
  current_coach_count: 32,
  unrated_coach_count: 0,
  small_sample_coach_count: 11,
  first_year_count: 4,
  historical_snapshot_coverage: 215,
  latest_snapshot_season: 2025,
  latest_snapshot_week: 22,
  stale_after_hours: 36,
  public_artifact_age_ms: 8_498_696,
};

function healthArtifact(coaching?: NflCoachingHealth): NflPerformanceHealthArtifact {
  return {
    schemaVersion: "nfl-performance-health-v1",
    performanceMeta: { schemaVersion: "nfl-performance-health-v1", generatedAt: "2026-09-06T15:38:21.304Z", season: 2026 },
    totals: {
      status: "HEALTHY",
      latest_prediction_timestamp: null,
      latest_generation_timestamp: null,
      expected_games: 0,
      archived_games: 0,
      missing_team_total_rows: 0,
      duplicate_prediction_ids: 0,
      unresolved_completed_games: 0,
      model_versions_seen: [],
      fitted_hashes_seen: [],
      public_artifact_age_ms: 0,
    },
    props: {
      status: "HEALTHY",
      latest_passing_prediction_timestamp: null,
      latest_rushing_prediction_timestamp: null,
      latest_receiving_prediction_timestamp: null,
      starter_cohort_row_count: 0,
      expected_starter_slot_count: 0,
      missing_starter_slots: 0,
      starter_prop_evaluation_row_count: 0,
      unresolved_final_games: 0,
      missing_comparison_line_count: 0,
      player_outcome_backlog: 0,
      model_versions_seen: [],
      fitted_hashes_seen: [],
      public_artifact_age_ms: 0,
    },
    sides: {
      status: "HEALTHY",
      latest_spread_prediction_timestamp: null,
      latest_spread_evaluation_timestamp: null,
      latest_sides_artifact_generation_timestamp: null,
      model_versions_seen: [],
      unresolved_final_games: 0,
      sides_artifact_graded_games: 0,
      sides_artifact_age_ms: 0,
      public_performance_view_status: "HEALTHY",
    },
    coaching,
    workflow: { generated_at_by_artifact: {} },
  };
}

function loaded<T>(data: T): NflPerformanceArtifactState<T> {
  return { loading: false, error: null, data };
}

describe("Sides detail -- coaching panel", () => {
  it("renders both coaches, their records and the advantage summary", () => {
    render(<NflPerformanceSidesDetail row={sidesRow(coachingContextFixture())} />);
    const panel = screen.getByTestId("nfl-sides-coaching-panel");
    expect(panel).toHaveTextContent("Coaching advantage");
    expect(panel).toHaveTextContent("HOME +8");
    expect(panel).toHaveTextContent("Sean McVay");
    expect(panel).toHaveTextContent("Kyle Shanahan");
    expect(panel).toHaveTextContent("102-63");
    expect(panel).toHaveTextContent("89-72-4");
    expect(screen.getByTestId("nfl-coaching-ats-note")).toBeInTheDocument();
  });

  it("shows the unavailable state instead of crashing when there is no coaching source", () => {
    render(<NflPerformanceSidesDetail row={sidesRow(coachingUnavailableFixture())} />);
    expect(screen.getByText("Coaching context unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("nfl-sides-coaching-panel")).toHaveTextContent("—");
  });
});

describe("Totals detail -- coaching block", () => {
  it("renders both coaches and a direction-free rating gap", () => {
    render(<NflPerformanceTotalsDetail row={totalsRow(coachingContextFixture())} />);
    const panel = screen.getByTestId("nfl-totals-coaching-panel");
    expect(panel).toHaveTextContent("Coaching context");
    expect(screen.getByTestId("nfl-totals-coaching-gap")).toHaveTextContent("Rating gap 8");
    expect(panel).toHaveTextContent("Sean McVay");
    expect(panel).toHaveTextContent("91-72");
  });

  it("marks a within-threshold gap as Even", () => {
    render(
      <NflPerformanceTotalsDetail
        row={totalsRow(
          coachingContextFixture({
            home_coaching_rating: 52,
            away_coaching_rating: 51,
            coaching_differential: 1,
            coaching_advantage_team: "even",
          }),
        )}
      />,
    );
    expect(screen.getByTestId("nfl-totals-coaching-gap")).toHaveTextContent("Rating gap 1 (Even)");
  });

  it("never implies an Over/Under direction from coaching", () => {
    render(<NflPerformanceTotalsDetail row={totalsRow(coachingContextFixture())} />);
    const panel = screen.getByTestId("nfl-totals-coaching-panel");
    expect(panel.textContent ?? "").not.toMatch(/over/i);
    expect(panel.textContent ?? "").not.toMatch(/under/i);
    expect(panel.textContent ?? "").not.toMatch(/lean/i);
  });
});

describe("Model health -- coaching section", () => {
  it("renders the healthy coaching block with counts, snapshots and freshness", () => {
    render(<NflPerformanceHealthTab state={loaded(healthArtifact(coachingHealth))} />);
    const section = screen.getByTestId("nfl-health-coaching");
    expect(section).toHaveTextContent("Coaching Rating");
    expect(section).toHaveTextContent("Healthy");
    expect(section).toHaveTextContent("coaching-v1.0.0");
    expect(section).toHaveTextContent("32");
    expect(section).toHaveTextContent("215");
    expect(section).toHaveTextContent("2025 week 22");
    expect(section).toHaveTextContent("stale after 36h");
  });

  it("does not degrade on small-sample or first-year coaches alone", () => {
    render(
      <NflPerformanceHealthTab
        state={loaded(healthArtifact({ ...coachingHealth, small_sample_coach_count: 20, first_year_count: 9 }))}
      />,
    );
    const section = screen.getByTestId("nfl-health-coaching");
    expect(section).toHaveTextContent("Healthy");
    expect(section).toHaveTextContent("not a failure");
  });

  it("shows STALE visibly, not by colour alone", () => {
    render(<NflPerformanceHealthTab state={loaded(healthArtifact({ ...coachingHealth, status: "STALE" }))} />);
    const section = screen.getByTestId("nfl-health-coaching");
    expect(section).toHaveTextContent("Stale");
    expect(screen.getByTestId("nfl-health-coaching-stale-note")).toBeInTheDocument();
  });

  it("shows NOT AVAILABLE when the health artifact carries no coaching block", () => {
    render(<NflPerformanceHealthTab state={loaded(healthArtifact(undefined))} />);
    const section = screen.getByTestId("nfl-health-coaching");
    expect(section).toHaveTextContent("Not available");
    expect(screen.getByTestId("nfl-health-coaching-missing")).toBeInTheDocument();
  });
});
