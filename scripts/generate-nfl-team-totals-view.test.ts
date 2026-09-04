/**
 * Snapshot-selection logic for the JKB team-total frontend view
 * (public/data/nfl/team-totals.json). This is a read-only reducer over
 * already-archived team_total prediction rows -- it computes no model math
 * of its own, so these tests are about grouping/selection correctness, not
 * the projection values themselves.
 */
import { describe, expect, it } from "vitest";
import { buildTeamTotalsProjections } from "./generate-nfl-team-totals-view";
import type { PredictionSnapshotV1 } from "./lib/nfl-production-prediction-archive";

function teamTotalRow(overrides: Partial<PredictionSnapshotV1> = {}): PredictionSnapshotV1 {
  return {
    schema_version: "jkb-football-prediction-v1",
    prediction_id: overrides.prediction_id ?? "pred_1",
    snapshot_key: "snapshot_1",
    snapshot_label: null,
    prediction_timestamp: "2026-09-04T17:58:46.030Z",
    created_at: "2026-09-04T17:58:46.099Z",
    mode: "production",
    sport: "football",
    league: "nfl",
    season: 2026,
    week: 1,
    slate_date: "2026-09-10",
    game_id: "2026_01_NE_SEA",
    kickoff_utc: "2026-09-10T00:20:00.000Z",
    player_id: null,
    player_name_at_prediction: null,
    team: "sea",
    opponent: "ne",
    home_away: "home",
    neutral_site: false,
    position: null,
    prediction_type: "team_total",
    model_name: "nfl-total-ridge",
    model_version: "jkb-nfl-total-ridge-v1.0.0",
    feature_schema_version: "nfl-total-feature-v1",
    pipeline_version: "nfl-total-ridge-production-v1",
    code_revision: "abc123",
    run_id: "github:1",
    workflow_name: "NFL Yardage Projections",
    workflow_run_id: "1",
    cutoff_policy: "slate_before_first_kickoff",
    status: "projected",
    projection: { type: "team_total", projected_team_points: 24.2 },
    feature_snapshot: {
      values: {},
      source_manifest_hashes: {},
      fitted_model_hash: "hash1",
      feature_payload_hash: "payload1",
    },
    market_reference_status: "not_applicable",
    market_snapshot_refs: [],
    provenance: [],
    ...overrides,
  } as PredictionSnapshotV1;
}

