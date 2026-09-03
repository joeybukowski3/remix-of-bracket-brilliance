import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  archiveProductionPredictions,
  finalizePredictionSnapshot,
  type PredictionSnapshotDraft,
  type PredictionSnapshotV1,
} from "../../../scripts/lib/nfl-production-prediction-archive";
import {
  appendOutcomeDrafts,
  resolvePredictionOutcome,
  type ResolverSeasonSources,
} from "../../../scripts/lib/nfl-prediction-outcome-resolver";
import {
  selectLatestOutcome,
  serializeEvaluationRows,
  validateEvaluationRow,
} from "../../../scripts/lib/nfl-evaluation-dataset";
import { buildEvaluationRow } from "../../../scripts/lib/nfl-evaluation-rows";
import { computeMetricBlock, SAMPLE_SIZE_THRESHOLDS } from "../../../scripts/lib/nfl-evaluation-metrics";
import {
  materializeEvaluation,
  type MaterializerOptions,
} from "../../../scripts/lib/nfl-evaluation-materializer";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

type Type = "spread" | "passing" | "rushing" | "receiving" | "team_opportunity";

function draft(type: Type, overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotDraft {
  const isPlayer = type !== "spread" && type !== "team_opportunity";
  const projections = {
    spread: { type: "spread" as const, projected_home_margin: 4, projected_spread_team: "lar", projected_spread_line: -4, market_spread: -3.5, edge: 0.5, home_power_number: 6, away_power_number: 2 },
    passing: { type: "passing" as const, projected_attempts: null, projected_ypa: null, projected_passing_yards: 250, direct_model_prediction: 250 },
    rushing: { type: "rushing" as const, projected_carries: 12, projected_ypc: 4.5, projected_rushing_yards: 54 },
    receiving: { type: "receiving" as const, projected_targets: 8, projected_receptions: null, projected_yards_per_reception: null, projected_yards_per_target: 9, projected_receiving_yards: 72 },
    team_opportunity: { type: "team_opportunity" as const, projected_team_plays: 62, projected_dropback_rate: 0.58, projected_pass_attempts: 35.96, projected_rush_attempts: 26.04 },
  };
  return {
    schema_version: "jkb-football-prediction-v1", snapshot_label: null,
    prediction_timestamp: "2025-09-06T12:00:00.000Z", created_at: "2025-09-06T12:00:01.000Z", mode: "production",
    sport: "football", league: "nfl", season: 2025, week: 1, slate_date: "2025-09-07", game_id: "2025_01_ARI_LA",
    kickoff_utc: "2025-09-07T20:25:00.000Z", player_id: isPlayer ? "gsis:00-001" : null,
    player_name_at_prediction: isPlayer ? "Test Player" : null, team: "lar", opponent: "ari", home_away: "home", neutral_site: false,
    position: type === "passing" ? "QB" : type === "rushing" ? "RB" : type === "receiving" ? "WR" : null,
    prediction_type: type, model_name: `nfl-${type}`, model_version: `${type}-v1`, feature_schema_version: `${type}-features-v1`,
    pipeline_version: "archive-v1", code_revision: "abc", run_id: "run-1", workflow_name: null, workflow_run_id: null,
    cutoff_policy: "game_before_kickoff", status: "projected", projection: projections[type],
    feature_snapshot: {
      values: type === "team_opportunity" ? { feature_snapshot: { market: { spread: -3.5, total: 44.5 } } } : { spread_input: -3.5, role_certainty: "high" },
      source_manifest_hashes: { run: "source" }, fitted_model_hash: type === "spread" ? null : "fitted-a",
    },
    market_reference_status: "missing", market_snapshot_refs: [], provenance: [{ kind: "source_manifest", logical_name: "inputs", content_hash: "source" }],
    ...overrides,
  };
}
function prediction(type: Type, overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotV1 {
  return finalizePredictionSnapshot(draft(type, overrides));
}

function statRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    player_id: "00-001", game_id: "2025_01_ARI_LA", team: "LA", opponent_team: "AZ",
    attempts: "20", completions: "15", passing_yards: "240", passing_tds: "2", passing_interceptions: "1",
    carries: "10", rushing_yards: "45", targets: "8", receptions: "6", receiving_yards: "72", ...overrides,
  };
}

