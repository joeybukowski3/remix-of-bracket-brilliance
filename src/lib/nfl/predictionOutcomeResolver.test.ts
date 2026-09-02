import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  finalizePredictionSnapshot,
  archiveProductionPredictions,
  type PredictionSnapshotDraft,
  type PredictionSnapshotV1,
} from "../../../scripts/lib/nfl-production-prediction-archive";
import {
  appendOutcomeDrafts,
  resolvePredictionOutcome,
  summarizeResolution,
  validateOutcomeEvent,
  type ResolverSeasonSources,
} from "../../../scripts/lib/nfl-prediction-outcome-resolver";
import { parseResolverArgs, runResolver } from "../../../scripts/resolve-nfl-prediction-outcomes";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "jkb-outcomes-"));
  tempDirs.push(root);
  return root;
}

function draft(type: "spread" | "passing" | "rushing" | "receiving", overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotDraft {
  const isPlayer = type !== "spread";
  const projections = {
    spread: { type: "spread" as const, projected_home_margin: 4, projected_spread_team: "lar", projected_spread_line: -4, market_spread: null, edge: null },
    passing: { type: "passing" as const, projected_attempts: null, projected_ypa: null, projected_passing_yards: 250, direct_model_prediction: 250 },
    rushing: { type: "rushing" as const, projected_carries: 12, projected_ypc: 4.5, projected_rushing_yards: 54 },
    receiving: { type: "receiving" as const, projected_targets: 8, projected_receptions: null, projected_yards_per_reception: null, projected_yards_per_target: 9, projected_receiving_yards: 72 },
  };
  return {
    schema_version: "jkb-football-prediction-v1", snapshot_label: null,
    prediction_timestamp: "2025-09-01T12:00:00.000Z", created_at: "2025-09-01T12:00:01.000Z", mode: "production",
    sport: "football", league: "nfl", season: 2025, week: 1, slate_date: "2025-09-07", game_id: "2025_01_ARI_LA",
    kickoff_utc: "2025-09-07T20:25:00.000Z", player_id: isPlayer ? "gsis:00-001" : null,
    player_name_at_prediction: isPlayer ? "Test Player" : null, team: "lar", opponent: "ari", home_away: "home", neutral_site: false,
    position: type === "passing" ? "QB" : type === "rushing" ? "RB" : type === "receiving" ? "WR" : null,
    prediction_type: type, model_name: `nfl-${type}`, model_version: `${type}-v1`, feature_schema_version: `${type}-features-v1`,
    pipeline_version: "archive-v1", code_revision: "abc", run_id: "run-1", workflow_name: null, workflow_run_id: null,
    cutoff_policy: "game_before_kickoff", status: "projected", projection: projections[type],
    feature_snapshot: { values: { x: 1 }, source_manifest_hashes: { run: "source" }, fitted_model_hash: isPlayer ? "fitted" : null },
    market_reference_status: "missing", market_snapshot_refs: [], provenance: [{ kind: "source_manifest", logical_name: "inputs", content_hash: "source" }],
    ...overrides,
  };
}

function prediction(type: "spread" | "passing" | "rushing" | "receiving", overrides: Partial<PredictionSnapshotDraft> = {}): PredictionSnapshotV1 {
  return finalizePredictionSnapshot(draft(type, overrides));
}

function sources(options: {
  final?: boolean;
  homeScore?: number;
  awayScore?: number;
  stats?: Record<string, string>[] | null;
  rosters?: Record<string, string>[] | null;
} = {}): ResolverSeasonSources {
  const final = options.final ?? true;
  return {
    season: 2025,
    games: [{ gameId: "2025_01_ARI_LA", season: 2025, week: 1, homeAbbr: "LA", awayAbbr: "AZ", status: final ? "final" : "scheduled" }],
    results: final ? [{ gameId: "2025_01_ARI_LA", season: 2025, week: 1, homeAbbr: "LA", awayAbbr: "AZ", homeScore: options.homeScore ?? 24, awayScore: options.awayScore ?? 17, final: true }] : [],
    playerStats: options.stats === undefined ? [] : options.stats,
    rosters: options.rosters === undefined ? [] : options.rosters,
    artifacts: {
      nfl_game_schedule: { logical_name: "nfl_game_schedule", path: "games.json", provider: "nflverse/nfldata games.csv", content_hash: "games-hash", source_updated_at: "2025-09-08T10:00:00.000Z" },
      nfl_game_results: { logical_name: "nfl_game_results", path: "results.json", provider: "nflverse/nfldata games.csv", content_hash: "results-hash", source_updated_at: "2025-09-08T10:00:00.000Z" },
      nfl_player_week_stats: { logical_name: "nfl_player_week_stats", path: "stats.csv", provider: "nflverse/nflverse-data stats_player", content_hash: "stats-hash", source_updated_at: "2025-09-08" },
      nfl_weekly_roster: { logical_name: "nfl_weekly_roster", path: "roster.csv", provider: "nflverse/nflverse-data weekly_rosters", content_hash: "roster-hash", source_updated_at: "2025-09-08" },
    },
  };
}

function statRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    player_id: "00-001", game_id: "2025_01_ARI_LA", team: "LA", opponent_team: "AZ",
    attempts: "20", completions: "15", passing_yards: "240", passing_tds: "2", passing_interceptions: "1",
    carries: "10", rushing_yards: "45", targets: "8", receptions: "6", receiving_yards: "72", ...overrides,
  };
}

