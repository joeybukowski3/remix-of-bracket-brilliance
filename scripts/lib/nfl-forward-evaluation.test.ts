import { describe, expect, it } from "vitest";
import type { JsonValue, ReceivingEvaluationRow, RushingEvaluationRow } from "./nfl-evaluation-dataset";
import {
  buildReceivingForwardEvaluationSummary,
  buildReceivingRoleConflictRow,
  buildRushingForwardEvaluationSummary,
  buildRushingShadowVsProductionRow,
  derivePoolCoherenceFailureCount,
  selectFinalPregameEvaluationRows,
} from "./nfl-forward-evaluation";

// ---------------------------------------------------------------------------
// Fixture builders -- minimal but schema-shaped WU3 evaluation rows.
// ---------------------------------------------------------------------------

function identity(overrides: Partial<RushingEvaluationRow | ReceivingEvaluationRow> = {}) {
  return {
    schema_version: "jkb-football-evaluation-v1" as const,
    materializer_version: "nfl-evaluation-materializer-v1" as const,
    evaluation_mode: "production" as const,
    evaluation_row_id: `eval_${overrides.player_id ?? "p1"}`,
    prediction_id: `pred_${overrides.player_id ?? "p1"}`,
    snapshot_key: "key",
    snapshot_label: null,
    prediction_timestamp: "2026-09-10T12:00:00.000Z",
    prediction_created_at: "2026-09-10T12:00:00.000Z",
    kickoff_utc: "2026-09-13T17:00:00.000Z",
    hours_to_kickoff: 77,
    season: 2026,
    week: 1,
    game_id: "2026_01_HOU_BUF",
    team: "hou",
    opponent: "buf",
    home_away: "home" as const,
    neutral_site: false,
    position: null,
    player_id: "p1",
    player_name_at_prediction: "Test Player",
    prediction_type: "rushing" as const,
    model_name: "nfl-rushing",
    model_version: "v1",
    feature_schema_version: "v1",
    pipeline_version: "v1",
    code_revision: null,
    run_id: "run-1",
    fitted_model_hash: "fit-1",
    feature_payload_hash: "hash-1",
    source_manifest_hashes: { run: "s" },
  };
}

const outcomeProvenance = {
  resolution_status: "resolved" as const,
  resolved_at: "2026-09-14T00:00:00.000Z",
  game_completion_status: "final" as const,
  resolver_version: "nfl-prediction-outcome-resolver-v1" as const,
  selected_outcome_id: "outcome_1",
  selected_outcome_revision: 1,
  outcome_revision_count: 1,
  superseded_outcome_ids: [],
  outcome_revision_chronology: [],
  outcome_source_state_hash: "state",
  outcome_source_artifacts: [],
  identity_resolution: {
    method: "canonical_player_id_and_game_id" as const,
    actual_team: "hou",
    actual_opponent: "buf",
    team_match: true,
    roster_status: null,
    zero_source: null,
  },
};

