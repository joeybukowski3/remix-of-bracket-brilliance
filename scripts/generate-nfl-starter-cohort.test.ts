import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { archiveProductionPredictions, finalizePredictionSnapshot, type PredictionSnapshotDraft } from "./lib/nfl-production-prediction-archive";
import { outputPath } from "./generate-nfl-starter-cohort";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

function draft(overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotDraft {
  return {
    schema_version: "jkb-football-prediction-v1", snapshot_label: null,
    prediction_timestamp: "2026-09-03T17:05:21.000Z", created_at: "2026-09-03T17:05:22.000Z", mode: "production",
    sport: "football", league: "nfl", season: 2026, week: 1, slate_date: "2026-09-13", game_id: "2026_01_ATL_PIT",
    kickoff_utc: "2026-09-13T17:00:00.000Z", player_id: "gsis:00-0000001", player_name_at_prediction: "Test QB",
    team: "pit", opponent: "atl", home_away: "home", neutral_site: false, position: "QB", prediction_type: "passing",
    model_name: "nfl-passing-direct-ridge", model_version: "nfl-passing-direct-ridge-alpha10-production-2022-2025-v1",
    feature_schema_version: "nfl-qb-passing-feature-row-v1", pipeline_version: "nfl-production-prediction-archive-v1",
    code_revision: "abc", run_id: "run-1", workflow_name: "NFL Yardage Projections", workflow_run_id: "1",
    cutoff_policy: "slate_before_first_kickoff", status: "projected",
    projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 230, direct_model_prediction: 230 },
    feature_snapshot: {
      values: { role: { depth_rank: 1, starter_flag: true, role_source_updated_at: "2026-09-03T11:53:47.000Z" } },
      source_manifest_hashes: { run: "hash-1" }, fitted_model_hash: "fitted-hash-1",
    },
    market_reference_status: "missing", market_snapshot_refs: [],
    provenance: [{ kind: "source_manifest", logical_name: "inputs", content_hash: "hash-1" }],
    ...overrides,
  };
}

describe("generate-nfl-starter-cohort CLI", () => {
  it("computes the expected output path", () => {
    expect(outputPath("/root", 2026, 1)).toBe(join("/root", "2026", "01.jsonl"));
    expect(outputPath("/root", 2026, 12)).toBe(join("/root", "2026", "12.jsonl"));
  });

  it("writes a deterministic, idempotent JSONL artifact from a real archive on disk", () => {
    const archiveRoot = tempRoot("jkb-starter-cohort-archive-");
    const outRoot = tempRoot("jkb-starter-cohort-out-");
    archiveProductionPredictions({ rootDir: archiveRoot, records: [finalizePredictionSnapshot(draft())] });

    const script = join(__dirname, "generate-nfl-starter-cohort.mts");
    const run = () =>
      execFileSync("npx", ["tsx", script, "--season=2026", "--week=1", `--archive-root=${archiveRoot}`, `--out-root=${outRoot}`, "--generated-at=2026-09-05T00:00:00.000Z"], {
        cwd: join(__dirname, ".."), encoding: "utf8", shell: true,
      });

    const firstLog = run();
    const path = outputPath(outRoot, 2026, 1);
    expect(existsSync(path)).toBe(true);
    const firstContent = readFileSync(path, "utf8");
    expect(firstContent).toContain("QB1_BY_ARCHIVED_DEPTH_CHART");

    run();
    const secondContent = readFileSync(path, "utf8");
    expect(secondContent).toBe(firstContent);
    expect(firstLog).toContain("rows=1");
  }, 30000);
});