function sources(options: { homeScore?: number; awayScore?: number; stats?: Record<string, string>[] | null; final?: boolean; teamPlayVolume?: ResolverSeasonSources["teamPlayVolume"] } = {}): ResolverSeasonSources {
  const final = options.final ?? true;
  return {
    season: 2025,
    games: [{ gameId: "2025_01_ARI_LA", season: 2025, week: 1, homeAbbr: "LA", awayAbbr: "AZ", status: final ? "final" : "scheduled" }],
    results: final ? [{ gameId: "2025_01_ARI_LA", season: 2025, week: 1, homeAbbr: "LA", awayAbbr: "AZ", homeScore: options.homeScore ?? 24, awayScore: options.awayScore ?? 17, final: true }] : [],
    playerStats: options.stats === undefined ? [] : options.stats,
    rosters: [],
    teamPlayVolume: options.teamPlayVolume === undefined ? [] : options.teamPlayVolume,
    artifacts: {
      nfl_game_schedule: { logical_name: "nfl_game_schedule", path: "games.json", provider: "p", content_hash: "games-hash", source_updated_at: null },
      nfl_game_results: { logical_name: "nfl_game_results", path: "results.json", provider: "p", content_hash: "results-hash", source_updated_at: null },
      nfl_player_week_stats: { logical_name: "nfl_player_week_stats", path: "stats.csv", provider: "p", content_hash: "stats-hash", source_updated_at: null },
    },
  };
}

function marketRefs(type: Type, line: number) {
  const marketType = type === "spread" ? "spread" : (`${type === "passing" ? "passing" : type === "rushing" ? "rushing" : "receiving"}_yards` as const);
  return {
    market_reference_status: "available" as const,
    market_snapshot_refs: [{
      purpose: "comparison" as const, market_type: marketType, market_observation_id: "m1", content_hash: "mh",
      provider: "prov", sportsbook: "book", observed_at: "2025-09-05T12:00:00.000Z", provider_updated_at: null,
      line, over_price: -110, under_price: -110, side_prices: { home: -110, away: -110 }, designation: "available_at_prediction" as const,
    }],
  };
}

/** Resolve every prediction against `src` and append to a fresh temp outcome root. */
function outcomeRootFor(predictions: PredictionSnapshotV1[], src: ResolverSeasonSources, recordedAt = "2025-09-08T10:00:00.000Z"): string {
  const root = tempRoot("jkb-eval-out-");
  const drafts = predictions.map((p) => resolvePredictionOutcome(p, src, recordedAt));
  appendOutcomeDrafts({ rootDir: root, drafts });
  return root;
}

function predictionRootFor(predictions: PredictionSnapshotV1[]): string {
  const root = tempRoot("jkb-eval-pred-");
  archiveProductionPredictions({ rootDir: root, records: predictions });
  return root;
}

function opts(predictionRoot: string, outcomeRoot: string, over: Partial<MaterializerOptions> = {}): MaterializerOptions {
  return {
    predictionRoot, outcomeRoot, evaluationRoot: tempRoot("jkb-eval-ds-"), repoRoot: REPO_ROOT,
    season: 2025, week: null, predictionType: null, dryRun: false, ...over,
  };
}

// ---------------------------------------------------------------------------

describe("selectLatestOutcome", () => {
  it("returns null selection for an unresolved prediction with no events", () => {
    const sel = selectLatestOutcome([]);
    expect(sel.selected).toBeNull();
    expect(sel.outcome_revision_count).toBe(0);
  });

  it("selects the highest revision and preserves every superseded event", () => {
    const p = prediction("spread");
    const root = tempRoot("jkb-rev-");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ homeScore: 24, awayScore: 17 }), "t1")] });
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ homeScore: 27, awayScore: 17 }), "t2")] });
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ homeScore: 24, awayScore: 17 }), "t3")] }); // reverted
    const events = readFileSync(join(root, "2025", "01", "spread.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const sel = selectLatestOutcome(events);
    expect(sel.outcome_revision_count).toBe(3);
    expect(sel.selected_outcome_revision).toBe(3);
    expect(sel.selected?.actual?.type === "spread" && sel.selected.actual.margin).toBe(7); // reverted value wins deterministically
    expect(sel.superseded_outcome_ids).toHaveLength(2);
    expect(sel.chronology.map((c) => c.outcome_revision)).toEqual([1, 2, 3]);
  });
});

