import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { archiveProductionPredictions, finalizePredictionSnapshot, type PredictionSnapshotDraft } from "./lib/nfl-production-prediction-archive";
import { appendOutcomeDrafts, type OutcomeDraft } from "./lib/nfl-prediction-outcome-resolver";
import { serializeStarterCohort, type StarterCohortRecordV1 } from "./lib/nfl-starter-cohort";
import { outputPath, exclusionsOutputPath, loadStarterCohort } from "./generate-nfl-starter-prop-evaluations";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

const KICKOFF = "2026-09-13T17:00:00.000Z";
const GAME_ID = "2026_01_ATL_PIT";
const PLAYER_ID = "gsis:00-0000001";

function predictionDraft(overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotDraft {
  return {
    schema_version: "jkb-football-prediction-v1", snapshot_label: null,
    prediction_timestamp: "2026-09-03T17:05:21.000Z", created_at: "2026-09-03T17:05:22.000Z", mode: "production",
    sport: "football", league: "nfl", season: 2026, week: 1, slate_date: "2026-09-13", game_id: GAME_ID,
    kickoff_utc: KICKOFF, player_id: PLAYER_ID, player_name_at_prediction: "Test QB",
    team: "pit", opponent: "atl", home_away: "home", neutral_site: false, position: "QB", prediction_type: "passing",
    model_name: "nfl-passing-direct-ridge", model_version: "nfl-passing-direct-ridge-alpha10-production-2022-2025-v1",
    feature_schema_version: "nfl-qb-passing-feature-row-v1", pipeline_version: "nfl-production-prediction-archive-v1",
    code_revision: "abc", run_id: "run-1", workflow_name: "NFL Yardage Projections", workflow_run_id: "1",
    cutoff_policy: "slate_before_first_kickoff", status: "projected",
    projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 230, direct_model_prediction: 230 },
    feature_snapshot: {
      values: { matchup_score: { score: 55 } },
      source_manifest_hashes: { run: "hash-1" }, fitted_model_hash: "fitted-hash-1",
    },
    market_reference_status: "available",
    market_snapshot_refs: [{
      purpose: "comparison", market_type: "passing_yards", market_observation_id: "yardage_abc", content_hash: "hash-market-1",
      provider: "the-odds-api", sportsbook: "fanduel", observed_at: "2026-09-01T16:03:42.000Z", provider_updated_at: null,
      line: 220.5, over_price: -114, under_price: -114, side_prices: null, designation: "available_at_prediction",
    }],
    provenance: [{ kind: "source_manifest", logical_name: "inputs", content_hash: "hash-1" }],
    ...overrides,
  };
}