function rushingRow(overrides: {
  playerId?: string;
  week?: number;
  predictionTimestamp?: string;
  predictionId?: string;
  productionCarries?: number;
  actualCarries?: number;
  allocationDiagnostics?: JsonValue | null;
  teamChanged?: boolean | null;
  noHistory?: boolean;
  roleSourced?: boolean;
  depthRank?: number | null;
  starterFlag?: boolean | null;
  position?: "QB" | "RB" | "WR" | "TE";
  rushingRoleConflictV2?: JsonValue | null;
  poolCoherenceFailures?: number | null;
}): RushingEvaluationRow {
  const productionCarries = overrides.productionCarries ?? 15;
  const actualCarries = overrides.actualCarries ?? 14;
  return {
    ...identity({ player_id: overrides.playerId }),
    position: overrides.position ?? "RB",
    player_id: overrides.playerId ?? "p1",
    prediction_id: overrides.predictionId ?? `pred_${overrides.playerId ?? "p1"}_${overrides.predictionTimestamp ?? "t1"}`,
    prediction_timestamp: overrides.predictionTimestamp ?? "2026-09-10T12:00:00.000Z",
    week: overrides.week ?? 1,
    prediction_type: "rushing",
    outcome: {
      ...outcomeProvenance,
      projection: { projected_carries: productionCarries, projected_ypc: 4.2, projected_rushing_yards: productionCarries * 4.2 },
      actual: { carries: actualCarries, yards: actualCarries * 4, yards_per_carry: 4 },
      error: {
        yards_error: productionCarries * 4.2 - actualCarries * 4,
        absolute_yards_error: Math.abs(productionCarries * 4.2 - actualCarries * 4),
        carries_error: productionCarries - actualCarries,
        ypc_error: 0.2,
      },
      volume: { zero_volume: actualCarries === 0, actual_volume: actualCarries, volume_denominator_field: "carries" },
      market: null,
    },
    feature_snapshot_values: {
      allocation_diagnostics: overrides.allocationDiagnostics === undefined ? null : overrides.allocationDiagnostics,
      team_changed: overrides.teamChanged ?? null,
      no_history: overrides.noHistory ?? false,
      role_sourced: overrides.roleSourced ?? false,
      depth_chart_rank: overrides.depthRank ?? null,
      starter_flag: overrides.starterFlag ?? null,
      rushing_role_conflict_v2: overrides.rushingRoleConflictV2 === undefined ? null : overrides.rushingRoleConflictV2,
      rushing_pool_coherence_failures: overrides.poolCoherenceFailures === undefined ? null : overrides.poolCoherenceFailures,
    },
    cohorts: {},
  } as RushingEvaluationRow;
}

function receivingRow(overrides: {
  playerId?: string;
  week?: number;
  predictionTimestamp?: string;
  predictionId?: string;
  position?: "WR" | "TE" | "RB" | "QB";
  projectedTargets?: number;
  actualTargets?: number;
  projectedYards?: number;
  actualYards?: number;
  conflict?: JsonValue | null;
}): ReceivingEvaluationRow {
  const projectedTargets = overrides.projectedTargets ?? 6;
  const actualTargets = overrides.actualTargets ?? 5;
  const projectedYards = overrides.projectedYards ?? 70;
  const actualYards = overrides.actualYards ?? 65;
  return {
    ...identity({ player_id: overrides.playerId }),
    position: overrides.position ?? "WR",
    player_id: overrides.playerId ?? "p1",
    prediction_id: overrides.predictionId ?? `pred_${overrides.playerId ?? "p1"}_${overrides.predictionTimestamp ?? "t1"}`,
    prediction_timestamp: overrides.predictionTimestamp ?? "2026-09-10T12:00:00.000Z",
    week: overrides.week ?? 1,
    prediction_type: "receiving",
    outcome: {
      ...outcomeProvenance,
      projection: { projected_targets: projectedTargets, projected_yards_per_target: projectedYards / projectedTargets, projected_receiving_yards: projectedYards, projected_receptions: null, projected_yards_per_reception: null },
      actual: { targets: actualTargets, receptions: actualTargets - 1, yards: actualYards, yards_per_target: actualYards / actualTargets, yards_per_reception: null },
      error: {
        yards_error: projectedYards - actualYards,
        absolute_yards_error: Math.abs(projectedYards - actualYards),
        targets_error: projectedTargets - actualTargets,
        receptions_error: null,
        yards_per_target_error: null,
        yards_per_reception_error: null,
      },
      volume: { zero_volume: actualTargets === 0, actual_volume: actualTargets, volume_denominator_field: "targets" },
      market: null,
    },
    feature_snapshot_values: {
      receiving_role_conflict: overrides.conflict === undefined ? null : overrides.conflict,
    },
    cohorts: {},
  } as ReceivingEvaluationRow;
}

// ---------------------------------------------------------------------------

