import { describe, expect, it } from "vitest";
import { finalizePredictionSnapshot, type PredictionSnapshotDraft, type PredictionSnapshotV1 } from "./nfl-production-prediction-archive";
import type { PredictionOutcomeEventV1 } from "./nfl-prediction-outcome-resolver";
import type { StarterCohortRecordV1 } from "./nfl-starter-cohort";
import { buildStarterPropEvaluations, serializeStarterPropEvaluations, summarizeStarterPropEvaluations } from "./nfl-starter-prop-evaluation";

const KICKOFF = "2026-09-13T17:00:00.000Z";
const GENERATED_AT = "2026-09-05T00:00:00.000Z";
const GAME_ID = "2026_01_ATL_PIT";
const PLAYER_ID = "gsis:00-0000001";

function cohortRow(overrides: Partial<StarterCohortRecordV1> = {}): StarterCohortRecordV1 {
  return {
    schema_version: "nfl-starter-cohort-v1",
    cohort_row_id: "starter_abc123",
    season: 2026,
    week: 1,
    game_id: GAME_ID,
    kickoff_time: KICKOFF,
    team: "pit",
    opponent: "atl",
    home_away: "home",
    player_id: PLAYER_ID,
    player_name: "Test QB",
    position: "QB",
    starter_eligible: true,
    starter_basis: "QB1_BY_ARCHIVED_DEPTH_CHART",
    starter_rank: 1,
    starter_metric: "depth_rank",
    starter_metric_value: 1,
    eligibility_prediction_timestamp: "2026-09-03T17:05:21.000Z",
    eligibility_model_version: "nfl-passing-direct-ridge-alpha10-production-2022-2025-v1",
    eligibility_prediction_id: "pred_eligibility",
    eligibility_source_type: "archived_depth_chart_role",
    role_source_updated_at: "2026-09-03T11:53:47.000Z",
    generated_at: GENERATED_AT,
    ...overrides,
  };
}

function comparisonRef(overrides: Partial<PredictionSnapshotDraft["market_snapshot_refs"][number]> = {}) {
  return {
    purpose: "comparison" as const,
    market_type: "passing_yards" as const,
    market_observation_id: "yardage_abc",
    content_hash: "hash-market-1",
    provider: "the-odds-api",
    sportsbook: "fanduel",
    observed_at: "2026-09-01T16:03:42.000Z",
    provider_updated_at: null,
    line: 220.5,
    over_price: -114,
    under_price: -114,
    side_prices: null,
    designation: "available_at_prediction" as const,
    ...overrides,
  };
}

function passingDraft(overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotDraft {
  return {
    schema_version: "jkb-football-prediction-v1",
    snapshot_label: null,
    prediction_timestamp: "2026-09-03T17:05:21.000Z",
    created_at: "2026-09-03T17:05:22.000Z",
    mode: "production",
    sport: "football",
    league: "nfl",
    season: 2026,
    week: 1,
    slate_date: "2026-09-13",
    game_id: GAME_ID,
    kickoff_utc: KICKOFF,
    player_id: PLAYER_ID,
    player_name_at_prediction: "Test QB",
    team: "pit",
    opponent: "atl",
    home_away: "home",
    neutral_site: false,
    position: "QB",
    prediction_type: "passing",
    model_name: "nfl-passing-direct-ridge",
    model_version: "nfl-passing-direct-ridge-alpha10-production-2022-2025-v1",
    feature_schema_version: "nfl-qb-passing-feature-row-v1",
    pipeline_version: "nfl-production-prediction-archive-v1",
    code_revision: "abc",
    run_id: "run-1",
    workflow_name: "NFL Yardage Projections",
    workflow_run_id: "1",
    cutoff_policy: "slate_before_first_kickoff",
    status: "projected",
    projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 230, direct_model_prediction: 230 },
    feature_snapshot: {
      values: { matchup_score: { score: 55 }, hard_case_flags: { roleUncertain: false } },
      source_manifest_hashes: { run: "hash-1" },
      fitted_model_hash: "fitted-hash-1",
    },
    market_reference_status: "available",
    market_snapshot_refs: [comparisonRef()],
    provenance: [{ kind: "source_manifest", logical_name: "inputs", content_hash: "hash-1" }],
    ...overrides,
  };
}

