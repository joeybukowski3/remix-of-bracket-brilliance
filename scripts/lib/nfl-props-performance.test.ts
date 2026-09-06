import { describe, expect, it } from "vitest";
import {
  buildPropsPerformanceRow,
  computePropsBucketRollups,
  computePropsCoverageDiagnostics,
  computePropsSummaryMetrics,
} from "./nfl-props-performance";
import type { StarterPropEvaluationRowV1, StarterPropExclusion } from "./nfl-starter-prop-evaluation";

function row(overrides: Partial<StarterPropEvaluationRowV1> = {}): StarterPropEvaluationRowV1 {
  return {
    schema_version: "nfl-starter-prop-evaluation-v1",
    evaluation_row_id: "starterprop_1",
    season: 2026,
    week: 1,
    game_id: "2026_01_ATL_PIT",
    kickoff_time: "2026-09-13T17:00:00.000Z",
    team: "pit",
    opponent: "atl",
    home_away: "home",
    player_id: "gsis:00-0000001",
    player_name: "Test QB",
    position: "QB",
    market: "passing_yards",

    starter_basis: "QB1_BY_ARCHIVED_DEPTH_CHART",
    starter_rank: 1,
    starter_metric: "depth_rank",
    starter_metric_value: 1,
    starter_cohort_row_id: "starter_abc",
    eligibility_prediction_timestamp: "2026-09-03T17:05:21.000Z",
    eligibility_model_version: "nfl-passing-direct-ridge-v1",
    eligibility_prediction_id: "pred_eligibility",
    role_source_updated_at: "2026-09-03T11:53:47.000Z",

    jkb_projection: 230,
    prediction_id: "pred_1",
    prediction_timestamp: "2026-09-03T17:05:21.000Z",
    prediction_type: "passing",
    model_version: "nfl-passing-direct-ridge-v1",
    fitted_model_hash: "fitted-hash-1",
    projection_status: "projected",

    market_line: 220.5,
    market_provider: "the-odds-api",
    market_book: "fanduel",
    market_snapshot_timestamp: "2026-09-01T16:03:42.000Z",
    market_snapshot_ref: "yardage_abc",
    market_purpose: "comparison",
    over_price: -114,
    under_price: -114,

    actual: 250,
    game_completion_status: "final",
    resolution_status: "resolved",
    projection_difference: 9.5,
    direction: "OVER",
    market_outcome: "OVER",
    directional_result: "WIN",
    signed_projection_error: -20,
    absolute_projection_error: 20,
    squared_projection_error: 400,

    generated_at: "2026-09-15T00:00:00.000Z",
    outcome_id: "outcome_1",
    outcome_revision: 1,
    resolver_version: "nfl-prediction-outcome-resolver-v1",
    outcome_source_state_hash: "state-hash-1",
    feature_payload_hash: "feature-hash-1",

    context: { matchup_score: { score: 55 } },
    ...overrides,
  };
}

describe("buildPropsPerformanceRow", () => {
  it("maps every required visible-row field and preserves detail context verbatim", () => {
    const evalRow = row();
    const propsRow = buildPropsPerformanceRow(evalRow);
    expect(propsRow).toMatchObject({
      season: 2026,
      week: 1,
      game_id: "2026_01_ATL_PIT",
      player_id: "gsis:00-0000001",
      player: "Test QB",
      position: "QB",
      team: "pit",
      opponent: "atl",
      market: "passing_yards",
      line: 220.5,
      jkb_projection: 230,
      difference: 9.5,
      actual: 250,
      direction: "OVER",
      result: "WIN",
      absolute_error: 20,
      starter_basis: "QB1_BY_ARCHIVED_DEPTH_CHART",
      model_version: "nfl-passing-direct-ridge-v1",
    });
    expect(propsRow.detail.context).toEqual(evalRow.context);
    expect(propsRow.detail.feature_payload_hash).toBe("feature-hash-1");
    expect(propsRow.detail.outcome_id).toBe("outcome_1");
  });
});