describe("selectFinalPregameEvaluationRows", () => {
  it("collapses multiple daily snapshots for the same player/game into the latest one", () => {
    const rows = [
      rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-08T12:00:00.000Z", predictionId: "pred_a" }),
      rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-12T12:00:00.000Z", predictionId: "pred_c" }),
      rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-10T12:00:00.000Z", predictionId: "pred_b" }),
    ];
    const selected = selectFinalPregameEvaluationRows(rows);
    expect(selected).toHaveLength(1);
    expect(selected[0].prediction_id).toBe("pred_c");
  });

  it("keeps separate rows for different players/games", () => {
    const rows = [rushingRow({ playerId: "p1" }), rushingRow({ playerId: "p2" }), rushingRow({ playerId: "p1", week: 2 })];
    expect(selectFinalPregameEvaluationRows(rows)).toHaveLength(3);
  });

  it("is deterministic: ties on prediction_timestamp break by prediction_id", () => {
    const rows = [
      rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-10T12:00:00.000Z", predictionId: "pred_a" }),
      rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-10T12:00:00.000Z", predictionId: "pred_b" }),
    ];
    const first = selectFinalPregameEvaluationRows(rows);
    const second = selectFinalPregameEvaluationRows([...rows].reverse());
    expect(first[0].prediction_id).toBe("pred_b");
    expect(second[0].prediction_id).toBe("pred_b");
  });

  it("does not mutate its input", () => {
    const rows = [rushingRow({ playerId: "p1" }), rushingRow({ playerId: "p2" })];
    const snapshot = JSON.stringify(rows);
    selectFinalPregameEvaluationRows(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  // WU4G.1 §1: a dual-role RB has both a rushing and a receiving
  // EvaluationRow for the SAME (season, week, game_id, player_id). Without
  // `prediction_type` in the key, whichever type has the later
  // prediction_timestamp would silently overwrite the other.
  describe("evaluation-target identity separation (WU4G.1 §1)", () => {
    it("keeps a dual-role RB's rushing row AND receiving row for the same player/game -- neither is dropped", () => {
      const rushing = rushingRow({ playerId: "rb1", predictionTimestamp: "2026-09-10T12:00:00.000Z" });
      const receiving = receivingRow({ playerId: "rb1", predictionTimestamp: "2026-09-12T12:00:00.000Z" }); // later timestamp
      const selected = selectFinalPregameEvaluationRows([rushing, receiving]);
      expect(selected).toHaveLength(2);
      expect(selected.some((r) => r.prediction_type === "rushing")).toBe(true);
      expect(selected.some((r) => r.prediction_type === "receiving")).toBe(true);
    });

    it("collapses multiple daily RUSHING snapshots to one, independent of a receiving row for the same player/game", () => {
      const rows = [
        rushingRow({ playerId: "rb1", predictionTimestamp: "2026-09-08T12:00:00.000Z", predictionId: "rush_early", productionCarries: 10 }),
        rushingRow({ playerId: "rb1", predictionTimestamp: "2026-09-12T12:00:00.000Z", predictionId: "rush_final", productionCarries: 16 }),
        receivingRow({ playerId: "rb1", predictionTimestamp: "2026-09-10T12:00:00.000Z" }),
      ];
      const selected = selectFinalPregameEvaluationRows(rows);
      const rushingSelected = selected.filter((r) => r.prediction_type === "rushing");
      const receivingSelected = selected.filter((r) => r.prediction_type === "receiving");
      expect(rushingSelected).toHaveLength(1);
      expect(rushingSelected[0].prediction_id).toBe("rush_final");
      expect(receivingSelected).toHaveLength(1);
    });

    it("collapses multiple daily RECEIVING snapshots to one, independent of a rushing row for the same player/game", () => {
      const rows = [
        receivingRow({ playerId: "rb1", predictionTimestamp: "2026-09-08T12:00:00.000Z", predictionId: "recv_early", projectedTargets: 3 }),
        receivingRow({ playerId: "rb1", predictionTimestamp: "2026-09-12T12:00:00.000Z", predictionId: "recv_final", projectedTargets: 5 }),
        rushingRow({ playerId: "rb1", predictionTimestamp: "2026-09-10T12:00:00.000Z" }),
      ];
      const selected = selectFinalPregameEvaluationRows(rows);
      const receivingSelected = selected.filter((r) => r.prediction_type === "receiving");
      const rushingSelected = selected.filter((r) => r.prediction_type === "rushing");
      expect(receivingSelected).toHaveLength(1);
      expect(receivingSelected[0].prediction_id).toBe("recv_final");
      expect(rushingSelected).toHaveLength(1);
    });

    it("never merges a rushing row and a receiving row for the same player/game into one entry, even when timestamps tie", () => {
      const rushing = rushingRow({ playerId: "rb1", predictionTimestamp: "2026-09-10T12:00:00.000Z", predictionId: "rush_tie" });
      const receiving = receivingRow({ playerId: "rb1", predictionTimestamp: "2026-09-10T12:00:00.000Z", predictionId: "recv_tie" });
      const selected = selectFinalPregameEvaluationRows([rushing, receiving]);
      expect(selected).toHaveLength(2);
      expect(selected.map((r) => r.prediction_id).sort()).toEqual(["recv_tie", "rush_tie"]);
    });

    it("deterministic tie-break within one evaluation target is unaffected by the added prediction_type key segment", () => {
      const rows = [
        rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-10T12:00:00.000Z", predictionId: "pred_a" }),
        rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-10T12:00:00.000Z", predictionId: "pred_b" }),
      ];
      const first = selectFinalPregameEvaluationRows(rows);
      const second = selectFinalPregameEvaluationRows([...rows].reverse());
      expect(first[0].prediction_id).toBe("pred_b");
      expect(second[0].prediction_id).toBe("pred_b");
    });
  });

  // WU4G.1 §2: defensive pre-kickoff filter, even though WU1 already
  // guarantees this for every production snapshot.
  describe("defensive pre-kickoff filtering (WU4G.1 §2)", () => {
    it("excludes a row whose prediction_timestamp is not before kickoff_utc, even if it is the latest by timestamp", () => {
      const eligible = rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-10T12:00:00.000Z", predictionId: "pred_eligible" });
      const postKickoff = { ...rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-14T00:00:00.000Z", predictionId: "pred_late" }) };
      const selected = selectFinalPregameEvaluationRows([eligible, postKickoff]);
      expect(selected).toHaveLength(1);
      expect(selected[0].prediction_id).toBe("pred_eligible");
    });

    it("returns nothing for a player/game where every row is at or after kickoff", () => {
      const postKickoff = rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-13T17:00:00.000Z", predictionId: "pred_exact" }); // == kickoff_utc
      expect(selectFinalPregameEvaluationRows([postKickoff])).toHaveLength(0);
    });

    it("reads kickoff_utc verbatim from the row -- does not re-derive or duplicate kickoff logic", () => {
      const earlierKickoff = { ...rushingRow({ playerId: "p1", predictionTimestamp: "2026-09-10T12:00:00.000Z" }), kickoff_utc: "2026-09-11T00:00:00.000Z" };
      expect(selectFinalPregameEvaluationRows([earlierKickoff])).toHaveLength(1);
      const tooLate = { ...rushingRow({ playerId: "p2", predictionTimestamp: "2026-09-10T12:00:00.000Z" }), kickoff_utc: "2026-09-10T06:00:00.000Z" };
      expect(selectFinalPregameEvaluationRows([tooLate])).toHaveLength(0);
    });
  });
});

describe("buildRushingShadowVsProductionRow", () => {
  it("reads productionCarries/actualCarries from the outcome and shadowCarries from allocation_diagnostics, never recomputing either", () => {
    const row = rushingRow({
      productionCarries: 12, actualCarries: 10,
      allocationDiagnostics: { projectedCarries: 18, roleConflictScore: 0.4, roleConflictFlag: true },
    });
    const mapped = buildRushingShadowVsProductionRow(row);
    expect(mapped.productionCarries).toBe(12);
    expect(mapped.actualCarries).toBe(10);
    expect(mapped.shadowCarries).toBe(18);
    expect(mapped.roleConflictScore).toBe(0.4);
    expect(mapped.roleConflictFlag).toBe(true);
  });

  it("returns null shadowCarries (not zero) when allocation_diagnostics is null", () => {
    const mapped = buildRushingShadowVsProductionRow(rushingRow({ allocationDiagnostics: null }));
    expect(mapped.shadowCarries).toBeNull();
    expect(mapped.roleConflictScore).toBeNull();
    expect(mapped.roleConflictFlag).toBeNull();
  });

  // WU4G.2 §1/§6: rushingConflictLevel must come from the archived
  // `rushing_role_conflict_v2` diagnostic, never from the OLD
  // `allocation_diagnostics.roleConflictScore`.
  it("reads rushingConflictLevel from rushing_role_conflict_v2, ignoring a strongly-disagreeing OLD roleConflictScore", () => {
    const row = rushingRow({
      allocationDiagnostics: { projectedCarries: 12, roleConflictScore: 0.9, roleConflictFlag: true }, // OLD score says extreme conflict
      rushingRoleConflictV2: { available: true, diagnostic: { conflict_level: "low" } }, // corrected V2 says low
    });
    const mapped = buildRushingShadowVsProductionRow(row);
    expect(mapped.rushingConflictLevel).toBe("low");
    expect(mapped.roleConflictScore).toBe(0.9); // OLD score still preserved for provenance
    expect(mapped.rushingConflictDiagnosticAvailable).toBe(true);
  });

  it("is available=true with a null rushingConflictLevel for a legitimate noHistory RB (not an unavailable diagnostic)", () => {
    const row = rushingRow({ rushingRoleConflictV2: { available: true, diagnostic: { conflict_level: null } } });
    const mapped = buildRushingShadowVsProductionRow(row);
    expect(mapped.rushingConflictDiagnosticAvailable).toBe(true);
    expect(mapped.rushingConflictLevel).toBeNull();
  });

  it("is available=false when the archived entry itself is structurally unavailable or missing", () => {
    const structural = buildRushingShadowVsProductionRow(rushingRow({ rushingRoleConflictV2: { available: false, reason: "unsupported_pool" } }));
    expect(structural.rushingConflictDiagnosticAvailable).toBe(false);
    expect(structural.rushingConflictLevel).toBeNull();
    const missing = buildRushingShadowVsProductionRow(rushingRow({ rushingRoleConflictV2: null }));
    expect(missing.rushingConflictDiagnosticAvailable).toBe(false);
  });

  it("carries the row's position through, for structural-expectation gating downstream", () => {
    expect(buildRushingShadowVsProductionRow(rushingRow({ position: "QB" })).position).toBe("QB");
    expect(buildRushingShadowVsProductionRow(rushingRow({ position: "RB" })).position).toBe("RB");
  });
});

describe("derivePoolCoherenceFailureCount", () => {
  it("reads the run-level pool-coherence fact off the first row that carries it", () => {
    const rows = [rushingRow({ playerId: "p1", poolCoherenceFailures: 2 }), rushingRow({ playerId: "p2", poolCoherenceFailures: 2 })];
    expect(derivePoolCoherenceFailureCount(rows)).toBe(2);
  });

  it("returns null (never 0) when no selected row carries the fact", () => {
    const rows = [rushingRow({ playerId: "p1" })]; // default poolCoherenceFailures is null
    expect(derivePoolCoherenceFailureCount(rows)).toBeNull();
  });

  it("returns null for an empty row list", () => {
    expect(derivePoolCoherenceFailureCount([])).toBeNull();
  });
});

describe("buildReceivingRoleConflictRow", () => {
  it("reads conflict diagnostic fields verbatim from the archived receiving_role_conflict entry", () => {
    const row = receivingRow({
      conflict: {
        available: true,
        diagnostic: { conflict_level: "high", ordering_conflict: true, team_changed: true, role_sourced: true, depth_rank: 1, no_history: false },
      },
    });
    const mapped = buildReceivingRoleConflictRow(row)!;
    expect(mapped.conflictLevel).toBe("high");
    expect(mapped.orderingConflict).toBe(true);
    expect(mapped.teamChanged).toBe(true);
    expect(mapped.depthRank).toBe(1);
  });

  it("returns null-conflict fields (not an exception) when the diagnostic is unavailable", () => {
    const mapped = buildReceivingRoleConflictRow(receivingRow({ conflict: { available: false, reason: "missing_depth_rank" } }))!;
    expect(mapped.conflictLevel).toBeNull();
    expect(mapped.orderingConflict).toBeNull();
  });

  it("excludes a position the receiving role-conflict diagnostic does not cover", () => {
    expect(buildReceivingRoleConflictRow(receivingRow({ position: "QB" }))).toBeNull();
  });
});

describe("buildRushingForwardEvaluationSummary", () => {
  it("computes overall MAE, delta, and win/loss/tie counts from shadow-covered rows", () => {
    const rows = [rushingRow({ playerId: "p1", productionCarries: 20, actualCarries: 10, allocationDiagnostics: { projectedCarries: 12, roleConflictScore: null, roleConflictFlag: false } })];
    const mapped = rows.map(buildRushingShadowVsProductionRow);
    const summary = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 4, rows: mapped });
    expect(summary.production_carry_mae).toBe(10); // |20-10|
    expect(summary.shadow_carry_mae).toBe(2); // |12-10|
    expect(summary.delta_mae).toBe(-8);
    expect(summary.shadow_win_count).toBe(1);
    expect(summary.production_win_count).toBe(0);
    expect(summary.shadow_coverage_available).toBe(1);
    expect(summary.shadow_coverage_unavailable).toBe(0);
  });

  it("reports null MAE/coverage-rate fields rather than throwing on an empty dataset", () => {
    const summary = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 0, rows: [] });
    expect(summary.production_carry_mae).toBeNull();
    expect(summary.shadow_carry_mae).toBeNull();
    expect(summary.coverage_rate).toBeNull();
    expect(summary.evaluated_player_games).toBe(0);
  });

  it("every cohort block carries n and flags insufficient sample below the shared threshold", () => {
    const rows = [rushingRow({ playerId: "p1" })];
    const summary = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows: rows.map(buildRushingShadowVsProductionRow) });
    expect(summary.cohorts.overall.n).toBe(1);
    expect(summary.cohorts.overall.insufficient_sample).toBe(true);
  });

  it("is deterministic: identical input produces byte-identical summary", () => {
    const rows = [rushingRow({ playerId: "p1" }), rushingRow({ playerId: "p2", allocationDiagnostics: { projectedCarries: 9, roleConflictScore: 0.1, roleConflictFlag: false } })].map(buildRushingShadowVsProductionRow);
    const a = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows });
    const b = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  // WU4G.1 §3: undefined at the summary-builder boundary must collapse to
  // "unknown" (null), never to "affirmatively zero".
  it("treats an omitted poolCoherenceFailureCount as unknown, not zero -- readiness is NOT_READY", () => {
    const rows = [rushingRow({ playerId: "p1" })].map(buildRushingShadowVsProductionRow);
    const summary = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 4, rows });
    expect(summary.pool_coherence_failure_count).toBeNull();
    expect(summary.readiness.status).toBe("NOT_READY");
    expect(summary.readiness.reasons.some((r) => r.includes("unavailable"))).toBe(true);
  });

  // WU4G.1 §4: shadow coverage must be computed over the full final-selected
  // rushing dataset, including rows where shadow is unavailable -- the
  // unavailable rows stay in the denominator, they are never dropped first.
  it("computes shadow coverage available/unavailable/rate from all 10 final-selected rows (8 with shadow, 2 without)", () => {
    const withShadow = Array.from({ length: 8 }, (_v, i) =>
      rushingRow({ playerId: `with-${i}`, allocationDiagnostics: { projectedCarries: 12, roleConflictScore: 0.1, roleConflictFlag: false } }),
    );
    const withoutShadow = Array.from({ length: 2 }, (_v, i) => rushingRow({ playerId: `without-${i}`, allocationDiagnostics: null }));
    const rows = [...withShadow, ...withoutShadow].map(buildRushingShadowVsProductionRow);
    const summary = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows });
    expect(summary.evaluated_player_games).toBe(10);
    expect(summary.shadow_coverage_available).toBe(8);
    expect(summary.shadow_coverage_unavailable).toBe(2);
    expect(summary.coverage_rate).toBeCloseTo(0.8);
    // the unavailable rows still contribute a production error -- they are not silently dropped.
    expect(summary.cohorts.overall.n).toBe(10);
  });

  it("never counts a shadow-unavailable row as a shadow win or loss", () => {
    const rows = [
      rushingRow({ playerId: "p1", allocationDiagnostics: null, productionCarries: 20, actualCarries: 10 }),
      rushingRow({ playerId: "p2", allocationDiagnostics: { projectedCarries: 11, roleConflictScore: null, roleConflictFlag: false }, productionCarries: 20, actualCarries: 10 }),
    ].map(buildRushingShadowVsProductionRow);
    const summary = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows });
    expect(summary.shadow_win_count + summary.production_win_count + summary.tie_count).toBe(1); // only the shadow-covered row is scored
  });

  // WU4G.2 §6/§11: rushing conflict-diagnostic coverage and persisted
  // pool-coherence evidence at the summary level.
  it("computes rushing_conflict_diagnostic coverage from RB rows only, excluding QB rushing rows from the denominator", () => {
    const rows = [
      rushingRow({ playerId: "rb1", position: "RB", rushingRoleConflictV2: { available: true, diagnostic: { conflict_level: "low" } } }),
      rushingRow({ playerId: "rb2", position: "RB", rushingRoleConflictV2: { available: false, reason: "missing_depth_rank" } }),
      rushingRow({ playerId: "qb1", position: "QB", rushingRoleConflictV2: { available: false, reason: "unsupported_pool" } }),
    ].map(buildRushingShadowVsProductionRow);
    const summary = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows });
    expect(summary.rushing_conflict_diagnostic_available).toBe(1);
    expect(summary.rushing_conflict_diagnostic_unavailable).toBe(1); // rb2 only -- qb1 is excluded from the RB-only denominator
    expect(summary.rushing_conflict_diagnostic_coverage_rate).toBeCloseTo(0.5);
  });

  it("passes the derived pool-coherence count through to both the top-level field and the readiness gate", () => {
    const rows = [rushingRow({ playerId: "p1" })].map(buildRushingShadowVsProductionRow);
    const summary = buildRushingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 4, rows, poolCoherenceFailureCount: 0 });
    expect(summary.pool_coherence_failure_count).toBe(0);
    expect(summary.readiness.poolCoherenceFailureCount).toBe(0);
  });
});