function passingRow(overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotV1 {
  return finalizePredictionSnapshot(passingDraft(overrides));
}

function resolvedOutcome(predictionId: string, yards: number, overrides: Partial<PredictionOutcomeEventV1> = {}): PredictionOutcomeEventV1 {
  return {
    schema_version: "jkb-football-prediction-outcome-v1",
    outcome_id: "outcome_test",
    prediction_id: predictionId,
    snapshot_key: "snapshot-key",
    outcome_revision: 1,
    supersedes_outcome_id: null,
    prediction_type: "passing",
    season: 2026,
    week: 1,
    game_id: GAME_ID,
    player_id: PLAYER_ID,
    team: "pit",
    opponent: "atl",
    recorded_at: "2026-09-14T02:00:00.000Z",
    resolved_at: "2026-09-14T02:00:00.000Z",
    resolution_status: "resolved",
    game_completion_status: "final",
    resolver_version: "nfl-prediction-outcome-resolver-v1",
    provider: "nflverse",
    source_artifacts: [],
    source_state_hash: "state-hash-1",
    identity_resolution: { method: "canonical_player_id_and_game_id", actual_team: "pit", actual_opponent: "atl", team_match: true, roster_status: null, zero_source: null },
    actual: { type: "passing", attempts: 30, completions: 20, yards, yards_per_attempt: yards / 30, touchdowns: 1, interceptions: 0 },
    derived: { type: "passing", yards_error: 230 - yards, absolute_yards_error: Math.abs(230 - yards), attempts_error: null, ypa_error: null },
    ...overrides,
  };
}

function grade(input: {
  cohort?: StarterCohortRecordV1[];
  predictions?: PredictionSnapshotV1[];
  outcomeEvents?: PredictionOutcomeEventV1[];
}) {
  return buildStarterPropEvaluations({
    cohort: input.cohort ?? [cohortRow()],
    predictions: input.predictions ?? [passingRow()],
    outcomeEvents: input.outcomeEvents ?? [],
    generatedAt: GENERATED_AT,
  });
}

describe("eligibility", () => {
  it("only grades players present in the starter cohort input", () => {
    const prediction = passingRow({ player_id: "gsis:00-9999999" });
    const { rows, exclusions } = grade({ predictions: [prediction], outcomeEvents: [] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("NO_VALID_PROJECTION");
  });

  it("joins on exact player/game/team/market", () => {
    const prediction = passingRow();
    const outcome = resolvedOutcome(prediction.prediction_id, 250);
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [outcome] });
    expect(rows).toHaveLength(1);
    expect(rows[0].player_id).toBe(PLAYER_ID);
    expect(rows[0].market).toBe("passing_yards");
  });

  it("blocks grading when cohort row is missing entirely", () => {
    const { rows, exclusions } = grade({ cohort: [], outcomeEvents: [] });
    expect(rows).toHaveLength(0);
    expect(exclusions).toHaveLength(0);
  });
});

describe("snapshot selection", () => {
  it("selects the latest valid pregame projection snapshot", () => {
    const older = passingRow({
      prediction_timestamp: "2026-09-01T00:00:00.000Z",
      projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 200, direct_model_prediction: 200 },
      market_snapshot_refs: [comparisonRef({ observed_at: "2026-08-25T00:00:00.000Z" })],
    });
    const newer = passingRow({ prediction_timestamp: "2026-09-03T17:05:21.000Z", projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 240, direct_model_prediction: 240 } });
    const outcome = resolvedOutcome(newer.prediction_id, 250);
    const { rows } = grade({ predictions: [older, newer], outcomeEvents: [outcome] });
    expect(rows).toHaveLength(1);
    expect(rows[0].jkb_projection).toBe(240);
    expect(rows[0].prediction_id).toBe(newer.prediction_id);
  });

  it("rejects a shadow-mode snapshot even if it is the only candidate", () => {
    const shadow = finalizePredictionSnapshot({ ...passingDraft(), mode: "shadow", prediction_timestamp: "2026-09-10T00:00:00.000Z" });
    const { rows, exclusions } = grade({ predictions: [shadow], outcomeEvents: [] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("NO_VALID_PROJECTION");
  });

  it("rejects a snapshot with status other than projected", () => {
    const notEligible = finalizePredictionSnapshot({ ...passingDraft(), status: "not_eligible" });
    const { rows, exclusions } = grade({ predictions: [notEligible], outcomeEvents: [] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("MODEL_STATUS_NOT_PROJECTED");
  });

  it("rejects rows for the wrong market/prediction_type (rushing prediction does not satisfy a QB cohort slot)", () => {
    const rushing = finalizePredictionSnapshot({
      ...passingDraft(),
      position: "RB",
      prediction_type: "rushing",
      model_name: "nfl-rushing-carries-x-shrunk-ypc",
      projection: { type: "rushing", projected_carries: 15, projected_ypc: 4.2, projected_rushing_yards: 63 },
      market_snapshot_refs: [],
      market_reference_status: "missing",
    });
    const { rows, exclusions } = grade({ predictions: [rushing], outcomeEvents: [] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("NO_VALID_PROJECTION");
  });

  it("rejects a prediction for a different player/game", () => {
    const wrongPlayer = passingRow({ player_id: "gsis:00-8888888" });
    const { rows, exclusions } = grade({ predictions: [wrongPlayer], outcomeEvents: [] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("NO_VALID_PROJECTION");
  });
});

describe("market selection", () => {
  it("prefers comparison-purpose snapshot over model_input", () => {
    const modelInputOnly = passingRow({
      market_snapshot_refs: [comparisonRef({ purpose: "model_input", line: 999 })],
      market_reference_status: "available",
    });
    const { rows, exclusions } = grade({ predictions: [modelInputOnly], outcomeEvents: [resolvedOutcome(modelInputOnly.prediction_id, 250)] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("NO_VALID_COMPARISON_LINE");
  });

  it("selects the latest valid comparison snapshot when multiple exist", () => {
    const prediction = passingRow({
      market_snapshot_refs: [
        comparisonRef({ observed_at: "2026-08-25T00:00:00.000Z", line: 205.5, sportsbook: "draftkings" }),
        comparisonRef({ observed_at: "2026-09-01T16:03:42.000Z", line: 220.5, sportsbook: "fanduel" }),
      ],
    });
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 250)] });
    expect(rows[0].market_line).toBe(220.5);
    expect(rows[0].market_book).toBe("fanduel");
  });

  it("rejects a mismatched market_type (e.g. only receiving_yards archived for a QB passing slot)", () => {
    const prediction = passingRow({ market_snapshot_refs: [comparisonRef({ market_type: "receiving_yards" })] });
    const { rows, exclusions } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 250)] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("NO_VALID_COMPARISON_LINE");
  });

  it("produces an explicit ungradeable reason when no valid line exists", () => {
    const prediction = passingRow({ market_snapshot_refs: [], market_reference_status: "missing" });
    const { rows, exclusions } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 250)] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("NO_VALID_COMPARISON_LINE");
  });
});

describe("directional result contract", () => {
  it("OVER projection + actual over line = WIN", () => {
    const prediction = passingRow();
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 250)] });
    expect(rows[0].direction).toBe("OVER");
    expect(rows[0].market_outcome).toBe("OVER");
    expect(rows[0].directional_result).toBe("WIN");
  });

  it("OVER projection + actual under line = LOSS", () => {
    const prediction = passingRow();
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 190)] });
    expect(rows[0].direction).toBe("OVER");
    expect(rows[0].market_outcome).toBe("UNDER");
    expect(rows[0].directional_result).toBe("LOSS");
  });

  it("UNDER projection + actual under line = WIN", () => {
    const prediction = passingRow({ projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 200, direct_model_prediction: 200 } });
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 190)] });
    expect(rows[0].direction).toBe("UNDER");
    expect(rows[0].market_outcome).toBe("UNDER");
    expect(rows[0].directional_result).toBe("WIN");
  });

  it("UNDER projection + actual over line = LOSS", () => {
    const prediction = passingRow({ projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 200, direct_model_prediction: 200 } });
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 250)] });
    expect(rows[0].direction).toBe("UNDER");
    expect(rows[0].market_outcome).toBe("OVER");
    expect(rows[0].directional_result).toBe("LOSS");
  });

  it("actual equals line = PUSH regardless of direction", () => {
    const prediction = passingRow();
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 220.5)] });
    expect(rows[0].market_outcome).toBe("PUSH");
    expect(rows[0].directional_result).toBe("PUSH");
  });

  it("projection equals line = NEUTRAL regardless of outcome", () => {
    const prediction = passingRow({ projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 220.5, direct_model_prediction: 220.5 } });
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 260)] });
    expect(rows[0].direction).toBe("NEUTRAL");
    expect(rows[0].directional_result).toBe("NEUTRAL");
  });
});