describe("join, revisions, and resolution-status handling", () => {
  it("joins the latest revision into the evaluable row and records selection provenance", () => {
    const p = prediction("spread");
    const outRoot = tempRoot("jkb-j-");
    appendOutcomeDrafts({ rootDir: outRoot, drafts: [resolvePredictionOutcome(p, sources({ homeScore: 24, awayScore: 17 }), "t1")] });
    appendOutcomeDrafts({ rootDir: outRoot, drafts: [resolvePredictionOutcome(p, sources({ homeScore: 30, awayScore: 17 }), "t2")] });
    const events = readFileSync(join(outRoot, "2025", "01", "spread.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const built = buildEvaluationRow(p, events, { divisionGame: null });
    expect(built.row?.prediction_type).toBe("spread");
    expect(built.row && built.row.prediction_type === "spread" && built.row.outcome.actual.home_margin).toBe(13);
    expect(built.row?.outcome.selected_outcome_revision).toBe(2);
    expect(built.row?.outcome.outcome_revision_count).toBe(2);
    expect(built.row?.outcome.superseded_outcome_ids).toHaveLength(1);
    expect(() => built.row && validateEvaluationRow(built.row)).not.toThrow();
  });

  it("excludes an unresolved prediction from the evaluable dataset but keeps a ledger row", () => {
    const p = prediction("spread");
    const built = buildEvaluationRow(p, [resolvePredictionOutcome(p, sources({ final: false }))].map((d) => ({ ...d, outcome_id: "outcome_x", outcome_revision: 1, supersedes_outcome_id: null })), { divisionGame: null });
    expect(built.row).toBeNull();
    expect(built.ledger.ledger_status).toBe("pending_game");
    expect(built.ledger.evaluable).toBe(false);
  });

  it("synthesizes an unresolved_missing_event ledger status when no outcome exists", () => {
    const built = buildEvaluationRow(prediction("spread"), [], { divisionGame: null });
    expect(built.row).toBeNull();
    expect(built.ledger.ledger_status).toBe("unresolved_missing_event");
    expect(built.ledger.note).toMatch(/resolver/);
  });

  it("routes an inactive player prediction to the ledger only", () => {
    const p = prediction("rushing");
    // roster INA with published game stats for another player -> inactive
    const src: ResolverSeasonSources = { ...sources({ stats: [statRow({ player_id: "00-cover" })] }), rosters: [{ season: "2025", week: "1", gsis_id: "00-001", team: "LA", status: "INA" }] };
    const draftEv = resolvePredictionOutcome(p, src);
    expect(draftEv.resolution_status).toBe("inactive");
    const root = tempRoot("jkb-ina-");
    appendOutcomeDrafts({ rootDir: root, drafts: [draftEv] });
    const events = readFileSync(join(root, "2025", "01", "rushing.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const built = buildEvaluationRow(p, events, { divisionGame: null });
    expect(built.row).toBeNull();
    expect(built.ledger.ledger_status).toBe("inactive");
  });
});

describe("multiple point-in-time snapshots", () => {
  it("produces one evaluable row per legitimate snapshot, each joined to the same final outcome", () => {
    const wed = prediction("rushing", { prediction_timestamp: "2025-09-03T12:00:00.000Z", run_id: "wed", projection: { type: "rushing", projected_carries: 11, projected_ypc: 4.4, projected_rushing_yards: 48 } });
    const sun = prediction("rushing", { prediction_timestamp: "2025-09-07T13:00:00.000Z", run_id: "sun", projection: { type: "rushing", projected_carries: 13, projected_ypc: 4.6, projected_rushing_yards: 60 } });
    expect(wed.prediction_id).not.toBe(sun.prediction_id);
    const src = sources({ stats: [statRow({ carries: "12", rushing_yards: "54" })] });
    const predRoot = predictionRootFor([wed, sun]);
    const outRoot = outcomeRootFor([wed, sun], src);
    const result = materializeEvaluation(opts(predRoot, outRoot));
    expect(result.evaluable_by_type.rushing).toBe(2);
    const rushingFile = readFileSync(result.files_written.find((f) => f.includes("rushing"))!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rushingFile).toHaveLength(2);
    expect(new Set(rushingFile.map((r) => r.outcome.actual.yards))).toEqual(new Set([54]));
    expect(rushingFile.map((r) => r.hours_to_kickoff).sort((a: number, b: number) => a - b)).toEqual([7.42, 104.42]);
  });
});

describe("spread evaluation rows", () => {
  const p = prediction("spread", { projection: { type: "spread", projected_home_margin: 6, projected_spread_team: "lar", projected_spread_line: -6, market_spread: -3.5, edge: 2.5, home_power_number: 8, away_power_number: 2 }, ...marketRefs("spread", -3) });
  const events = () => {
    const root = tempRoot("jkb-sp-");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ homeScore: 20, awayScore: 17 }))] });
    return readFileSync(join(root, "2025", "01", "spread.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  };

  it("computes margin error with projection-minus-actual sign and winner correctness", () => {
    const row = buildEvaluationRow(p, events(), { divisionGame: false }).row!;
    expect(row.prediction_type === "spread" && row.outcome.error.margin_error).toBe(3); // 6 - 3
    expect(row.prediction_type === "spread" && row.outcome.error.absolute_margin_error).toBe(3);
    expect(row.prediction_type === "spread" && row.outcome.error.projected_winner_correct).toBe(true);
    expect(row.prediction_type === "spread" && row.outcome.error.actual_margin_direction).toBe("home");
  });

  it("derives JKB-vs-market edge as projected_home_margin minus market implied margin", () => {
    const row = buildEvaluationRow(p, events(), { divisionGame: false }).row!;
    const obs = row.prediction_type === "spread" ? row.outcome.market.observations[0] : null;
    expect(obs?.market_implied_home_margin).toBe(3); // -(-3)
    expect(obs?.jkb_vs_market_edge).toBe(3); // 6 - 3
    expect(obs?.jkb_side).toBe("home");
    expect(obs?.ats_result).toBe("push"); // home line -3, home won by exactly 3 => cover margin 0 => push
  });

  it("exposes market MAE alongside JKB MAE in the metric block", () => {
    const rows = [buildEvaluationRow(p, events(), { divisionGame: false }).row!];
    const block = computeMetricBlock("spread", rows);
    expect((block.market_comparison as Record<string, unknown>).comparable_n).toBe(1);
    expect((block.market_comparison as Record<string, unknown>).jkb_mae).toBe(3);
    expect((block.market_comparison as Record<string, unknown>).market_mae).toBe(0); // implied 3 vs actual 3
  });

  it("buckets the spread edge into diagnostic cohorts", () => {
    const row = buildEvaluationRow(p, events(), { divisionGame: false }).row!;
    expect(row.cohorts.spread_edge_bucket_abs).toBe("3-4"); // |6 - 3| = 3
  });
});

describe("passing / rushing / receiving evaluation rows", () => {
  it("passing: yards error, preserved fitted vector, null component errors when legs not projected", () => {
    const p = prediction("passing", { feature_snapshot: { values: { x: 1 }, ordered_vector: [1, 2, 3], imputation_flags: { x: "mean" }, source_manifest_hashes: { run: "s" }, fitted_model_hash: "fit-1" }, ...marketRefs("passing", 245.5) });
    const root = tempRoot("jkb-pa-");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ stats: [statRow({ attempts: "30", passing_yards: "265" })] }))] });
    const events = readFileSync(join(root, "2025", "01", "passing.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const row = buildEvaluationRow(p, events, { divisionGame: null }).row!;
    if (row.prediction_type !== "passing") throw new Error("type");
    expect(row.outcome.error.yards_error).toBe(-15); // 250 - 265
    expect(row.outcome.error.attempts_error).toBeNull();
    expect(row.outcome.error.ypa_error).toBeNull();
    expect(row.fitted_ordered_vector).toEqual([1, 2, 3]);
    expect(row.imputation_flags).toEqual({ x: "mean" });
    expect(row.outcome.market?.jkb_vs_market_edge).toBe(4.5); // 250 - 245.5
    expect(row.outcome.market?.over_under_result).toBe("over"); // 265 > 245.5
  });

  it("rushing: carries/ypc/yards error and null YPC error on a zero-carry actual", () => {
    const p = prediction("rushing");
    const root = tempRoot("jkb-ru-");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ stats: [statRow({ carries: "0", rushing_yards: "0" })] }))] });
    const events = readFileSync(join(root, "2025", "01", "rushing.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const row = buildEvaluationRow(p, events, { divisionGame: null }).row!;
    if (row.prediction_type !== "rushing") throw new Error("type");
    expect(row.outcome.error.carries_error).toBe(12);
    expect(row.outcome.error.ypc_error).toBeNull();
    expect(row.outcome.volume.zero_volume).toBe(true);
    expect(row.feature_snapshot_values).toEqual({ spread_input: -3.5, role_certainty: "high" });
  });

  it("WU4D.2: role-transition candidate cohorts (team_changed/no_history/limited_history/role_sourced/depth_chart_rank/starter_flag) surface as candidate__* when present in feature_snapshot.values", () => {
    const p = prediction("rushing", {
      feature_snapshot: {
        values: { spread_input: -3.5, role_certainty: "high", team_changed: true, no_history: false, limited_history: false, role_sourced: true, depth_chart_rank: 1, starter_flag: true },
        source_manifest_hashes: { run: "source" }, fitted_model_hash: "fitted-a",
      },
    });
    const root = tempRoot("jkb-ru-cohort-");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ stats: [statRow()] }))] });
    const events = readFileSync(join(root, "2025", "01", "rushing.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const row = buildEvaluationRow(p, events, { divisionGame: null }).row!;
    expect(row.cohorts.candidate__team_changed).toBe(true);
    expect(row.cohorts.candidate__no_history).toBe(false);
    expect(row.cohorts.candidate__limited_history).toBe(false);
    expect(row.cohorts.candidate__role_sourced).toBe(true);
    expect(row.cohorts.candidate__depth_chart_rank).toBe(1);
    expect(row.cohorts.candidate__starter_flag).toBe(true);
  });

  it("WU4D.4: rushing shadow allocator's role_conflict flag surfaces as candidate__role_conflict, and the full allocation_diagnostics object is preserved raw in feature_snapshot_values", () => {
    const shadowDiagnostics = {
      allocationModelVersion: "nfl-rushing-role-allocation-shadow-v1.0.0", historicalSharePrior: 0.55, roleSharePrior: 0.28,
      finalProjectedShare: 0.2, projectedCarries: 4.6, roleConflictScore: 0.27, roleConflictFlag: true, teamChangeCalibrationApplied: true,
      roleConfidenceEvidence: { depthRank: 2, roleSourced: true, teamChanged: true, noHistory: false, limitedHistory: false, priorGamesPlayed: 0, rosterCompetitionCount: null },
    };
    const p = prediction("rushing", {
      feature_snapshot: {
        values: { spread_input: -3.5, role_certainty: "high", role_conflict: true, allocation_diagnostics: shadowDiagnostics },
        source_manifest_hashes: { run: "source" }, fitted_model_hash: "fitted-a",
      },
    });
    const root = tempRoot("jkb-ru-conflict-");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ stats: [statRow()] }))] });
    const events = readFileSync(join(root, "2025", "01", "rushing.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const row = buildEvaluationRow(p, events, { divisionGame: null }).row!;
    expect(row.cohorts.candidate__role_conflict).toBe(true);
    expect(row.feature_snapshot_values.allocation_diagnostics).toEqual(shadowDiagnostics);
  });

  it("receiving: targets/ypt/yards error, zero-target behavior, missing projected receptions handled", () => {
    const p = prediction("receiving");
    const root = tempRoot("jkb-re-");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ stats: [statRow({ targets: "0", receptions: "0", receiving_yards: "0" })] }))] });
    const events = readFileSync(join(root, "2025", "01", "receiving.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const row = buildEvaluationRow(p, events, { divisionGame: null }).row!;
    if (row.prediction_type !== "receiving") throw new Error("type");
    expect(row.outcome.error.targets_error).toBe(8);
    expect(row.outcome.error.yards_per_target_error).toBeNull();
    expect(row.outcome.error.receptions_error).toBeNull(); // projected_receptions null
    expect(row.outcome.volume.zero_volume).toBe(true);
  });
});