function rosterRow(status: string, overrides: Record<string, string> = {}): Record<string, string> {
  return { season: "2025", week: "1", gsis_id: "00-001", team: "LA", status, ...overrides };
}

describe("game outcome resolution", () => {
  it("resolves only a completed game with home-minus-away margin", () => {
    const event = resolvePredictionOutcome(prediction("spread"), sources(), "2025-09-08T12:00:00.000Z");
    expect(event.resolution_status).toBe("resolved");
    expect(event.actual).toMatchObject({ type: "spread", home_score: 24, away_score: 17, margin: 7, winner: "home" });
  });

  it("keeps scheduled games pending", () => {
    expect(resolvePredictionOutcome(prediction("spread"), sources({ final: false })).resolution_status).toBe("pending_game");
  });

  it("computes projection-minus-actual margin error and winner correctness", () => {
    const event = resolvePredictionOutcome(prediction("spread"), sources());
    expect(event.derived).toMatchObject({ type: "spread", margin_error: -3, absolute_margin_error: 3, projected_winner_correct: true, projected_margin_direction: "home" });
  });

  it("derives ATS only from the archived timestamp-valid home line", () => {
    const record = prediction("spread", {
      market_reference_status: "available",
      market_snapshot_refs: [{ purpose: "comparison", market_type: "spread", market_observation_id: "m1", content_hash: "mh", provider: "p", sportsbook: "b", observed_at: "2025-09-01T11:00:00.000Z", provider_updated_at: null, line: -3, over_price: null, under_price: null, side_prices: { home: -110, away: -110 }, designation: "available_at_prediction" }],
    });
    const event = resolvePredictionOutcome(record, sources());
    expect(event.derived).toMatchObject({ market_results: [{ home_line: -3, jkb_side: "home", ats_result: "win" }] });
  });

  it("does not infer finality from scores alone", () => {
    const input = sources();
    input.games![0].status = "scheduled";
    expect(resolvePredictionOutcome(prediction("spread"), input).resolution_status).toBe("pending_game");
  });
});

