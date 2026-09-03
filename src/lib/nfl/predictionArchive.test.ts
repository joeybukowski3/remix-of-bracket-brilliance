import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  archiveProductionPredictions, buildFittedModelManifest, buildSourceManifest, canonicalJson, contentHash,
  finalizePredictionSnapshot, validatePredictionSnapshot, type PredictionSnapshotDraft,
} from "../../../scripts/lib/nfl-production-prediction-archive";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "jkb-predictions-"));
  tempDirs.push(root);
  return root;
}

function draft(overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotDraft {
  return {
    schema_version: "jkb-football-prediction-v1", snapshot_label: null,
    prediction_timestamp: "2026-09-10T12:00:00.000Z", created_at: "2026-09-10T12:00:01.000Z", mode: "production",
    sport: "football", league: "nfl", season: 2026, week: 1, slate_date: "2026-09-13", game_id: "2026_01_ARI_LAC",
    kickoff_utc: "2026-09-13T20:25:00.000Z", player_id: null, player_name_at_prediction: null,
    team: "lac", opponent: "ari", home_away: "home", neutral_site: false, position: null, prediction_type: "spread",
    model_name: "jkb-power-number", model_version: "jkb-power-number-v1.0.0", feature_schema_version: "spread-features-v1",
    pipeline_version: "archive-v1", code_revision: "abc", run_id: "run-1", workflow_name: null, workflow_run_id: null,
    cutoff_policy: "game_before_kickoff", status: "projected",
    projection: { type: "spread", projected_home_margin: 4.25, projected_spread_team: "lac", projected_spread_line: -4.3, market_spread: -3.5, edge: 0.75 },
    feature_snapshot: { values: { home_ovr: 70, away_ovr: 60 }, source_manifest_hashes: { run: "source-hash" }, fitted_model_hash: null },
    market_reference_status: "missing", market_snapshot_refs: [],
    provenance: [{ kind: "source_manifest", logical_name: "inputs", content_hash: "source-hash" }],
    ...overrides,
  };
}

describe("canonical serialization and fingerprints", () => {
  it("serializes object keys deterministically", () => {
    expect(canonicalJson({ z: 1, a: { d: 2, b: 3 } })).toBe('{"a":{"b":3,"d":2},"z":1}');
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });

  it("rejects non-finite feature data", () => {
    expect(() => canonicalJson({ bad: Number.NaN })).toThrow(/finite/);
  });

  it("keeps fitted fingerprints stable and changes them with fitted state", () => {
    const base = { model_name: "passing", model_version: "v1", training_seasons: [2022, 2023], feature_schema_version: "f1", feature_order: ["x"], parameters: { alpha: 10 }, fitted_state: { coefficients: [1.5] } };
    expect(buildFittedModelManifest(base).hash).toBe(buildFittedModelManifest({ ...base }).hash);
    expect(buildFittedModelManifest(base).hash).not.toBe(buildFittedModelManifest({ ...base, fitted_state: { coefficients: [1.6] } }).hash);
  });

  it("hashes source content and document metadata", () => {
    const one = buildSourceManifest("run", [{ logicalName: "schedule", path: "games.json", content: '{"schemaVersion":"g1","_meta":{"generatedAt":"2026-09-01T00:00:00.000Z"}}' }]);
    const two = buildSourceManifest("run", [{ logicalName: "schedule", path: "games.json", content: '{"schemaVersion":"g1","_meta":{"generatedAt":"2026-09-01T00:00:00.000Z"},"changed":true}' }]);
    expect(one.manifest.sources[0]).toMatchObject({ schema_version: "g1", generated_at: "2026-09-01T00:00:00.000Z" });
    expect(one.hash).not.toBe(two.hash);
  });
});

describe("prediction validation", () => {
  it("accepts a valid record", () => expect(() => validatePredictionSnapshot(finalizePredictionSnapshot(draft()))).not.toThrow());

  it("rejects malformed records", () => {
    expect(() => finalizePredictionSnapshot(draft({ model_version: "" }))).toThrow(/model_version/);
  });

  it("requires a fitted state for passing", () => {
    expect(() => finalizePredictionSnapshot(draft({ prediction_type: "passing", player_id: "gsis:1", position: "QB", projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 250, direct_model_prediction: 250 } }))).toThrow(/fitted_model_hash/);
  });

  it("rejects future market observations", () => {
    expect(() => finalizePredictionSnapshot(draft({ market_reference_status: "available", market_snapshot_refs: [{ purpose: "comparison", market_type: "spread", market_observation_id: "m1", content_hash: "h", provider: "p", sportsbook: "b", observed_at: "2026-09-10T12:00:00.001Z", provider_updated_at: null, line: -3.5, over_price: null, under_price: null, side_prices: null, designation: "available_at_prediction" }] }))).toThrow(/after prediction/);
  });

  it("represents missing market data explicitly", () => {
    const record = finalizePredictionSnapshot(draft());
    expect(record.market_reference_status).toBe("missing");
    expect(record.market_snapshot_refs).toEqual([]);
  });
});