describe("metrics: guards and grouping", () => {
  function spreadRowWith(margin: number, projected: number): ReturnType<typeof buildEvaluationRow>["row"] {
    const p = prediction("spread", { run_id: `r${projected}${margin}`, projection: { type: "spread", projected_home_margin: projected, projected_spread_team: "lar", projected_spread_line: -projected, market_spread: null, edge: null, home_power_number: 5, away_power_number: 1 } });
    const root = tempRoot("jkb-m-");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(p, sources({ homeScore: 20 + margin, awayScore: 20 }))] });
    const events = readFileSync(join(root, "2025", "01", "spread.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    return buildEvaluationRow(p, events, { divisionGame: null }).row;
  }

  it("computes MAE and bias with the mean(prediction-actual) sign", () => {
    const rows = [spreadRowWith(3, 7)!, spreadRowWith(10, 4)!]; // errors +4, -6
    const block = computeMetricBlock("spread", rows);
    expect(block.mae).toBe(5);
    expect(block.bias).toBe(-1);
  });

  it("suppresses correlation below the sample threshold", () => {
    const rows = [spreadRowWith(3, 7)!, spreadRowWith(1, 2)!];
    const block = computeMetricBlock("spread", rows);
    expect(block.correlation).toBeNull();
    expect(block.correlation_insufficient_sample).toBe(true);
    expect(block.small_sample).toBe(true);
  });

  it("suppresses winner accuracy percentage below the rate threshold but still reports counts", () => {
    const rows = Array.from({ length: 5 }, (_, i) => spreadRowWith(3, 3 + i)!);
    const block = computeMetricBlock("spread", rows);
    const winner = block.winner_accuracy as Record<string, unknown>;
    expect(winner.total).toBe(5);
    expect(winner.accuracy).toBeNull();
    expect(winner.insufficient_sample).toBe(true);
  });

  it("groups by model version and fitted state in the summary", () => {
    const a = prediction("passing", { model_version: "passing-v1", feature_snapshot: { values: { x: 1 }, ordered_vector: [1], source_manifest_hashes: { run: "s" }, fitted_model_hash: "fit-A" } });
    const b = prediction("passing", { model_version: "passing-v1", run_id: "r2", feature_snapshot: { values: { x: 2 }, ordered_vector: [2], source_manifest_hashes: { run: "s" }, fitted_model_hash: "fit-B" } });
    const predRoot = predictionRootFor([a, b]);
    const outRoot = outcomeRootFor([a, b], sources({ stats: [statRow()] }));
    const result = materializeEvaluation(opts(predRoot, outRoot));
    const summary = JSON.parse(readFileSync(result.files_written.find((f) => f.includes("summary"))!, "utf8"));
    expect(summary.metrics.by_fitted_state.filter((e: { prediction_type: string }) => e.prediction_type === "passing")).toHaveLength(2);
    expect(summary.metrics.by_model_version.filter((e: { prediction_type: string }) => e.prediction_type === "passing")).toHaveLength(1);
  });
});