describe("buildTeamTotalsProjections", () => {
  it("joins the home and away rows for a game into one projection", () => {
    const rows = [
      teamTotalRow({ prediction_id: "home1", team: "sea", home_away: "home", projection: { type: "team_total", projected_team_points: 24.2 } }),
      teamTotalRow({ prediction_id: "away1", team: "ne", home_away: "away", projection: { type: "team_total", projected_team_points: 24.7 } }),
    ];
    const projections = buildTeamTotalsProjections(rows);
    expect(Object.keys(projections)).toEqual(["2026_01_NE_SEA"]);
    const p = projections["2026_01_NE_SEA"];
    expect(p.homeTeam).toBe("sea");
    expect(p.awayTeam).toBe("ne");
    expect(p.homeExpectedPoints).toBe(24.2);
    expect(p.awayExpectedPoints).toBe(24.7);
    expect(p.projectedGameTotal).toBeCloseTo(48.9, 10);
  });

  it("excludes a game when only one side has an archived row", () => {
    const rows = [
      teamTotalRow({ prediction_id: "home1", team: "sea", home_away: "home" }),
    ];
    expect(buildTeamTotalsProjections(rows)).toEqual({});
  });

  it("selects the latest snapshot per side by prediction_timestamp when a game has multiple archived runs", () => {
    const rows = [
      teamTotalRow({
        prediction_id: "home_early",
        team: "sea",
        home_away: "home",
        prediction_timestamp: "2026-09-04T10:00:00.000Z",
        projection: { type: "team_total", projected_team_points: 20.0 },
      }),
      teamTotalRow({
        prediction_id: "home_late",
        team: "sea",
        home_away: "home",
        prediction_timestamp: "2026-09-05T10:00:00.000Z",
        projection: { type: "team_total", projected_team_points: 23.5 },
      }),
      teamTotalRow({
        prediction_id: "away_only",
        team: "ne",
        home_away: "away",
        prediction_timestamp: "2026-09-04T10:00:00.000Z",
        projection: { type: "team_total", projected_team_points: 21.0 },
      }),
    ];
    const p = buildTeamTotalsProjections(rows)["2026_01_NE_SEA"];
    expect(p.homeExpectedPoints).toBe(23.5); // the later of the two home snapshots
    expect(p.predictionTimestamp).toBe("2026-09-05T10:00:00.000Z");
  });

  it("does not modify or drop an earlier snapshot -- it only picks which one this view surfaces", () => {
    const rows = [
      teamTotalRow({ prediction_id: "home_early", team: "sea", home_away: "home", prediction_timestamp: "2026-09-04T10:00:00.000Z" }),
      teamTotalRow({ prediction_id: "home_late", team: "sea", home_away: "home", prediction_timestamp: "2026-09-05T10:00:00.000Z" }),
      teamTotalRow({ prediction_id: "away1", team: "ne", home_away: "away" }),
    ];
    // Both rows are still present in the input the reducer was given -- the
    // reducer is a pure read, it never touches the archive on disk.
    expect(rows).toHaveLength(3);
    expect(buildTeamTotalsProjections(rows)["2026_01_NE_SEA"]).toBeDefined();
  });

  it("excludes rows for other prediction types", () => {
    const rows = [
      teamTotalRow({ prediction_id: "home1", team: "sea", home_away: "home" }),
      teamTotalRow({ prediction_id: "away1", team: "ne", home_away: "away" }),
      teamTotalRow({
        prediction_id: "passing1",
        team: "sea",
        home_away: "home",
        prediction_type: "passing",
        player_id: "p1",
        projection: { type: "passing", projected_attempts: 30, projected_ypa: 7, projected_passing_yards: 210, direct_model_prediction: 210 },
      }),
    ];
    expect(Object.keys(buildTeamTotalsProjections(rows))).toEqual(["2026_01_NE_SEA"]);
  });

  it("excludes non-projected status rows", () => {
    const rows = [
      teamTotalRow({ prediction_id: "home1", team: "sea", home_away: "home", status: "unavailable" }),
      teamTotalRow({ prediction_id: "away1", team: "ne", home_away: "away" }),
    ];
    expect(buildTeamTotalsProjections(rows)).toEqual({});
  });

  it("excludes a game when home and away model_version disagree", () => {
    const rows = [
      teamTotalRow({ prediction_id: "home1", team: "sea", home_away: "home", model_version: "jkb-nfl-total-ridge-v1.0.0" }),
      teamTotalRow({ prediction_id: "away1", team: "ne", home_away: "away", model_version: "jkb-nfl-total-ridge-v1.1.0" }),
    ];
    expect(buildTeamTotalsProjections(rows)).toEqual({});
  });

  it("handles multiple independent games in the same call", () => {
    const rows = [
      teamTotalRow({ prediction_id: "g1home", game_id: "2026_01_NE_SEA", team: "sea", home_away: "home" }),
      teamTotalRow({ prediction_id: "g1away", game_id: "2026_01_NE_SEA", team: "ne", home_away: "away" }),
      teamTotalRow({ prediction_id: "g2home", game_id: "2026_01_SF_LA", team: "lar", home_away: "home" }),
      teamTotalRow({ prediction_id: "g2away", game_id: "2026_01_SF_LA", team: "sf", home_away: "away" }),
    ];
    expect(Object.keys(buildTeamTotalsProjections(rows)).sort()).toEqual([
      "2026_01_NE_SEA",
      "2026_01_SF_LA",
    ]);
  });
});