describe("error metrics", () => {
  it("computes signed/absolute/squared projection error against actual (not the market line)", () => {
    const prediction = passingRow();
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 200)] });
    expect(rows[0].signed_projection_error).toBe(30);
    expect(rows[0].absolute_projection_error).toBe(30);
    expect(rows[0].squared_projection_error).toBe(900);
  });

  it("push and neutral rows still carry error metrics (independent of Over/Under result)", () => {
    const prediction = passingRow();
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 220.5)] });
    expect(rows[0].signed_projection_error).toBeCloseTo(9.5);
  });
});

describe("push handling", () => {
  it("counts push rows separately in the summary, excluded from the hit-rate denominator", () => {
    const push = passingRow();
    const win = passingRow({ player_id: "gsis:00-0000002" });
    const cohortWin = cohortRow({ player_id: "gsis:00-0000002", cohort_row_id: "starter_win" });
    const { rows, exclusions } = grade({
      cohort: [cohortRow(), cohortWin],
      predictions: [push, win],
      outcomeEvents: [resolvedOutcome(push.prediction_id, 220.5), resolvedOutcome(win.prediction_id, 260, { prediction_id: win.prediction_id, player_id: "gsis:00-0000002" })],
    });
    const summary = summarizeStarterPropEvaluations(2, rows, exclusions);
    expect(summary.push_n).toBe(1);
    expect(summary.win_n).toBe(1);
    expect(summary.directional_hit_rate).toBe(1);
  });
});