describe("determinism and source integrity", () => {
  it("produces byte-identical output on an exact rerun and never touches source files", () => {
    const preds = [
      prediction("spread", marketRefs("spread", -3)),
      prediction("passing", { feature_snapshot: { values: { x: 1 }, ordered_vector: [1, 2], source_manifest_hashes: { run: "s" }, fitted_model_hash: "f" } }),
    ];
    const predRoot = predictionRootFor(preds);
    const src = sources({ stats: [statRow()] });
    const outRoot = outcomeRootFor(preds, src);

    const predFile = join(predRoot, "2025", "01", "nfl-spread.jsonl");
    const outFile = join(outRoot, "2025", "01", "spread.jsonl");
    const predBefore = readFileSync(predFile, "utf8");
    const outBefore = readFileSync(outFile, "utf8");
    const predMtime = statSync(predFile).mtimeMs;

    const o = opts(predRoot, outRoot);
    const first = materializeEvaluation(o);
    const firstBytes = first.files_written.map((f) => readFileSync(f, "utf8"));
    const second = materializeEvaluation({ ...o, evaluationRoot: o.evaluationRoot });
    const secondBytes = second.files_written.map((f) => readFileSync(f, "utf8"));
    expect(secondBytes).toEqual(firstBytes);

    expect(readFileSync(predFile, "utf8")).toBe(predBefore);
    expect(readFileSync(outFile, "utf8")).toBe(outBefore);
    expect(statSync(predFile).mtimeMs).toBe(predMtime);
  });

  it("serializeEvaluationRows emits an empty string for an empty dataset (valid empty rerun)", () => {
    expect(serializeEvaluationRows([])).toBe("");
  });

  it("dry-run writes nothing", () => {
    const preds = [prediction("spread")];
    const predRoot = predictionRootFor(preds);
    const outRoot = outcomeRootFor(preds, sources());
    const result = materializeEvaluation(opts(predRoot, outRoot, { dryRun: true }));
    expect(result.files_written).toEqual([]);
    expect(result.evaluable_rows).toBe(1);
  });
});

