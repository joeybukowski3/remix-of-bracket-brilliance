import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalJson } from "./lib/nfl-production-prediction-archive";
import { parseForwardEvaluationArgs, runForwardEvaluationMaterializer } from "./materialize-nfl-forward-evaluation";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

function seedWu3Fixtures(evaluationRoot: string, season: number): void {
  const versionRoot = join(evaluationRoot, "jkb-football-evaluation-v1");
  const rushingDir = join(versionRoot, "rushing");
  const receivingDir = join(versionRoot, "receiving");
  mkdirSync(rushingDir, { recursive: true });
  mkdirSync(receivingDir, { recursive: true });

  // Two point-in-time snapshots for the same player/game (WU3's documented
  // "one row per snapshot" behavior) -- the forward-evaluation layer must
  // collapse these to the LATEST (2026-09-12) row only.
  const rushingRows = [
    rushingFixtureRow({ predictionTimestamp: "2026-09-08T12:00:00.000Z", predictionId: "pred_early", productionCarries: 10 }),
    rushingFixtureRow({ predictionTimestamp: "2026-09-12T12:00:00.000Z", predictionId: "pred_final", productionCarries: 16 }),
  ];
  writeFileSync(join(rushingDir, `${season}.jsonl`), `${rushingRows.map((r) => canonicalJson(r as never)).join("\n")}\n`);

  const receivingRows = [receivingFixtureRow({ predictionTimestamp: "2026-09-12T12:00:00.000Z", predictionId: "pred_recv" })];
  writeFileSync(join(receivingDir, `${season}.jsonl`), `${receivingRows.map((r) => canonicalJson(r as never)).join("\n")}\n`);
}

function baseIdentity(overrides: Record<string, unknown>) {
  return {
    schema_version: "jkb-football-evaluation-v1",
    materializer_version: "nfl-evaluation-materializer-v1",
    evaluation_mode: "production",
    snapshot_key: "key",
    snapshot_label: null,
    prediction_created_at: "2026-09-10T12:00:00.000Z",
    kickoff_utc: "2026-09-13T17:00:00.000Z",
    hours_to_kickoff: 77,
    season: 2026,
    week: 1,
    game_id: "2026_01_HOU_BUF",
    team: "hou",
    opponent: "buf",
    home_away: "home",
    neutral_site: false,
    player_id: "p1",
    player_name_at_prediction: "Test Player",
    model_version: "v1",
    feature_schema_version: "v1",
    pipeline_version: "v1",
    code_revision: null,
    run_id: "run-1",
    fitted_model_hash: "fit-1",
    feature_payload_hash: "hash-1",
    source_manifest_hashes: { run: "s" },
    ...overrides,
  };
}

const outcomeProvenance = {
  resolution_status: "resolved",
  resolved_at: "2026-09-14T00:00:00.000Z",
  game_completion_status: "final",
  resolver_version: "nfl-prediction-outcome-resolver-v1",
  selected_outcome_id: "outcome_1",
  selected_outcome_revision: 1,
  outcome_revision_count: 1,
  superseded_outcome_ids: [],
  outcome_revision_chronology: [],
  outcome_source_state_hash: "state",
  outcome_source_artifacts: [],
  identity_resolution: { method: "canonical_player_id_and_game_id", actual_team: "hou", actual_opponent: "buf", team_match: true, roster_status: null, zero_source: null },
};

function rushingFixtureRow(o: { predictionTimestamp: string; predictionId: string; productionCarries: number; actualCarries?: number; allocationDiagnostics?: Record<string, unknown> | null }) {
  const actualCarries = o.actualCarries ?? 14;
  const actualYards = actualCarries * 4;
  return {
    ...baseIdentity({ prediction_type: "rushing", model_name: "nfl-rushing", position: "RB", prediction_id: o.predictionId, prediction_timestamp: o.predictionTimestamp, evaluation_row_id: `eval_${o.predictionId}` }),
    prediction_type: "rushing",
    outcome: {
      ...outcomeProvenance,
      projection: { projected_carries: o.productionCarries, projected_ypc: 4.2, projected_rushing_yards: o.productionCarries * 4.2 },
      actual: { carries: actualCarries, yards: actualYards, yards_per_carry: 4 },
      error: { yards_error: o.productionCarries * 4.2 - actualYards, absolute_yards_error: Math.abs(o.productionCarries * 4.2 - actualYards), carries_error: o.productionCarries - actualCarries, ypc_error: 0.2 },
      volume: { zero_volume: false, actual_volume: actualCarries, volume_denominator_field: "carries" },
      market: null,
    },
    feature_snapshot_values: {
      allocation_diagnostics: o.allocationDiagnostics === undefined ? { projectedCarries: 15, roleConflictScore: 0.1, roleConflictFlag: false } : o.allocationDiagnostics,
      team_changed: false, no_history: false, role_sourced: true, depth_chart_rank: 1, starter_flag: true,
    },
    cohorts: {},
  };
}