describe("append-only filesystem behavior", () => {
  it("is idempotent for an exact logical rerun even when run timestamps differ", () => {
    const root = tempRoot();
    const first = finalizePredictionSnapshot(draft());
    const retry = finalizePredictionSnapshot(draft({ prediction_timestamp: "2026-09-10T12:01:00.000Z", created_at: "2026-09-10T12:01:01.000Z", run_id: "run-2" }));
    expect(retry.prediction_id).toBe(first.prediction_id);
    expect(archiveProductionPredictions({ rootDir: root, records: [first] })).toMatchObject({ appended: 1, duplicates: 0 });
    expect(archiveProductionPredictions({ rootDir: root, records: [retry] })).toMatchObject({ appended: 0, duplicates: 1 });
    const lines = readFileSync(join(root, "2026", "01", "jkb-power-number.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("appends a materially distinct same-game state and preserves the old snapshot", () => {
    const root = tempRoot();
    const early = finalizePredictionSnapshot(draft());
    const later = finalizePredictionSnapshot(draft({ prediction_timestamp: "2026-09-12T12:00:00.000Z", run_id: "run-2", projection: { type: "spread", projected_home_margin: 5, projected_spread_team: "lac", projected_spread_line: -5, market_spread: -4, edge: 1 } }));
    expect(later.prediction_id).not.toBe(early.prediction_id);
    archiveProductionPredictions({ rootDir: root, records: [early] });
    expect(archiveProductionPredictions({ rootDir: root, records: [later] })).toMatchObject({ appended: 1, duplicates: 0 });
    const records = readFileSync(join(root, "2026", "01", "jkb-power-number.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(records.map((record) => record.projection.projected_home_margin)).toEqual([4.25, 5]);
  });
});

describe("team_opportunity prediction type (WU4A extension)", () => {
  function teamOppDraft(overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotDraft {
    return draft({
      prediction_type: "team_opportunity",
      player_id: null,
      position: null,
      model_name: "nfl-team-opportunity",
      model_version: "nfl-team-opportunity-ridge-market-v1.0.0",
      feature_schema_version: "nfl-team-opportunity-feature-row-v1",
      projection: { type: "team_opportunity", projected_team_plays: 64, projected_dropback_rate: 0.6, projected_pass_attempts: 38.4, projected_rush_attempts: 25.6 },
      feature_snapshot: { values: { spread: -3 }, source_manifest_hashes: { run: "source-hash" }, fitted_model_hash: "fitted-hash" },
      ...overrides,
    });
  }

  it("accepts a coherent team_opportunity snapshot", () => {
    expect(() => validatePredictionSnapshot(finalizePredictionSnapshot(teamOppDraft()))).not.toThrow();
  });

  it("requires a fitted_model_hash", () => {
    expect(() => finalizePredictionSnapshot(teamOppDraft({ feature_snapshot: { values: {}, source_manifest_hashes: { run: "h" }, fitted_model_hash: null } }))).toThrow(/fitted_model_hash/);
  });

  it("rejects a carried player_id", () => {
    expect(() => finalizePredictionSnapshot(teamOppDraft({ player_id: "gsis:1" }))).toThrow(/must not carry a player_id/);
  });

  it("rejects an incoherent pass/rush split", () => {
    expect(() => finalizePredictionSnapshot(teamOppDraft({ projection: { type: "team_opportunity", projected_team_plays: 64, projected_dropback_rate: 0.6, projected_pass_attempts: 30, projected_rush_attempts: 20 } }))).toThrow(/reconstitute/);
  });

  it("rejects a dropback rate above 1 and negative attempts", () => {
    expect(() => finalizePredictionSnapshot(teamOppDraft({ projection: { type: "team_opportunity", projected_team_plays: 64, projected_dropback_rate: 1.4, projected_pass_attempts: 89.6, projected_rush_attempts: -25.6 } }))).toThrow();
  });

  it("gives the home and away team rows of one game distinct prediction ids and files idempotently", () => {
    const root = tempRoot();
    const home = finalizePredictionSnapshot(teamOppDraft({ team: "aaa", opponent: "bbb", home_away: "home" }));
    const away = finalizePredictionSnapshot(teamOppDraft({ team: "bbb", opponent: "aaa", home_away: "away", projection: { type: "team_opportunity", projected_team_plays: 62, projected_dropback_rate: 0.55, projected_pass_attempts: 34.1, projected_rush_attempts: 27.9 } }));
    expect(home.prediction_id).not.toBe(away.prediction_id);
    expect(home.snapshot_key).toContain("team:aaa");
    expect(away.snapshot_key).toContain("team:bbb");
    expect(archiveProductionPredictions({ rootDir: root, records: [home, away] })).toMatchObject({ appended: 2, duplicates: 0 });
    expect(archiveProductionPredictions({ rootDir: root, records: [home, away] })).toMatchObject({ appended: 0, duplicates: 2 });
  });

  it("does not change the spread snapshot_key shape", () => {
    const spread = finalizePredictionSnapshot(draft());
    expect(spread.snapshot_key).toBe("nfl|2026|1|2026_01_ARI_LAC|game|spread|jkb-power-number|jkb-power-number-v1.0.0");
  });
});