describe("buildReceivingForwardEvaluationSummary", () => {
  it("computes overall target MAE/bias and receiving yards MAE", () => {
    const rows = [receivingRow({ playerId: "p1", projectedTargets: 8, actualTargets: 5, projectedYards: 100, actualYards: 60 })];
    const mapped = rows.map(buildReceivingRoleConflictRow).filter((r): r is NonNullable<typeof r> => r != null);
    const summary = buildReceivingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows: mapped });
    expect(summary.target_mae).toBe(3);
    expect(summary.target_bias).toBe(3);
    expect(summary.receiving_yards_mae).toBe(40);
  });

  it("breaks down by role-conflict level including the NULL/no-diagnostic bucket", () => {
    const rows = [
      receivingRow({ playerId: "p1", conflict: { available: true, diagnostic: { conflict_level: "high", ordering_conflict: false, team_changed: true, role_sourced: true, depth_rank: 1, no_history: false } } }),
      receivingRow({ playerId: "p2", conflict: { available: false, reason: "missing_depth_rank" } }),
    ];
    const mapped = rows.map(buildReceivingRoleConflictRow).filter((r): r is NonNullable<typeof r> => r != null);
    const summary = buildReceivingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows: mapped });
    expect(summary.by_role_conflict.HIGH.n).toBe(1);
    expect(summary.by_role_conflict.NULL.n).toBe(1);
    expect(summary.by_role_conflict.LOW.n).toBe(0);
  });

  it("reports the HIGH-conflict x team-change intersection cohorts", () => {
    const rows = [
      receivingRow({ playerId: "p1", conflict: { available: true, diagnostic: { conflict_level: "high", ordering_conflict: false, team_changed: true, role_sourced: true, depth_rank: 1, no_history: false } } }),
      receivingRow({ playerId: "p2", conflict: { available: true, diagnostic: { conflict_level: "high", ordering_conflict: false, team_changed: false, role_sourced: true, depth_rank: 1, no_history: false } } }),
    ];
    const mapped = rows.map(buildReceivingRoleConflictRow).filter((r): r is NonNullable<typeof r> => r != null);
    const summary = buildReceivingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows: mapped });
    expect(summary.high_conflict_by_team_change.high_conflict_team_changed.n).toBe(1);
    expect(summary.high_conflict_by_team_change.high_conflict_same_team.n).toBe(1);
  });

  it("has no promotion-readiness field -- receiving is observational only", () => {
    const summary = buildReceivingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows: [] });
    expect((summary as Record<string, unknown>).readiness).toBeUndefined();
  });

  // WU4G.1 §5: diagnostic COVERAGE (was the archived diagnostic itself
  // present) is distinct from the LOW/MEDIUM/HIGH/NULL conflict-level
  // breakdown -- a noHistory player with an available diagnostic and a
  // legitimately null conflictLevel must count as diagnosticAvailable.
  describe("diagnostic coverage (WU4G.1 §5)", () => {
    it("computes diagnostic_available/unavailable/coverage_rate from whether the archived entry itself was available", () => {
      const rows = [
        receivingRow({ playerId: "p1", conflict: { available: true, diagnostic: { conflict_level: "medium", ordering_conflict: false, team_changed: false, role_sourced: true, depth_rank: 2, no_history: false } } }),
        receivingRow({ playerId: "p2", conflict: { available: true, diagnostic: { conflict_level: null, ordering_conflict: null, team_changed: null, role_sourced: false, depth_rank: 3, no_history: true } } }),
        receivingRow({ playerId: "p3", conflict: { available: false, reason: "missing_depth_rank" } }),
        receivingRow({ playerId: "p4", conflict: null }),
      ];
      const mapped = rows.map(buildReceivingRoleConflictRow).filter((r): r is NonNullable<typeof r> => r != null);
      const summary = buildReceivingForwardEvaluationSummary({ season: 2026, generatedAt: "2026-09-15T00:00:00.000Z", completedWeeks: 1, rows: mapped });
      expect(summary.diagnostic_available).toBe(2); // p1 (real level) and p2 (available, noHistory, null level)
      expect(summary.diagnostic_unavailable).toBe(2); // p3 (structural: missing_depth_rank) and p4 (missing entirely)
      expect(summary.diagnostic_coverage_rate).toBeCloseTo(0.5);
    });

    it("a noHistory row with an AVAILABLE diagnostic and a null conflictLevel is diagnosticAvailable=true, not unavailable", () => {
      const row = receivingRow({
        playerId: "p1",
        conflict: { available: true, diagnostic: { conflict_level: null, ordering_conflict: null, team_changed: null, role_sourced: false, depth_rank: 4, no_history: true } },
      });
      const mapped = buildReceivingRoleConflictRow(row)!;
      expect(mapped.noHistory).toBe(true);
      expect(mapped.conflictLevel).toBeNull();
      expect(mapped.diagnosticAvailable).toBe(true);
    });

    it("a structurally-unavailable diagnostic (available:false) is diagnosticAvailable=false", () => {
      const mapped = buildReceivingRoleConflictRow(receivingRow({ conflict: { available: false, reason: "missing_rank_prior" } }))!;
      expect(mapped.diagnosticAvailable).toBe(false);
    });

    it("a row with no receiving_role_conflict key at all is diagnosticAvailable=false", () => {
      const mapped = buildReceivingRoleConflictRow(receivingRow({ conflict: null }))!;
      expect(mapped.diagnosticAvailable).toBe(false);
    });
  });
});