function cohortRow(overrides: Partial<StarterCohortRecordV1> = {}): StarterCohortRecordV1 {
  return {
    schema_version: "nfl-starter-cohort-v1", cohort_row_id: "starter_abc123", season: 2026, week: 1, game_id: GAME_ID,
    kickoff_time: KICKOFF, team: "pit", opponent: "atl", home_away: "home", player_id: PLAYER_ID, player_name: "Test QB",
    position: "QB", starter_eligible: true, starter_basis: "QB1_BY_ARCHIVED_DEPTH_CHART", starter_rank: 1,
    starter_metric: "depth_rank", starter_metric_value: 1, eligibility_prediction_timestamp: "2026-09-03T17:05:21.000Z",
    eligibility_model_version: "nfl-passing-direct-ridge-alpha10-production-2022-2025-v1", eligibility_prediction_id: "pred_eligibility",
    eligibility_source_type: "archived_depth_chart_role", role_source_updated_at: "2026-09-03T11:53:47.000Z",
    generated_at: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

function outcomeDraft(predictionId: string, overrides: Partial<OutcomeDraft> = {}): OutcomeDraft {
  return {
    schema_version: "jkb-football-prediction-outcome-v1", prediction_id: predictionId, snapshot_key: "snapshot-key",
    prediction_type: "passing", season: 2026, week: 1, game_id: GAME_ID, player_id: PLAYER_ID, team: "pit", opponent: "atl",
    recorded_at: "2026-09-14T02:00:00.000Z", resolved_at: "2026-09-14T02:00:00.000Z", resolution_status: "resolved",
    game_completion_status: "final", resolver_version: "nfl-prediction-outcome-resolver-v1", provider: "nflverse",
    source_artifacts: [], source_state_hash: "state-hash-1",
    identity_resolution: { method: "canonical_player_id_and_game_id", actual_team: "pit", actual_opponent: "atl", team_match: true, roster_status: null, zero_source: null },
    actual: { type: "passing", attempts: 30, completions: 20, yards: 250, yards_per_attempt: 8.3, touchdowns: 2, interceptions: 0 },
    derived: { type: "passing", yards_error: -20, absolute_yards_error: 20, attempts_error: null, ypa_error: null },
    ...overrides,
  };
}

describe("generate-nfl-starter-prop-evaluations CLI", () => {
  it("computes the expected output path", () => {
    expect(outputPath("/root", 2026, 1)).toBe(join("/root", "2026", "01.jsonl"));
  });

  it("returns an empty cohort when no cohort file exists yet", () => {
    const cohortRoot = tempRoot("jkb-starter-prop-cohort-missing-");
    expect(loadStarterCohort(cohortRoot, 2026, 1)).toEqual([]);
  });

  it("writes a deterministic, idempotent JSONL artifact joining cohort + predictions + outcomes", () => {
    const cohortRoot = tempRoot("jkb-starter-prop-cohort-");
    const predictionRoot = tempRoot("jkb-starter-prop-predictions-");
    const outcomeRoot = tempRoot("jkb-starter-prop-outcomes-");
    const outRoot = tempRoot("jkb-starter-prop-out-");

    const cohortDir = join(cohortRoot, "2026");
    mkdirSync(cohortDir, { recursive: true });
    writeFileSync(join(cohortDir, "01.jsonl"), serializeStarterCohort([cohortRow()]));

    const prediction = finalizePredictionSnapshot(predictionDraft());
    archiveProductionPredictions({ rootDir: predictionRoot, records: [prediction] });
    appendOutcomeDrafts({ rootDir: outcomeRoot, drafts: [outcomeDraft(prediction.prediction_id)] });

    const script = join(__dirname, "generate-nfl-starter-prop-evaluations.mts");
    const run = () =>
      execFileSync("npx", [
        "tsx", script, "--season=2026", "--week=1",
        `--cohort-root=${cohortRoot}`, `--prediction-root=${predictionRoot}`, `--outcome-root=${outcomeRoot}`, `--out-root=${outRoot}`,
        "--generated-at=2026-09-15T00:00:00.000Z",
      ], { cwd: join(__dirname, ".."), encoding: "utf8", shell: true });

    const firstLog = run();
    const path = outputPath(outRoot, 2026, 1);
    expect(existsSync(path)).toBe(true);
    const firstContent = readFileSync(path, "utf8");
    expect(firstContent).toContain("passing_yards");
    expect(firstContent).toContain("WIN");

    const exclusionsPath = exclusionsOutputPath(outRoot, 2026, 1);
    expect(existsSync(exclusionsPath)).toBe(true);
    expect(readFileSync(exclusionsPath, "utf8")).toBe("");

    run();
    const secondContent = readFileSync(path, "utf8");
    expect(secondContent).toBe(firstContent);
    expect(firstLog).toContain("gradeable=1");
  }, 30000);

  it("reports GAME_NOT_FINAL-style exclusions with zero gradeable rows when no outcome archive exists yet", () => {
    const cohortRoot = tempRoot("jkb-starter-prop-cohort-nf-");
    const predictionRoot = tempRoot("jkb-starter-prop-predictions-nf-");
    const outcomeRoot = tempRoot("jkb-starter-prop-outcomes-nf-");
    const outRoot = tempRoot("jkb-starter-prop-out-nf-");

    const cohortDir = join(cohortRoot, "2026");
    mkdirSync(cohortDir, { recursive: true });
    writeFileSync(join(cohortDir, "01.jsonl"), serializeStarterCohort([cohortRow()]));

    const prediction = finalizePredictionSnapshot(predictionDraft());
    archiveProductionPredictions({ rootDir: predictionRoot, records: [prediction] });

    const script = join(__dirname, "generate-nfl-starter-prop-evaluations.mts");
    const log = execFileSync("npx", [
      "tsx", script, "--season=2026", "--week=1",
      `--cohort-root=${cohortRoot}`, `--prediction-root=${predictionRoot}`, `--outcome-root=${outcomeRoot}`, `--out-root=${outRoot}`,
      "--generated-at=2026-09-15T00:00:00.000Z",
    ], { cwd: join(__dirname, ".."), encoding: "utf8", shell: true });

    expect(log).toContain("gradeable=0");
    expect(log).toContain("ACTUAL_UNRESOLVED");
    const path = outputPath(outRoot, 2026, 1);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("");

    const exclusionsPath = exclusionsOutputPath(outRoot, 2026, 1);
    expect(existsSync(exclusionsPath)).toBe(true);
    const exclusionsContent = readFileSync(exclusionsPath, "utf8");
    expect(exclusionsContent).toContain("ACTUAL_UNRESOLVED");
  }, 30000);
});