describe("computePropsSummaryMetrics", () => {
  it("excludes pushes and neutral rows from the directional hit-rate denominator", () => {
    const rows = [
      buildPropsPerformanceRow(row({ evaluation_row_id: "r1", directional_result: "WIN", direction: "OVER" })),
      buildPropsPerformanceRow(row({ evaluation_row_id: "r2", directional_result: "LOSS", direction: "UNDER" })),
      buildPropsPerformanceRow(row({ evaluation_row_id: "r3", directional_result: "PUSH", direction: "OVER" })),
      buildPropsPerformanceRow(row({ evaluation_row_id: "r4", directional_result: "NEUTRAL", direction: "NEUTRAL" })),
    ];
    const summary = computePropsSummaryMetrics(rows);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.pushes).toBe(1);
    expect(summary.neutral).toBe(1);
    // hit rate denominator is wins+losses only (2), never pushes/neutral (would be 4 otherwise)
    expect(summary.directional_hit_rate).toBe(0.5);
  });

  it("splits over/under hit rates by direction and counts markets by market family (WR/TE share receiving_yards)", () => {
    const rows = [
      buildPropsPerformanceRow(row({ evaluation_row_id: "r1", direction: "OVER", directional_result: "WIN" })),
      buildPropsPerformanceRow(row({ evaluation_row_id: "r2", direction: "OVER", directional_result: "LOSS" })),
      buildPropsPerformanceRow(row({ evaluation_row_id: "r3", direction: "UNDER", directional_result: "WIN" })),
      buildPropsPerformanceRow(
        row({ evaluation_row_id: "r4", position: "WR", market: "receiving_yards", direction: "UNDER", directional_result: "LOSS" }),
      ),
      buildPropsPerformanceRow(
        row({ evaluation_row_id: "r5", position: "TE", market: "receiving_yards", direction: "OVER", directional_result: "WIN" }),
      ),
    ];
    const summary = computePropsSummaryMetrics(rows);
    expect(summary.over_wins).toBe(2);
    expect(summary.over_losses).toBe(1);
    expect(summary.over_hit_rate).toBeCloseTo(2 / 3);
    expect(summary.under_wins).toBe(1);
    expect(summary.under_losses).toBe(1);
    expect(summary.under_hit_rate).toBe(0.5);
    expect(summary.passing_n).toBe(3);
    expect(summary.receiving_n).toBe(2);
    expect(summary.rushing_n).toBe(0);
  });

  it("returns null hit rates and error stats when there are no rows", () => {
    const summary = computePropsSummaryMetrics([]);
    expect(summary.directional_hit_rate).toBeNull();
    expect(summary.over_hit_rate).toBeNull();
    expect(summary.under_hit_rate).toBeNull();
    expect(summary.projection_mae).toBeNull();
    expect(summary.projection_rmse).toBeNull();
    expect(summary.median_absolute_error).toBeNull();
    expect(summary.mean_signed_projection_error).toBeNull();
    expect(summary.average_abs_jkb_line_difference).toBeNull();
  });
});

describe("computePropsBucketRollups", () => {
  it("produces deterministic rollups keyed by week, market, position, direction, and starter_basis", () => {
    const rows = [
      buildPropsPerformanceRow(row({ evaluation_row_id: "r1", week: 1, directional_result: "WIN" })),
      buildPropsPerformanceRow(row({ evaluation_row_id: "r2", week: 2, directional_result: "LOSS" })),
    ];
    const buckets = computePropsBucketRollups(rows);
    expect(buckets.by_week.map((b) => b.key)).toEqual(["1", "2"]);
    expect(buckets.by_market.some((b) => b.key === "passing_yards")).toBe(true);
    expect(buckets.by_position.some((b) => b.key === "QB")).toBe(true);
    expect(buckets.by_direction.some((b) => b.key === "OVER")).toBe(true);
    expect(buckets.by_starter_basis.some((b) => b.key === "QB1_BY_ARCHIVED_DEPTH_CHART")).toBe(true);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const rows = [
      buildPropsPerformanceRow(row({ evaluation_row_id: "r1" })),
      buildPropsPerformanceRow(row({ evaluation_row_id: "r2", week: 2 })),
    ];
    expect(computePropsBucketRollups(rows)).toEqual(computePropsBucketRollups(rows));
  });
});

describe("computePropsCoverageDiagnostics", () => {
  function exclusion(overrides: Partial<StarterPropExclusion> = {}): StarterPropExclusion {
    return {
      season: 2026,
      week: 1,
      game_id: "2026_01_ATL_PIT",
      team: "pit",
      player_id: "gsis:00-0000002",
      player_name: null,
      position: "RB",
      market: "rushing_yards",
      starter_cohort_row_id: "starter_def",
      reason: "GAME_NOT_FINAL",
      detail: null,
      ...overrides,
    };
  }

  it("reports an exhaustive exclusion-by-reason breakdown even when a reason never occurred", () => {
    const diagnostics = computePropsCoverageDiagnostics(5, [], [exclusion(), exclusion({ reason: "ACTUAL_UNRESOLVED" })]);
    expect(diagnostics.total_cohort_rows).toBe(5);
    expect(diagnostics.gradeable_rows).toBe(0);
    expect(diagnostics.excluded_rows).toBe(2);
    expect(diagnostics.exclusions_by_reason.GAME_NOT_FINAL).toBe(1);
    expect(diagnostics.exclusions_by_reason.ACTUAL_UNRESOLVED).toBe(1);
    expect(diagnostics.exclusions_by_reason.NO_VALID_PROJECTION).toBe(0);
    expect(diagnostics.exclusions_by_reason.MARKET_MISMATCH).toBe(0);
  });
});