function receivingFixtureRow(o: { predictionTimestamp: string; predictionId: string }) {
  return {
    ...baseIdentity({ prediction_type: "receiving", model_name: "nfl-receiving", position: "WR", prediction_id: o.predictionId, prediction_timestamp: o.predictionTimestamp, evaluation_row_id: `eval_${o.predictionId}` }),
    prediction_type: "receiving",
    outcome: {
      ...outcomeProvenance,
      projection: { projected_targets: 7, projected_yards_per_target: 10, projected_receiving_yards: 70, projected_receptions: null, projected_yards_per_reception: null },
      actual: { targets: 5, receptions: 4, yards: 55, yards_per_target: 11, yards_per_reception: null },
      error: { yards_error: 15, absolute_yards_error: 15, targets_error: 2, receptions_error: null, yards_per_target_error: null, yards_per_reception_error: null },
      volume: { zero_volume: false, actual_volume: 5, volume_denominator_field: "targets" },
      market: null,
    },
    feature_snapshot_values: {
      receiving_role_conflict: { available: true, diagnostic: { historical_share: 0.3, role_prior_share: 0.5, conflict_score: 0.2, conflict_level: "medium", ordering_conflict: false, depth_rank: 2, role_sourced: true, team_changed: false, no_history: false, limited_history: false } },
    },
    cohorts: {},
  };
}

describe("parseForwardEvaluationArgs", () => {
  it("requires --season", () => {
    expect(() => parseForwardEvaluationArgs([])).toThrow(/--season/);
  });

  it("requires a UTC ISO-8601 --generated-at", () => {
    expect(() => parseForwardEvaluationArgs(["--season=2026", "--generated-at=not-a-date"])).toThrow(/UTC ISO-8601/);
  });
});

