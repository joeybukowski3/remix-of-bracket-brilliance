import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  archiveProductionPredictions, finalizePredictionSnapshot, type PredictionSnapshotDraft,
} from "../../../scripts/lib/nfl-production-prediction-archive";
import { partitionByKickoff } from "../../../scripts/lib/nfl-prediction-kickoff-cutoff";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Sunday morning of Week 3: Thursday's ATL@GB has already kicked off; the
// Sunday game has not.
const RUN_AT = "2026-09-27T13:30:00.000Z";

function teamOpportunityDraft(gameId: string, kickoffUtc: string, team: string, opponent: string, homeAway: "home" | "away"): PredictionSnapshotDraft {
  return {
    schema_version: "jkb-football-prediction-v1", snapshot_label: null,
    prediction_timestamp: RUN_AT, created_at: RUN_AT, mode: "production",
    sport: "football", league: "nfl", season: 2026, week: 3, slate_date: kickoffUtc.slice(0, 10), game_id: gameId,
    kickoff_utc: kickoffUtc, player_id: null, player_name_at_prediction: null,
    team, opponent, home_away: homeAway, neutral_site: false, position: null, prediction_type: "team_opportunity",
    model_name: "nfl-team-opportunity", model_version: "v1", feature_schema_version: "f1",
    pipeline_version: "p1", code_revision: null, run_id: "local:test", workflow_name: null, workflow_run_id: null,
    cutoff_policy: "slate_before_first_kickoff", status: "projected",
    projection: { type: "team_opportunity", projected_team_plays: 64, projected_dropback_rate: 0.6, projected_pass_attempts: 38.4, projected_rush_attempts: 25.6 },
    feature_snapshot: { values: { plays: 64 }, source_manifest_hashes: { run: "source-hash" }, fitted_model_hash: "fitted-hash" },
    market_reference_status: "missing", market_snapshot_refs: [],
    provenance: [{ kind: "source_manifest", logical_name: "inputs", content_hash: "source-hash" }],
  };
}

const slate = [
  teamOpportunityDraft("2026_03_ATL_GB", "2026-09-25T00:15:00.000Z", "gb", "atl", "home"),
  teamOpportunityDraft("2026_03_ATL_GB", "2026-09-25T00:15:00.000Z", "atl", "gb", "away"),
  teamOpportunityDraft("2026_03_LAC_BUF", "2026-09-27T17:00:00.000Z", "buf", "lac", "home"),
  teamOpportunityDraft("2026_03_LAC_BUF", "2026-09-27T17:00:00.000Z", "lac", "buf", "away"),
];
const timing = (d: PredictionSnapshotDraft) => ({ predictionTimestamp: d.prediction_timestamp, kickoffUtc: d.kickoff_utc });

describe("partitionByKickoff", () => {
  it("separates already-started games from upcoming ones", () => {
    const { preKickoff, postKickoff } = partitionByKickoff(slate, timing);
    expect(postKickoff.map((d) => d.game_id)).toEqual(["2026_03_ATL_GB", "2026_03_ATL_GB"]);
    expect(preKickoff.map((d) => d.game_id)).toEqual(["2026_03_LAC_BUF", "2026_03_LAC_BUF"]);
  });

  it("treats a prediction exactly at kickoff as post-kickoff", () => {
    const atKickoff = { ...slate[2], prediction_timestamp: slate[2].kickoff_utc };
    expect(partitionByKickoff([atKickoff], timing).postKickoff).toHaveLength(1);
  });

  it("keeps unparseable timestamps so snapshot validation still fails loudly", () => {
    const malformed = { ...slate[2], kickoff_utc: "not-a-date" };
    const { preKickoff } = partitionByKickoff([malformed], timing);
    expect(preKickoff).toHaveLength(1);
    expect(() => finalizePredictionSnapshot(preKickoff[0])).toThrow();
  });

  it("regression: a slate with an already-started game archives the rest instead of aborting", () => {
    // The old order (finalize every capture, then filter) threw on the started game.
    expect(() => slate.map(finalizePredictionSnapshot)).toThrow(/must precede kickoff_utc/);

    const { preKickoff, postKickoff } = partitionByKickoff(slate, timing);
    const records = preKickoff.map(finalizePredictionSnapshot);
    const rootDir = mkdtempSync(join(tmpdir(), "jkb-kickoff-cutoff-"));
    tempDirs.push(rootDir);
    const result = archiveProductionPredictions({ rootDir, records, sourceManifests: [], fittedModelManifests: [] });

    expect(postKickoff).toHaveLength(2);
    expect(result.appended).toBe(2);
    expect(records.every((r) => r.game_id === "2026_03_LAC_BUF")).toBe(true);
  });
});
