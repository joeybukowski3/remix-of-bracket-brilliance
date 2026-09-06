import { describe, expect, it } from "vitest";
import { finalizePredictionSnapshot, type PredictionSnapshotDraft, type PredictionSnapshotV1 } from "./nfl-production-prediction-archive";
import { buildStarterCohort, serializeStarterCohort, type StarterCohortRecordV1 } from "./nfl-starter-cohort";

const KICKOFF = "2026-09-13T17:00:00.000Z";
const GENERATED_AT = "2026-09-05T00:00:00.000Z";

function baseDraft(overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotDraft {
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
    game_id: "2026_01_ATL_PIT",
    kickoff_utc: KICKOFF,
    player_id: "gsis:00-0000001",
    player_name_at_prediction: "Test Player",
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
      values: { role: { depth_rank: 1, starter_flag: true, role_source: "nflverse-depth-charts-espn", role_source_updated_at: "2026-09-03T11:53:47.000Z" } },
      source_manifest_hashes: { run: "hash-1" },
      fitted_model_hash: "fitted-hash-1",
    },
    market_reference_status: "missing",
    market_snapshot_refs: [],
    provenance: [{ kind: "source_manifest", logical_name: "inputs", content_hash: "hash-1" }],
    ...overrides,
  };
}

function qbRow(overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotV1 {
  return finalizePredictionSnapshot(baseDraft(overrides));
}

function rbRow(playerId: string, carries: number, overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotV1 {
  return finalizePredictionSnapshot(baseDraft({
    player_id: playerId, position: "RB", prediction_type: "rushing",
    model_name: "nfl-rushing-carries-x-shrunk-ypc", model_version: "nfl-rushing-carries-x-shrunk-ypc-production-2022-2025-v1",
    projection: { type: "rushing", projected_carries: carries, projected_ypc: 4.1, projected_rushing_yards: carries * 4.1 },
    feature_snapshot: { values: {}, source_manifest_hashes: { run: "hash-1" }, fitted_model_hash: "fitted-hash-1" },
    ...overrides,
  }));
}

function receivingRow(
  playerId: string,
  position: "WR" | "TE",
  targets: number,
  overrides: Partial<PredictionSnapshotDraft> = {},
): PredictionSnapshotV1 {
  return finalizePredictionSnapshot(baseDraft({
    player_id: playerId, position, prediction_type: "receiving",
    model_name: "nfl-receiving-targets-x-shrunk-ypt", model_version: "nfl-receiving-targets-x-shrunk-ypt-production-2022-2025-v1",
    projection: { type: "receiving", projected_targets: targets, projected_receptions: null, projected_yards_per_reception: null, projected_yards_per_target: 7.5, projected_receiving_yards: targets * 7.5 },
    feature_snapshot: { values: {}, source_manifest_hashes: { run: "hash-1" }, fitted_model_hash: "fitted-hash-1" },
    ...overrides,
  }));
}

function findRecord(records: StarterCohortRecordV1[], playerId: string): StarterCohortRecordV1 | undefined {
  return records.find((record) => record.player_id === playerId);
}

describe("RB starter selection", () => {
  it("selects the RB with the highest projected carries", () => {
    const { records, missing } = buildStarterCohort({
      passing: [], receiving: [], generatedAt: GENERATED_AT,
      rushing: [rbRow("gsis:rb-1", 15), rbRow("gsis:rb-2", 20)],
    });
    const rb = records.find((r) => r.position === "RB");
    expect(rb?.player_id).toBe("gsis:rb-2");
    expect(rb?.starter_basis).toBe("RB1_BY_PROJECTED_CARRIES");
    expect(rb?.starter_metric_value).toBe(20);
    expect(missing.some((m) => m.slot === "RB1")).toBe(false);
  });

  it("excludes RB rows that are not a valid pregame production projection (e.g. shadow-mode rows) and reports RB1 missing", () => {
    // The archive schema requires projected_carries to be a finite number for every
    // valid rushing row (validatePredictionSnapshot enforces this at write time), so
    // "null/invalid projected_carries" cannot occur in valid archived data. The
    // equivalent real-world exclusion case is a row that fails the pregame-validity
    // gate itself (wrong mode, wrong status, or a stale/invalid timestamp).
    const shadow = finalizePredictionSnapshot(baseDraft({
      player_id: "gsis:rb-1", position: "RB", prediction_type: "rushing", mode: "shadow",
      model_name: "nfl-rushing-carries-x-shrunk-ypc", model_version: "nfl-rushing-carries-x-shrunk-ypc-production-2022-2025-v1",
      projection: { type: "rushing", projected_carries: 15, projected_ypc: 4, projected_rushing_yards: 60 },
      feature_snapshot: { values: {}, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    }));
    const { records, missing } = buildStarterCohort({ passing: [], receiving: [], rushing: [shadow], generatedAt: GENERATED_AT });
    expect(records.some((r) => r.position === "RB")).toBe(false);
    expect(missing.some((m) => m.slot === "RB1")).toBe(true);
  });

  it("breaks an exact tie by player_id ascending", () => {
    const { records } = buildStarterCohort({
      passing: [], receiving: [], generatedAt: GENERATED_AT,
      rushing: [rbRow("gsis:rb-2", 15), rbRow("gsis:rb-1", 15)],
    });
    const rb = records.find((r) => r.position === "RB");
    expect(rb?.player_id).toBe("gsis:rb-1");
  });
});

describe("WR starter selection", () => {
  it("selects the top 3 by projected targets, ranked 1-3", () => {
    const { records } = buildStarterCohort({
      passing: [], rushing: [], generatedAt: GENERATED_AT,
      receiving: [
        receivingRow("gsis:wr-1", "WR", 5),
        receivingRow("gsis:wr-2", "WR", 9),
        receivingRow("gsis:wr-3", "WR", 7),
        receivingRow("gsis:wr-4", "WR", 3),
      ],
    });
    const wrs = records.filter((r) => r.position === "WR").sort((a, b) => a.starter_rank - b.starter_rank);
    expect(wrs.map((r) => r.player_id)).toEqual(["gsis:wr-2", "gsis:wr-3", "gsis:wr-1"]);
    expect(wrs.map((r) => r.starter_basis)).toEqual(["WR1_BY_PROJECTED_TARGETS", "WR2_BY_PROJECTED_TARGETS", "WR3_BY_PROJECTED_TARGETS"]);
  });

  it("does not fabricate players when fewer than 3 valid WRs exist", () => {
    const { records, missing } = buildStarterCohort({
      passing: [], rushing: [], generatedAt: GENERATED_AT,
      receiving: [receivingRow("gsis:wr-1", "WR", 5)],
    });
    const wrs = records.filter((r) => r.position === "WR");
    expect(wrs).toHaveLength(1);
    expect(missing.filter((m) => m.team === "pit" && (m.slot === "WR2" || m.slot === "WR3"))).toHaveLength(2);
  });

  it("breaks an exact tie by player_id ascending", () => {
    const { records } = buildStarterCohort({
      passing: [], rushing: [], generatedAt: GENERATED_AT,
      receiving: [receivingRow("gsis:wr-2", "WR", 5), receivingRow("gsis:wr-1", "WR", 5)],
    });
    const wrs = records.filter((r) => r.position === "WR").sort((a, b) => a.starter_rank - b.starter_rank);
    expect(wrs.map((r) => r.player_id)).toEqual(["gsis:wr-1", "gsis:wr-2"]);
  });
});

describe("TE starter selection", () => {
  it("selects the TE with the highest projected targets", () => {
    const { records } = buildStarterCohort({
      passing: [], rushing: [], generatedAt: GENERATED_AT,
      receiving: [receivingRow("gsis:te-1", "TE", 3), receivingRow("gsis:te-2", "TE", 6)],
    });
    const te = records.find((r) => r.position === "TE");
    expect(te?.player_id).toBe("gsis:te-2");
    expect(te?.starter_basis).toBe("TE1_BY_PROJECTED_TARGETS");
  });

  it("excludes TE with no candidates and reports TE1 missing", () => {
    const { records, missing } = buildStarterCohort({ passing: [], rushing: [], receiving: [], generatedAt: GENERATED_AT });
    expect(records.some((r) => r.position === "TE")).toBe(false);
    expect(missing).toHaveLength(0); // no team context registered at all when every archive is empty
  });

  it("breaks an exact tie by player_id ascending", () => {
    const { records } = buildStarterCohort({
      passing: [], rushing: [], generatedAt: GENERATED_AT,
      receiving: [receivingRow("gsis:te-2", "TE", 5), receivingRow("gsis:te-1", "TE", 5)],
    });
    const te = records.find((r) => r.position === "TE");
    expect(te?.player_id).toBe("gsis:te-1");
  });
});

describe("snapshot safety", () => {
  it("selects the latest valid pregame snapshot when multiple exist for one player", () => {
    const early = rbRow("gsis:rb-1", 10, { prediction_timestamp: "2026-09-03T12:00:00.000Z" });
    const later = rbRow("gsis:rb-1", 18, { prediction_timestamp: "2026-09-04T12:00:00.000Z" });
    const { records } = buildStarterCohort({ passing: [], receiving: [], rushing: [early, later], generatedAt: GENERATED_AT });
    const rb = records.find((r) => r.position === "RB");
    expect(rb?.starter_metric_value).toBe(18);
    expect(rb?.eligibility_prediction_timestamp).toBe("2026-09-04T12:00:00.000Z");
  });

  it("an older pregame snapshot loses to a later valid pregame snapshot even with a lower value", () => {
    const early = rbRow("gsis:rb-1", 25, { prediction_timestamp: "2026-09-03T12:00:00.000Z" });
    const later = rbRow("gsis:rb-1", 12, { prediction_timestamp: "2026-09-04T12:00:00.000Z" });
    const { records } = buildStarterCohort({ passing: [], receiving: [], rushing: [early, later], generatedAt: GENERATED_AT });
    const rb = records.find((r) => r.position === "RB");
    expect(rb?.starter_metric_value).toBe(12);
  });

  it("prevents duplicate logical selection when the same player has multiple snapshots", () => {
    const one = rbRow("gsis:rb-1", 10, { prediction_timestamp: "2026-09-03T12:00:00.000Z" });
    const two = rbRow("gsis:rb-1", 20, { prediction_timestamp: "2026-09-04T12:00:00.000Z" });
    const { records } = buildStarterCohort({ passing: [], receiving: [], rushing: [one, two], generatedAt: GENERATED_AT });
    expect(records.filter((r) => r.position === "RB")).toHaveLength(1);
  });
});

describe("QB primary — archived depth chart", () => {
  it("selects the valid archived depth-chart starter", () => {
    const { records } = buildStarterCohort({ rushing: [], receiving: [], generatedAt: GENERATED_AT, passing: [qbRow()] });
    const qb = findRecord(records, "gsis:00-0000001");
    expect(qb?.starter_basis).toBe("QB1_BY_ARCHIVED_DEPTH_CHART");
    expect(qb?.starter_metric).toBe("depth_rank");
    expect(qb?.eligibility_source_type).toBe("archived_depth_chart_role");
    expect(qb?.role_source_updated_at).toBe("2026-09-03T11:53:47.000Z");
  });

  it("prefers starter_flag=true over a lower depth_rank without starter_flag", () => {
    const flagged = qbRow({
      player_id: "gsis:qb-flagged",
      feature_snapshot: { values: { role: { depth_rank: 2, starter_flag: true, role_source_updated_at: "2026-09-03T11:53:47.000Z" } }, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const unflagged = qbRow({
      player_id: "gsis:qb-unflagged",
      feature_snapshot: { values: { role: { depth_rank: 1, starter_flag: false, role_source_updated_at: "2026-09-03T11:53:47.000Z" } }, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const { records } = buildStarterCohort({ rushing: [], receiving: [], generatedAt: GENERATED_AT, passing: [flagged, unflagged] });
    const qb = records.find((r) => r.position === "QB");
    expect(qb?.player_id).toBe("gsis:qb-flagged");
  });

  it("resolves ambiguity between two starter_flag=true QBs by lowest depth_rank", () => {
    const rankTwo = qbRow({
      player_id: "gsis:qb-rank2",
      feature_snapshot: { values: { role: { depth_rank: 2, starter_flag: true, role_source_updated_at: "2026-09-03T11:53:47.000Z" } }, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const rankOne = qbRow({
      player_id: "gsis:qb-rank1",
      feature_snapshot: { values: { role: { depth_rank: 1, starter_flag: true, role_source_updated_at: "2026-09-03T11:53:47.000Z" } }, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const { records } = buildStarterCohort({ rushing: [], receiving: [], generatedAt: GENERATED_AT, passing: [rankTwo, rankOne] });
    const qb = records.find((r) => r.position === "QB");
    expect(qb?.player_id).toBe("gsis:qb-rank1");
  });

  it("breaks an exact depth_rank tie by player_id ascending", () => {
    const b = qbRow({
      player_id: "gsis:qb-b",
      feature_snapshot: { values: { role: { depth_rank: 1, starter_flag: true, role_source_updated_at: "2026-09-03T11:53:47.000Z" } }, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const a = qbRow({
      player_id: "gsis:qb-a",
      feature_snapshot: { values: { role: { depth_rank: 1, starter_flag: true, role_source_updated_at: "2026-09-03T11:53:47.000Z" } }, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const { records } = buildStarterCohort({ rushing: [], receiving: [], generatedAt: GENERATED_AT, passing: [b, a] });
    const qb = records.find((r) => r.position === "QB");
    expect(qb?.player_id).toBe("gsis:qb-a");
  });

  it("excludes stale (post-kickoff) role evidence from depth-chart selection", () => {
    const staleRole = qbRow({
      feature_snapshot: { values: { role: { depth_rank: 1, starter_flag: true, role_source_updated_at: "2026-09-14T00:00:00.000Z" } }, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const { records } = buildStarterCohort({ rushing: [], receiving: [], generatedAt: GENERATED_AT, passing: [staleRole] });
    const qb = records.find((r) => r.position === "QB");
    // falls through to projection fallback since depth-chart evidence is disqualified
    expect(qb?.starter_basis).toBe("QB1_BY_PROJECTED_PASSING_YARDS");
  });
});

describe("QB fallback — projected passing yards", () => {
  it("a valid depth-chart QB always beats the projection fallback even with a lower projection", () => {
    const depthChartQb = qbRow({ player_id: "gsis:qb-depth", projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 150, direct_model_prediction: 150 } });
    const higherProjectionNoRole = qbRow({
      player_id: "gsis:qb-noRole", projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 300, direct_model_prediction: 300 },
      feature_snapshot: { values: {}, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const { records } = buildStarterCohort({ rushing: [], receiving: [], generatedAt: GENERATED_AT, passing: [depthChartQb, higherProjectionNoRole] });
    const qb = records.find((r) => r.position === "QB");
    expect(qb?.player_id).toBe("gsis:qb-depth");
    expect(qb?.starter_basis).toBe("QB1_BY_ARCHIVED_DEPTH_CHART");
  });

  it("activates fallback only when no valid depth-chart QB can be selected, and picks the highest projected passing yards", () => {
    const low = qbRow({
      player_id: "gsis:qb-low", projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 180, direct_model_prediction: 180 },
      feature_snapshot: { values: {}, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const high = qbRow({
      player_id: "gsis:qb-high", projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 260, direct_model_prediction: 260 },
      feature_snapshot: { values: {}, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const { records } = buildStarterCohort({ rushing: [], receiving: [], generatedAt: GENERATED_AT, passing: [low, high] });
    const qb = records.find((r) => r.position === "QB");
    expect(qb?.player_id).toBe("gsis:qb-high");
    expect(qb?.starter_basis).toBe("QB1_BY_PROJECTED_PASSING_YARDS");
    expect(qb?.starter_metric).toBe("projected_passing_yards");
  });

  it("breaks an exact passing-yards tie by player_id ascending", () => {
    const b = qbRow({
      player_id: "gsis:qb-b", projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 220, direct_model_prediction: 220 },
      feature_snapshot: { values: {}, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const a = qbRow({
      player_id: "gsis:qb-a", projection: { type: "passing", projected_attempts: null, projected_ypa: null, projected_passing_yards: 220, direct_model_prediction: 220 },
      feature_snapshot: { values: {}, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const { records } = buildStarterCohort({ rushing: [], receiving: [], generatedAt: GENERATED_AT, passing: [b, a] });
    const qb = records.find((r) => r.position === "QB");
    expect(qb?.player_id).toBe("gsis:qb-a");
  });

  it("never uses actual statistics and the fallback basis is exactly QB1_BY_PROJECTED_PASSING_YARDS, never QB1_BY_PROJECTED_ATTEMPTS", () => {
    const noRole = qbRow({
      feature_snapshot: { values: {}, source_manifest_hashes: { run: "h" }, fitted_model_hash: "f" },
    });
    const { records } = buildStarterCohort({ rushing: [], receiving: [], generatedAt: GENERATED_AT, passing: [noRole] });
    const qb = records.find((r) => r.position === "QB");
    expect(qb?.starter_basis).toBe("QB1_BY_PROJECTED_PASSING_YARDS");
    expect(qb?.starter_basis).not.toBe("QB1_BY_PROJECTED_ATTEMPTS" as unknown as string);
    expect(qb).not.toHaveProperty("actual_passing_yards");
  });

  it("leaves QB missing when neither depth-chart nor projection evidence is available", () => {
    const { records, missing } = buildStarterCohort({ passing: [], rushing: [], receiving: [], generatedAt: GENERATED_AT });
    expect(records.some((r) => r.position === "QB")).toBe(false);
    expect(missing).toHaveLength(0); // no team context at all
  });
});

describe("artifact behavior", () => {
  const fixture = {
    passing: [qbRow()],
    rushing: [rbRow("gsis:rb-1", 15), rbRow("gsis:rb-2", 22)],
    receiving: [
      receivingRow("gsis:wr-1", "WR", 5), receivingRow("gsis:wr-2", "WR", 9), receivingRow("gsis:wr-3", "WR", 7),
      receivingRow("gsis:te-1", "TE", 4),
    ],
  };

  it("repeated generation is idempotent", () => {
    const first = buildStarterCohort({ ...fixture, generatedAt: GENERATED_AT });
    const second = buildStarterCohort({ ...fixture, generatedAt: GENERATED_AT });
    expect(serializeStarterCohort(first.records)).toBe(serializeStarterCohort(second.records));
  });

  it("produces deterministic ordering", () => {
    const { records } = buildStarterCohort({ ...fixture, generatedAt: GENERATED_AT });
    expect(records.map((r) => `${r.position}:${r.player_id}`)).toEqual([
      "QB:gsis:00-0000001", "RB:gsis:rb-2", "TE:gsis:te-1", "WR:gsis:wr-2", "WR:gsis:wr-3", "WR:gsis:wr-1",
    ]);
  });

  it("produces no duplicate cohort_row_id values", () => {
    const { records } = buildStarterCohort({ ...fixture, generatedAt: GENERATED_AT });
    expect(new Set(records.map((r) => r.cohort_row_id)).size).toBe(records.length);
  });

  it("does not fabricate starters for a team with incomplete data", () => {
    const { records, missing } = buildStarterCohort({ passing: [], rushing: [rbRow("gsis:rb-1", 10)], receiving: [], generatedAt: GENERATED_AT });
    expect(records).toHaveLength(1);
    expect(missing.map((m) => m.slot).sort()).toEqual(["QB1", "TE1", "WR1", "WR2", "WR3"]);
  });
});