describe("player outcomes and component errors", () => {
  it("resolves passing attempts, yards, completions, and YPA", () => {
    const event = resolvePredictionOutcome(prediction("passing"), sources({ stats: [statRow()] }));
    expect(event.actual).toMatchObject({ type: "passing", attempts: 20, completions: 15, yards: 240, yards_per_attempt: 12 });
    expect(event.derived).toMatchObject({ yards_error: 10, absolute_yards_error: 10 });
  });

  it("does not fabricate attempts or YPA errors absent projected legs", () => {
    const event = resolvePredictionOutcome(prediction("passing"), sources({ stats: [statRow()] }));
    expect(event.derived).toMatchObject({ attempts_error: null, ypa_error: null });
  });

  it("computes passing component errors only when projected", () => {
    const record = prediction("passing", { projection: { type: "passing", projected_attempts: 22, projected_ypa: 11, projected_passing_yards: 250, direct_model_prediction: 250 } });
    expect(resolvePredictionOutcome(record, sources({ stats: [statRow()] })).derived).toMatchObject({ attempts_error: 2, ypa_error: -1 });
  });

  it("resolves rushing carries, yards, and YPC", () => {
    const event = resolvePredictionOutcome(prediction("rushing"), sources({ stats: [statRow()] }));
    expect(event.actual).toMatchObject({ type: "rushing", carries: 10, yards: 45, yards_per_carry: 4.5 });
    expect(event.derived).toMatchObject({ carries_error: 2, ypc_error: 0 });
  });

  it("preserves a recorded zero-carry outcome and leaves YPC null", () => {
    const event = resolvePredictionOutcome(prediction("rushing"), sources({ stats: [statRow({ carries: "0", rushing_yards: "0" })] }));
    expect(event.actual).toMatchObject({ carries: 0, yards: 0, yards_per_carry: null });
    expect(event.derived).toMatchObject({ ypc_error: null });
  });

  it("resolves receiving targets, receptions, yards, YPT, and YPR", () => {
    const event = resolvePredictionOutcome(prediction("receiving"), sources({ stats: [statRow()] }));
    expect(event.actual).toMatchObject({ type: "receiving", targets: 8, receptions: 6, yards: 72, yards_per_target: 9, yards_per_reception: 12 });
    expect(event.derived).toMatchObject({ targets_error: 0, receptions_error: null, yards_per_target_error: 0, yards_per_reception_error: null });
  });

  it("preserves zero targets and null denominator rates", () => {
    const event = resolvePredictionOutcome(prediction("receiving"), sources({ stats: [statRow({ targets: "0", receptions: "0", receiving_yards: "0" })] }));
    expect(event.actual).toMatchObject({ targets: 0, receptions: 0, yards: 0, yards_per_target: null, yards_per_reception: null });
    expect(event.derived).toMatchObject({ yards_per_target_error: null });
  });

  it("keeps an incomplete player stat row pending", () => {
    expect(resolvePredictionOutcome(prediction("receiving"), sources({ stats: [statRow({ targets: "" })] })).resolution_status).toBe("pending_player_stats");
  });
});

describe("identity, aliases, and DNP semantics", () => {
  it("joins by canonical gsis player ID and accepts LA/LAR plus AZ/ARI aliases", () => {
    const event = resolvePredictionOutcome(prediction("rushing"), sources({ stats: [statRow({ team: "LAR", opponent_team: "ARI" })] }));
    expect(event.identity_resolution).toMatchObject({ method: "canonical_player_id_and_game_id", actual_team: "lar", actual_opponent: "ari", team_match: true });
  });

  it("accepts WAS/WSH and JAC/JAX aliases", () => {
    const record = prediction("receiving", { game_id: "2025_01_JAC_WAS", team: "wsh", opponent: "jax" });
    const input = sources({ stats: [statRow({ game_id: "2025_01_JAC_WAS", team: "WAS", opponent_team: "JAC" })] });
    input.games = [{ gameId: "2025_01_JAC_WAS", season: 2025, week: 1, homeAbbr: "WSH", awayAbbr: "JAX", status: "final" }];
    input.results = [{ gameId: "2025_01_JAC_WAS", season: 2025, week: 1, homeAbbr: "WSH", awayAbbr: "JAX", homeScore: 20, awayScore: 10, final: true }];
    expect(resolvePredictionOutcome(record, input).identity_resolution.team_match).toBe(true);
  });

  it("resolves a same-game traded/team mismatch by player ID while flagging the mismatch", () => {
    const event = resolvePredictionOutcome(prediction("rushing"), sources({ stats: [statRow({ team: "AZ", opponent_team: "LA" })] }));
    expect(event.resolution_status).toBe("resolved");
    expect(event.identity_resolution).toMatchObject({ actual_team: "ari", team_match: false });
  });

  it("reports identity_unresolved for a player row attached to neither game team", () => {
    expect(resolvePredictionOutcome(prediction("rushing"), sources({ stats: [statRow({ team: "BUF", opponent_team: "MIA" })] })).resolution_status).toBe("identity_unresolved");
  });

  it("treats ACT-with-no-stats as an explicitly sourced true zero", () => {
    const event = resolvePredictionOutcome(prediction("passing"), sources({ stats: [], rosters: [rosterRow("ACT")] }));
    expect(event.resolution_status).toBe("resolved");
    expect(event.actual).toMatchObject({ attempts: 0, yards: 0, yards_per_attempt: null });
    expect(event.identity_resolution.zero_source).toBe("active_roster_confirmed");
  });

  it("marks INA-with-no-stats inactive rather than zero", () => {
    const event = resolvePredictionOutcome(prediction("rushing"), sources({ stats: [], rosters: [rosterRow("INA")] }));
    expect(event.resolution_status).toBe("inactive");
    expect(event.actual).toBeNull();
  });

  it("marks non-game roster states not applicable", () => {
    expect(resolvePredictionOutcome(prediction("receiving"), sources({ stats: [], rosters: [rosterRow("RES")] })).resolution_status).toBe("not_applicable");
  });

  it("leaves an absent player unresolved instead of converting missing to zero", () => {
    expect(resolvePredictionOutcome(prediction("receiving"), sources({ stats: [], rosters: [] })).resolution_status).toBe("pending_player_stats");
  });

  it("reports a missing player source explicitly", () => {
    expect(resolvePredictionOutcome(prediction("passing"), sources({ stats: null })).resolution_status).toBe("source_missing");
  });
});