describe("runForwardEvaluationMaterializer", () => {
  it("selects the final pregame snapshot, reads only WU3 output, and writes forward datasets under the existing evaluation root", () => {
    const evaluationRoot = tempRoot("jkb-fwd-eval-");
    seedWu3Fixtures(evaluationRoot, 2026);
    const result = runForwardEvaluationMaterializer({ season: 2026, evaluationRoot, generatedAt: "2026-09-15T00:00:00.000Z", dryRun: false });

    expect(result.rushing_rows_read).toBe(2);
    expect(result.rushing_rows_selected).toBe(1); // collapsed to the latest snapshot
    expect(result.receiving_rows_read).toBe(1);
    expect(result.receiving_rows_selected).toBe(1);

    const rushingRowsPath = join(evaluationRoot, "jkb-football-evaluation-v1", "forward-rushing", "2026.jsonl");
    const rushingSummaryPath = join(evaluationRoot, "jkb-football-evaluation-v1", "forward-rushing-summary", "2026.json");
    expect(result.files_written).toEqual(expect.arrayContaining([rushingRowsPath, rushingSummaryPath]));

    const rushingRows = readFileSync(rushingRowsPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rushingRows).toHaveLength(1);
    expect(rushingRows[0].productionCarries).toBe(16); // from pred_final, not pred_early (10)

    const summary = JSON.parse(readFileSync(rushingSummaryPath, "utf8"));
    expect(summary.evaluated_player_games).toBe(1);
    expect(summary.production_carry_mae).toBeCloseTo(Math.abs(16 - 14));
    expect(summary.shadow_carry_mae).toBeCloseTo(Math.abs(15 - 14));
  });

  it("never writes to the prediction or outcome archive roots -- only under the evaluation root's forward-* namespaces", () => {
    const evaluationRoot = tempRoot("jkb-fwd-eval-immut-");
    seedWu3Fixtures(evaluationRoot, 2026);
    const result = runForwardEvaluationMaterializer({ season: 2026, evaluationRoot, generatedAt: "2026-09-15T00:00:00.000Z", dryRun: false });
    for (const file of result.files_written) {
      expect(file).toMatch(/[\\/]forward-(rushing|receiving)(-summary)?[\\/]/);
    }
    // The WU3 fixture files themselves must be untouched (still exactly 2 / 1 lines).
    const rushingFixture = readFileSync(join(evaluationRoot, "jkb-football-evaluation-v1", "rushing", "2026.jsonl"), "utf8").trim().split("\n");
    expect(rushingFixture).toHaveLength(2);
  });

  it("is idempotent: rerunning over the same WU3 input produces byte-identical forward datasets", () => {
    const evaluationRoot = tempRoot("jkb-fwd-eval-idem-");
    seedWu3Fixtures(evaluationRoot, 2026);
    const args = { season: 2026, evaluationRoot, generatedAt: "2026-09-15T00:00:00.000Z", dryRun: false } as const;
    runForwardEvaluationMaterializer(args);
    const rushingRowsPath = join(evaluationRoot, "jkb-football-evaluation-v1", "forward-rushing", "2026.jsonl");
    const firstRun = readFileSync(rushingRowsPath, "utf8");
    runForwardEvaluationMaterializer(args);
    const secondRun = readFileSync(rushingRowsPath, "utf8");
    expect(secondRun).toBe(firstRun);
  });

  it("dry-run computes results without writing any file", () => {
    const evaluationRoot = tempRoot("jkb-fwd-eval-dry-");
    seedWu3Fixtures(evaluationRoot, 2026);
    const result = runForwardEvaluationMaterializer({ season: 2026, evaluationRoot, generatedAt: "2026-09-15T00:00:00.000Z", dryRun: true });
    expect(result.files_written).toEqual([]);
    expect(existsSync(join(evaluationRoot, "jkb-football-evaluation-v1", "forward-rushing"))).toBe(false);
  });

  it("returns zero rows (not an error) when no WU3 evaluation files exist yet for the season", () => {
    const evaluationRoot = tempRoot("jkb-fwd-eval-empty-");
    const result = runForwardEvaluationMaterializer({ season: 2026, evaluationRoot, generatedAt: "2026-09-15T00:00:00.000Z", dryRun: true });
    expect(result.rushing_rows_read).toBe(0);
    expect(result.receiving_rows_read).toBe(0);
  });

  // WU4G.1 §6: the operational fix for a Week-1-shaped stale snapshot (the
  // real archive's only Sep-3 snapshot predates the shadow-diagnostic
  // wiring) is entirely point-in-time: once a later pregame run appends a
  // richer snapshot, the selector picks it automatically -- no mutation of
  // the immutable old snapshot is needed or attempted.
  it("selects the newer pregame snapshot's diagnostics over an older diagnostics-free snapshot for the same player/game", () => {
    const evaluationRoot = tempRoot("jkb-fwd-eval-stale-");
    const versionRoot = join(evaluationRoot, "jkb-football-evaluation-v1");
    mkdirSync(join(versionRoot, "rushing"), { recursive: true });
    const rows = [
      rushingFixtureRow({ predictionTimestamp: "2026-09-03T17:05:00.000Z", predictionId: "pred_stale", productionCarries: 15, allocationDiagnostics: null }),
      rushingFixtureRow({ predictionTimestamp: "2026-09-12T09:30:00.000Z", predictionId: "pred_fresh", productionCarries: 15, allocationDiagnostics: { projectedCarries: 13, roleConflictScore: 0.2, roleConflictFlag: false } }),
    ];
    writeFileSync(join(versionRoot, "rushing", "2026.jsonl"), `${rows.map((r) => canonicalJson(r as never)).join("\n")}\n`);

    const result = runForwardEvaluationMaterializer({ season: 2026, evaluationRoot, generatedAt: "2026-09-15T00:00:00.000Z", dryRun: false });
    expect(result.rushing_rows_selected).toBe(1);
    const written = readFileSync(join(versionRoot, "forward-rushing", "2026.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(written).toHaveLength(1);
    expect(written[0].shadowCarries).toBe(13); // from pred_fresh, not the diagnostics-free pred_stale
  });

  // WU4G.1 §8: WU2 outcomes are revisioned append-only, but WU3 always
  // materializes the LATEST canonical resolved outcome into its per-season
  // file (full overwrite, not append) -- so a later official-stat
  // correction that changes WU3's `rushing/<season>.jsonl` propagates
  // deterministically into a full, freshly-overwritten WU4G output the next
  // time this materializer runs. No duplicate/versioned WU4G row is ever
  // produced for the same player/game.
  it("deterministically reflects an official-stat correction: rerunning after WU3's rows change produces a different, fully-overwritten output", () => {
    const evaluationRoot = tempRoot("jkb-fwd-eval-correction-");
    const versionRoot = join(evaluationRoot, "jkb-football-evaluation-v1");
    mkdirSync(join(versionRoot, "rushing"), { recursive: true });
    const rushingPath = join(versionRoot, "rushing", "2026.jsonl");

    const before = [rushingFixtureRow({ predictionTimestamp: "2026-09-12T09:30:00.000Z", predictionId: "pred_a", productionCarries: 15, actualCarries: 14 })];
    writeFileSync(rushingPath, `${before.map((r) => canonicalJson(r as never)).join("\n")}\n`);
    const args = { season: 2026, evaluationRoot, generatedAt: "2026-09-15T00:00:00.000Z", dryRun: false } as const;
    runForwardEvaluationMaterializer(args);
    const forwardRowsPath = join(versionRoot, "forward-rushing", "2026.jsonl");
    const firstOutput = readFileSync(forwardRowsPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(firstOutput).toHaveLength(1);
    expect(firstOutput[0].actualCarries).toBe(14);

    // WU3 re-materializes with the corrected official stat (same prediction_id -- WU3 overwrites its file, does not append a revision row here).
    const corrected = [rushingFixtureRow({ predictionTimestamp: "2026-09-12T09:30:00.000Z", predictionId: "pred_a", productionCarries: 15, actualCarries: 17 })];
    writeFileSync(rushingPath, `${corrected.map((r) => canonicalJson(r as never)).join("\n")}\n`);
    runForwardEvaluationMaterializer(args);
    const secondOutput = readFileSync(forwardRowsPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(secondOutput).toHaveLength(1); // still exactly one row for this player/game -- no duplicate/versioned row
    expect(secondOutput[0].actualCarries).toBe(17);
  });
});