describe("controlled multi-model fixture (WU3 Part 20)", () => {
  it("materializes a full fixture with correct counts, revision selection, buckets, and a deterministic rerun", () => {
    const spreadA = prediction("spread", { model_name: "jkb-power-number", model_version: "jkb-power-number-v1.0.0", ...marketRefs("spread", -3) });
    const spreadB = prediction("spread", { model_name: "nfl-spread-alt", model_version: "alt-v0.1.0", run_id: "altrun", projection: { type: "spread", projected_home_margin: 1, projected_spread_team: "lar", projected_spread_line: -1, market_spread: -3, edge: -2, home_power_number: 3, away_power_number: 2 } });
    const passing = prediction("passing", { feature_snapshot: { values: { role: "starter" }, ordered_vector: [1, 2, 3, 4], source_manifest_hashes: { run: "s" }, fitted_model_hash: "fit-1" }, ...marketRefs("passing", 240.5) });
    const rushing = prediction("rushing");
    const receiving = prediction("receiving");
    const rbWed = prediction("rushing", { player_id: "gsis:00-002", player_name_at_prediction: "RB Two", prediction_timestamp: "2025-09-03T12:00:00.000Z", run_id: "wed", projection: { type: "rushing", projected_carries: 10, projected_ypc: 6.3, projected_rushing_yards: 63 } });
    const rbSun = prediction("rushing", { player_id: "gsis:00-002", player_name_at_prediction: "RB Two", prediction_timestamp: "2025-09-07T13:00:00.000Z", run_id: "sun", projection: { type: "rushing", projected_carries: 11, projected_ypc: 6.5, projected_rushing_yards: 71 } });
    const pendingPlayer = prediction("receiving", { player_id: "gsis:00-003", player_name_at_prediction: "WR Three", run_id: "pend" });

    const all = [spreadA, spreadB, passing, rushing, receiving, rbWed, rbSun, pendingPlayer];
    const predRoot = predictionRootFor(all);

    const stats = [
      statRow({ player_id: "00-001" }),
      statRow({ player_id: "00-002", carries: "12", rushing_yards: "68" }),
    ]; // 00-003 has no stat row and no roster evidence -> pending_player_stats
    const src = sources({ homeScore: 20, awayScore: 17, stats });

    const outRoot = tempRoot("jkb-fx-out-");
    // one corrected outcome revision on the passing prediction
    appendOutcomeDrafts({ rootDir: outRoot, drafts: all.map((p) => resolvePredictionOutcome(p, sources({ homeScore: 20, awayScore: 17, stats: [statRow({ player_id: "00-001", passing_yards: "230" }), statRow({ player_id: "00-002", carries: "12", rushing_yards: "68" })] }), "2025-09-08T10:00:00.000Z")) });
    appendOutcomeDrafts({ rootDir: outRoot, drafts: [resolvePredictionOutcome(passing, src, "2025-09-09T10:00:00.000Z")] }); // passing_yards corrected 230 -> 240

    const o = opts(predRoot, outRoot);
    const result = materializeEvaluation(o);

    expect(result.evaluable_by_type).toMatchObject({ spread: 2, passing: 1, rushing: 3, receiving: 1 });
    expect(result.ledger_by_status.pending_player_stats).toBe(1);
    expect(result.ledger_rows).toBe(8);

    const passingRows = readFileSync(result.files_written.find((f) => f.includes("passing"))!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(passingRows).toHaveLength(1);
    expect(passingRows[0].outcome.selected_outcome_revision).toBe(2);
    expect(passingRows[0].outcome.outcome_revision_count).toBe(2);
    expect(passingRows[0].outcome.actual.yards).toBe(240);
    expect(passingRows[0].outcome.error.yards_error).toBe(10); // 250 - 240

    const rushingRows = readFileSync(result.files_written.find((f) => f.includes("rushing"))!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rushingRows).toHaveLength(3);

    const ledgerRows = readFileSync(result.files_written.find((f) => f.includes("resolution-status"))!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(ledgerRows.find((r) => r.player_id === "gsis:00-003").ledger_status).toBe("pending_player_stats");
    expect(ledgerRows.filter((r) => r.evaluable)).toHaveLength(7);

    const firstBytes = result.files_written.map((f) => readFileSync(f, "utf8"));
    const rerun = materializeEvaluation(o);
    expect(rerun.files_written.map((f) => readFileSync(f, "utf8"))).toEqual(firstBytes);
  });
});

describe("team_opportunity evaluation rows (WU4C.1)", () => {
  it("builds an evaluable row with honest dropback/designed-rush naming and no player market field", () => {
    const teamOpp = prediction("team_opportunity", { team: "lar", opponent: "ari" });
    const src = sources({ teamPlayVolume: [{ gameId: "2025_01_ARI_LA", season: 2025, week: 1, team: "LA", opponent: "AZ", eligiblePlays: 60, passPlays: 33, rushPlays: 27 }] });
    const draft = resolvePredictionOutcome(teamOpp, src, "2025-09-08T10:00:00.000Z");
    expect(draft.resolution_status).toBe("resolved");
    const { events } = appendOutcomeDrafts({ rootDir: tempRoot("jkb-teamopp-out-"), drafts: [draft] });
    const built = buildEvaluationRow(teamOpp, events, { divisionGame: null });
    expect(built.row).not.toBeNull();
    const row = built.row!;
    expect(row.prediction_type).toBe("team_opportunity");
    expect("market" in row.outcome).toBe(false);
    expect(row.outcome).toMatchObject({
      actual: { team_plays: 60, dropbacks: 33, dropback_rate: 0.55, designed_rush_attempts: 27 },
      projection: { projected_team_plays: 62, projected_dropback_rate: 0.58 },
    });
    expect(row.cohorts).toMatchObject({ home_away: "home", favorite_underdog: "favorite" });
    expect(row.cohorts.spread_bucket_abs).toBe("3-4");
    expect(row.cohorts.total_bucket).toBe("44-51");
    validateEvaluationRow(row);
  });

  it("keeps a game with no play-volume row yet in the ledger as pending_team_stats, not evaluable", () => {
    const teamOpp = prediction("team_opportunity", { team: "lar", opponent: "ari" });
    const draft = resolvePredictionOutcome(teamOpp, sources({ teamPlayVolume: [] }), "2025-09-08T10:00:00.000Z");
    expect(draft.resolution_status).toBe("pending_team_stats");
    const { events } = appendOutcomeDrafts({ rootDir: tempRoot("jkb-teamopp-out-"), drafts: [draft] });
    const built = buildEvaluationRow(teamOpp, events, { divisionGame: null });
    expect(built.row).toBeNull();
    expect(built.ledger.ledger_status).toBe("pending_team_stats");
    expect(built.ledger.evaluable).toBe(false);
  });

  it("materializes team_opportunity end to end, independent of a player-stat outage, with a stable rerun", () => {
    const home = prediction("team_opportunity", { team: "lar", opponent: "ari", home_away: "home" });
    const away = prediction("team_opportunity", { team: "ari", opponent: "lar", home_away: "away", run_id: "run-away" });
    const predRoot = predictionRootFor([home, away]);
    const src = sources({
      stats: null, // player-week stats entirely unavailable this run
      teamPlayVolume: [
        { gameId: "2025_01_ARI_LA", season: 2025, week: 1, team: "LA", opponent: "AZ", eligiblePlays: 60, passPlays: 33, rushPlays: 27 },
        { gameId: "2025_01_ARI_LA", season: 2025, week: 1, team: "AZ", opponent: "LA", eligiblePlays: 58, passPlays: 31, rushPlays: 27 },
      ],
    });
    const outRoot = outcomeRootFor([home, away], src);
    const o = opts(predRoot, outRoot);
    const result = materializeEvaluation(o);
    expect(result.evaluable_by_type.team_opportunity).toBe(2);
    const rows = readFileSync(result.files_written.find((f) => f.includes("team_opportunity"))!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.prediction_type === "team_opportunity" && r.player_id === null)).toBe(true);

    const firstBytes = result.files_written.map((f) => readFileSync(f, "utf8"));
    const rerun = materializeEvaluation(o);
    expect(rerun.files_written.map((f) => readFileSync(f, "utf8"))).toEqual(firstBytes);
  });
});