describe("append-only idempotency and revisions", () => {
  it("appends once and treats an exact source-state rerun as already resolved", () => {
    const root = tempRoot();
    const record = prediction("spread");
    const first = resolvePredictionOutcome(record, sources(), "2025-09-08T12:00:00.000Z");
    const retry = resolvePredictionOutcome(record, sources(), "2025-09-08T13:00:00.000Z");
    expect(appendOutcomeDrafts({ rootDir: root, drafts: [first] })).toMatchObject({ appended: 1, alreadyResolved: 0 });
    expect(appendOutcomeDrafts({ rootDir: root, drafts: [retry] })).toMatchObject({ appended: 0, alreadyResolved: 1 });
    expect(readFileSync(join(root, "2025", "01", "spread.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("appends a corrected authoritative score as revision 2 without changing revision 1", () => {
    const root = tempRoot();
    const record = prediction("spread");
    const original = resolvePredictionOutcome(record, sources({ homeScore: 24 }), "2025-09-08T12:00:00.000Z");
    appendOutcomeDrafts({ rootDir: root, drafts: [original] });
    const corrected = resolvePredictionOutcome(record, sources({ homeScore: 25 }), "2025-09-09T12:00:00.000Z");
    const result = appendOutcomeDrafts({ rootDir: root, drafts: [corrected] });
    expect(result).toMatchObject({ appended: 1, corrections: 1 });
    const rows = readFileSync(join(root, "2025", "01", "spread.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(rows.map((row) => [row.outcome_revision, row.actual.home_score])).toEqual([[1, 24], [2, 25]]);
    expect(rows[1].supersedes_outcome_id).toBe(rows[0].outcome_id);
  });

  it("appends a corrected player stat as a revision", () => {
    const root = tempRoot();
    const record = prediction("passing");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(record, sources({ stats: [statRow()] }))] });
    const result = appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(record, sources({ stats: [statRow({ passing_yards: "241" })] }))] });
    expect(result).toMatchObject({ appended: 1, corrections: 1 });
  });

  it("appends a reversion to an older source state as a new revision", () => {
    const root = tempRoot();
    const record = prediction("spread");
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(record, sources({ homeScore: 24 }))] });
    appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(record, sources({ homeScore: 25 }))] });
    const reverted = appendOutcomeDrafts({ rootDir: root, drafts: [resolvePredictionOutcome(record, sources({ homeScore: 24 }))] });
    expect(reverted).toMatchObject({ appended: 1, corrections: 1 });
    expect(reverted.events[0].outcome_revision).toBe(3);
  });

  it("validates generated outcome identities", () => {
    const result = appendOutcomeDrafts({ rootDir: tempRoot(), drafts: [resolvePredictionOutcome(prediction("spread"), sources())] });
    expect(() => validateOutcomeEvent(result.events[0])).not.toThrow();
  });

  it("summarizes model and explicit resolution statuses", () => {
    const drafts = [
      resolvePredictionOutcome(prediction("spread"), sources()),
      resolvePredictionOutcome(prediction("passing"), sources({ stats: [statRow()] })),
      resolvePredictionOutcome(prediction("rushing"), sources({ stats: [], rosters: [rosterRow("INA")] })),
      resolvePredictionOutcome(prediction("receiving"), sources({ final: false })),
    ];
    const write = appendOutcomeDrafts({ rootDir: tempRoot(), drafts, dryRun: true });
    expect(summarizeResolution(drafts, write)).toMatchObject({ spread_resolved: 1, passing_resolved: 1, inactive: 1, pending_game: 1, appended: 4 });
  });
});