describe("provenance", () => {
  it("preserves model_version, fitted_model_hash, starter cohort row id, and market snapshot ref", () => {
    const prediction = passingRow();
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 250)] });
    expect(rows[0].model_version).toBe("nfl-passing-direct-ridge-alpha10-production-2022-2025-v1");
    expect(rows[0].fitted_model_hash).toBe("fitted-hash-1");
    expect(rows[0].starter_cohort_row_id).toBe("starter_abc123");
    expect(rows[0].market_snapshot_ref).toBe("yardage_abc");
  });
});

describe("deep analysis context", () => {
  it("preserves the immutable pregame feature snapshot verbatim", () => {
    const prediction = passingRow();
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 250)] });
    expect(rows[0].context).toEqual({ matchup_score: { score: 55 }, hard_case_flags: { roleUncertain: false } });
  });

  it("never derives context from postgame actual stats", () => {
    const prediction = passingRow();
    const { rows } = grade({ predictions: [prediction], outcomeEvents: [resolvedOutcome(prediction.prediction_id, 999)] });
    expect(JSON.stringify(rows[0].context)).not.toContain("999");
  });
});

describe("game completion / resolution gating", () => {
  it("excludes with GAME_NOT_FINAL when game_completion_status is not final", () => {
    const prediction = passingRow();
    const outcome = resolvedOutcome(prediction.prediction_id, 250, { resolution_status: "pending_player_stats", game_completion_status: "not_final", actual: null, derived: null, resolved_at: null });
    const { rows, exclusions } = grade({ predictions: [prediction], outcomeEvents: [outcome] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("GAME_NOT_FINAL");
  });

  it("excludes with ACTUAL_UNRESOLVED when no outcome event has been archived yet", () => {
    const prediction = passingRow();
    const { rows, exclusions } = grade({ predictions: [prediction], outcomeEvents: [] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("ACTUAL_UNRESOLVED");
  });

  it("excludes with ACTUAL_UNRESOLVED when the game is final but stats are still pending", () => {
    const prediction = passingRow();
    const outcome = resolvedOutcome(prediction.prediction_id, 250, { resolution_status: "pending_player_stats", game_completion_status: "final", actual: null, derived: null, resolved_at: null });
    const { rows, exclusions } = grade({ predictions: [prediction], outcomeEvents: [outcome] });
    expect(rows).toHaveLength(0);
    expect(exclusions[0].reason).toBe("ACTUAL_UNRESOLVED");
  });
});

describe("idempotency", () => {
  it("repeated materialization over unchanged inputs is deterministically identical", () => {
    const prediction = passingRow();
    const outcome = resolvedOutcome(prediction.prediction_id, 250);
    const first = grade({ predictions: [prediction], outcomeEvents: [outcome] });
    const second = grade({ predictions: [prediction], outcomeEvents: [outcome] });
    expect(serializeStarterPropEvaluations(first.rows)).toBe(serializeStarterPropEvaluations(second.rows));
  });

  it("throws rather than silently emitting duplicate logical rows for the same season/week/game/player/market", () => {
    const duplicateCohort = [cohortRow(), cohortRow({ cohort_row_id: "starter_dupe" })];
    expect(() => grade({ cohort: duplicateCohort, outcomeEvents: [] })).toThrow(/duplicate logical starter-prop row/);
  });
});