describe("manual resolver entrypoint", () => {
  it("validates the small season/week/dry-run CLI surface", () => {
    const args = parseResolverArgs(["--season=2025", "--week=1", "--dry-run", "--recorded-at=2025-09-08T12:00:00.000Z"]);
    expect(args).toMatchObject({ season: 2025, week: 1, dryRun: true });
    expect(() => parseResolverArgs(["--week=1"])).toThrow(/requires --season/);
  });

  it("runs a controlled four-model fixture and reruns idempotently", () => {
    const repoRoot = tempRoot();
    const predictionRoot = join(repoRoot, "data", "nfl", "predictions");
    const outcomeRoot = join(repoRoot, "data", "nfl", "prediction-outcomes");
    const records = [
      prediction("spread"),
      prediction("passing", { player_id: "gsis:00-001", player_name_at_prediction: "Passer" }),
      prediction("rushing", { player_id: "gsis:00-002", player_name_at_prediction: "Rusher" }),
      prediction("receiving", { player_id: "gsis:00-003", player_name_at_prediction: "Receiver" }),
      prediction("receiving", { player_id: "gsis:00-004", player_name_at_prediction: "Inactive Receiver" }),
    ];
    archiveProductionPredictions({ rootDir: predictionRoot, records });
    const publicSeason = join(repoRoot, "public", "data", "nfl", "2025");
    const statsDir = join(repoRoot, "data", "nfl", "nflverse", "player-week-stats");
    const rosterDir = join(repoRoot, "data", "nfl", "nflverse", "weekly-rosters");
    mkdirSync(publicSeason, { recursive: true });
    mkdirSync(statsDir, { recursive: true });
    mkdirSync(rosterDir, { recursive: true });
    writeFileSync(join(publicSeason, "games.json"), JSON.stringify({ _meta: { generatedAt: "2025-09-08T10:00:00.000Z" }, games: sources().games }));
    writeFileSync(join(publicSeason, "results.json"), JSON.stringify({ _meta: { generatedAt: "2025-09-08T10:00:00.000Z" }, results: sources().results }));
    const header = "player_id,game_id,team,opponent_team,attempts,completions,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,targets,receptions,receiving_yards\n";
    const stats = [
      "00-001,2025_01_ARI_LA,LA,AZ,20,15,240,2,1,0,0,0,0,0",
      "00-002,2025_01_ARI_LA,LA,AZ,0,0,0,0,0,10,45,0,0,0",
      "00-003,2025_01_ARI_LA,LA,AZ,0,0,0,0,0,0,0,8,6,72",
    ].join("\n");
    writeFileSync(join(statsDir, "stats_player_week_2025.csv"), `${header}${stats}\n`);
    writeFileSync(join(statsDir, "manifest.json"), JSON.stringify({ files: [{ season: 2025, retrievedDateUtc: "2025-09-08" }] }));
    writeFileSync(join(rosterDir, "roster_weekly_2025.csv"), "season,week,gsis_id,team,status\n2025,1,00-004,LA,INA\n");
    writeFileSync(join(rosterDir, "manifest.json"), JSON.stringify({ files: [{ season: 2025, retrievedDateUtc: "2025-09-08" }] }));
    const args = { season: 2025, week: 1, dryRun: false, predictionRoot, outcomeRoot, repoRoot, recordedAt: "2025-09-08T12:00:00.000Z" };
    const first = runResolver(args);
    expect(first.summary).toMatchObject({ spread_resolved: 1, passing_resolved: 1, rushing_resolved: 1, receiving_resolved: 1, inactive: 1, appended: 5, already_resolved: 0 });
    const retry = runResolver({ ...args, recordedAt: "2025-09-08T13:00:00.000Z" });
    expect(retry.summary).toMatchObject({ appended: 0, already_resolved: 5, corrections: 0 });
  });
});
