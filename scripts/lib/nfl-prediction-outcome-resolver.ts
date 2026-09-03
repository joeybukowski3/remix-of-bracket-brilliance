import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalPlayerId, normalizeNflTeamAbbr } from "../../src/lib/nfl/identity/identity";
import { parseCsv } from "./nfl-schedules-results-core.mjs";
import { parsePlayVolumeCompactRow } from "./nfl-play-volume-core.mjs";
import {
  canonicalJson,
  contentHash,
  validatePredictionSnapshot,
  type JsonValue,
  type PredictionSnapshotV1,
  type PredictionType,
} from "./nfl-production-prediction-archive";

export const OUTCOME_SCHEMA_VERSION = "jkb-football-prediction-outcome-v1" as const;
export const OUTCOME_RESOLVER_VERSION = "nfl-prediction-outcome-resolver-v1" as const;

export type ResolutionStatus =
  | "resolved"
  | "pending_game"
  | "pending_player_stats"
  | "pending_team_stats"
  | "inactive"
  | "not_applicable"
  | "identity_unresolved"
  | "source_missing";

export type SourceArtifact = {
  logical_name: "nfl_game_schedule" | "nfl_game_results" | "nfl_player_week_stats" | "nfl_weekly_roster" | "nfl_team_play_volume";
  path: string;
  provider: string;
  content_hash: string;
  source_updated_at: string | null;
};

export type SpreadActual = {
  type: "spread";
  home_score: number;
  away_score: number;
  margin: number;
  total: number;
  winner: "home" | "away" | "tie";
};

export type PassingActual = {
  type: "passing";
  attempts: number;
  completions: number | null;
  yards: number;
  yards_per_attempt: number | null;
  touchdowns: number | null;
  interceptions: number | null;
};

export type RushingActual = {
  type: "rushing";
  carries: number;
  yards: number;
  yards_per_carry: number | null;
};

export type ReceivingActual = {
  type: "receiving";
  targets: number;
  receptions: number;
  yards: number;
  yards_per_target: number | null;
  yards_per_reception: number | null;
};

/**
 * Team-level actual for `prediction_type: "team_opportunity"`.
 *
 * Field naming is deliberately honest about what WU4A actually trains and
 * predicts (see teamOpportunityFeatures.ts: `passAttempts: actual.passPlays`
 * where `passPlays` is nfl-epa-core.mjs's `classifyPlay` pass=1 count --
 * sacks and QB scrambles included, i.e. a true dropback count, NOT the
 * official box-score "attempts" column). `dropbacks`/`designed_rush_attempts`
 * here are that same PBP-derived definition, sourced from the identical
 * play-volume-team-game cache WU4A trains against, so grading compares like
 * with like. `pass_attempts` is a SEPARATE, optional diagnostic: the official
 * summed player-week passing-attempts stat for the team in this game, which
 * excludes sacks/scrambles. It is null whenever player-week stats are not
 * yet published -- team_opportunity resolution never blocks on it.
 */
export type TeamOpportunityActual = {
  type: "team_opportunity";
  team_plays: number;
  dropbacks: number;
  dropback_rate: number;
  designed_rush_attempts: number;
  pass_attempts: number | null;
};

export type ActualOutcome = SpreadActual | PassingActual | RushingActual | ReceivingActual | TeamOpportunityActual | null;

export type SpreadDerived = {
  type: "spread";
  margin_error: number;
  absolute_margin_error: number;
  projected_winner_correct: boolean;
  projected_margin_direction: "home" | "away" | "pick";
  market_results: {
    market_observation_id: string | null;
    provider: string;
    sportsbook: string;
    observed_at: string;
    home_line: number;
    jkb_side: "home" | "away" | "equal";
    ats_result: "win" | "loss" | "push" | "not_applicable";
  }[];
};

export type PassingDerived = {
  type: "passing";
  yards_error: number;
  absolute_yards_error: number;
  attempts_error: number | null;
  ypa_error: number | null;
};

export type RushingDerived = {
  type: "rushing";
  yards_error: number;
  absolute_yards_error: number;
  carries_error: number;
  ypc_error: number | null;
};

export type ReceivingDerived = {
  type: "receiving";
  yards_error: number;
  absolute_yards_error: number;
  targets_error: number;
  receptions_error: number | null;
  yards_per_target_error: number | null;
  yards_per_reception_error: number | null;
};

/**
 * Error convention matches every other family: `projection - actual`.
 * `dropbacks_error` compares the projection's `projected_pass_attempts`
 * field against actual dropbacks -- see TeamOpportunityActual's doc comment
 * for why that is the correct (like-for-like) comparison despite the
 * projection field's legacy name.
 */
export type TeamOpportunityDerived = {
  type: "team_opportunity";
  team_plays_error: number;
  absolute_team_plays_error: number;
  dropbacks_error: number;
  absolute_dropbacks_error: number;
  dropback_rate_error: number;
  designed_rush_attempts_error: number;
  pass_attempts_error: number | null;
};

export type DerivedOutcome = SpreadDerived | PassingDerived | RushingDerived | ReceivingDerived | TeamOpportunityDerived | null;

export type PredictionOutcomeEventV1 = {
  schema_version: typeof OUTCOME_SCHEMA_VERSION;
  outcome_id: string;
  prediction_id: string;
  snapshot_key: string;
  outcome_revision: number;
  supersedes_outcome_id: string | null;
  prediction_type: PredictionType;
  season: number;
  week: number;
  game_id: string;
  player_id: string | null;
  team: string;
  opponent: string;
  recorded_at: string;
  resolved_at: string | null;
  resolution_status: ResolutionStatus;
  game_completion_status: "final" | "not_final" | "missing";
  resolver_version: typeof OUTCOME_RESOLVER_VERSION;
  provider: "nflverse";
  source_artifacts: SourceArtifact[];
  source_state_hash: string;
  identity_resolution: {
    method: "game_id" | "canonical_player_id_and_game_id" | "canonical_player_id_and_roster" | "unresolved";
    actual_team: string | null;
    actual_opponent: string | null;
    team_match: boolean | null;
    roster_status: string | null;
    zero_source: "stats_table" | "active_roster_confirmed" | null;
  };
  actual: ActualOutcome;
  derived: DerivedOutcome;
};

export type OutcomeDraft = Omit<PredictionOutcomeEventV1, "outcome_id" | "outcome_revision" | "supersedes_outcome_id">;

type RawGame = {
  gameId: string;
  season: number;
  week: number;
  homeAbbr: string;
  awayAbbr: string;
  status: string;
};

type RawResult = {
  gameId: string;
  season: number;
  week: number;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  final: boolean;
};

type CsvRow = Record<string, string>;

export type TeamPlayVolumeRow = {
  gameId: string;
  season: number;
  week: number;
  team: string;
  opponent: string;
  eligiblePlays: number;
  passPlays: number;
  rushPlays: number;
};

export type ResolverSeasonSources = {
  season: number;
  games: RawGame[] | null;
  results: RawResult[] | null;
  playerStats: CsvRow[] | null;
  rosters: CsvRow[] | null;
  teamPlayVolume: TeamPlayVolumeRow[] | null;
  artifacts: Partial<Record<SourceArtifact["logical_name"], SourceArtifact>>;
};

export type ResolutionSummary = Record<ResolutionStatus | "already_resolved" | "corrections", number> & {
  spread_resolved: number;
  passing_resolved: number;
  rushing_resolved: number;
  receiving_resolved: number;
  team_opportunity_resolved: number;
  appended: number;
};

function emptySummary(): ResolutionSummary {
  return {
    resolved: 0, pending_game: 0, pending_player_stats: 0, pending_team_stats: 0, inactive: 0, not_applicable: 0,
    identity_unresolved: 0, source_missing: 0, already_resolved: 0, corrections: 0,
    spread_resolved: 0, passing_resolved: 0, rushing_resolved: 0, receiving_resolved: 0, team_opportunity_resolved: 0, appended: 0,
  };
}

function nullableNumber(row: CsvRow, field: string, options: { signed?: boolean } = {}): number | null {
  const raw = row[field];
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || (!options.signed && value < 0)) throw new Error(`Invalid ${field}: ${raw}`);
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${field} must be a non-negative integer`);
  return parsed;
}

function direction(value: number): "home" | "away" | "pick" {
  return value > 0 ? "home" : value < 0 ? "away" : "pick";
}

function spreadDerived(prediction: PredictionSnapshotV1, actual: SpreadActual): SpreadDerived {
  if (prediction.projection.type !== "spread") throw new Error("spread projection mismatch");
  const projection = prediction.projection;
  const projectedDirection = direction(projection.projected_home_margin);
  const actualDirection = direction(actual.margin);
  const marketResults = prediction.market_snapshot_refs
    .filter((reference) => reference.market_type === "spread" && reference.purpose === "comparison")
    .map((reference) => {
      const marketImpliedHomeMargin = -reference.line;
      const jkbSide = projection.projected_home_margin > marketImpliedHomeMargin
        ? "home" as const
        : projection.projected_home_margin < marketImpliedHomeMargin ? "away" as const : "equal" as const;
      const homeCoverMargin = actual.margin + reference.line;
      const atsResult = jkbSide === "equal" ? "not_applicable" as const
        : homeCoverMargin === 0 ? "push" as const
        : (homeCoverMargin > 0) === (jkbSide === "home") ? "win" as const : "loss" as const;
      return {
        market_observation_id: reference.market_observation_id, provider: reference.provider,
        sportsbook: reference.sportsbook, observed_at: reference.observed_at, home_line: reference.line,
        jkb_side: jkbSide, ats_result: atsResult,
      };
    });
  const error = projection.projected_home_margin - actual.margin;
  return {
    type: "spread", margin_error: error, absolute_margin_error: Math.abs(error),
    projected_winner_correct: projectedDirection === actualDirection,
    projected_margin_direction: projectedDirection, market_results: marketResults,
  };
}

function playerDerived(prediction: PredictionSnapshotV1, actual: PassingActual | RushingActual | ReceivingActual): DerivedOutcome {
  const projection = prediction.projection;
  if (projection.type === "passing" && actual.type === "passing") {
    const yardsError = projection.projected_passing_yards - actual.yards;
    return {
      type: "passing", yards_error: yardsError, absolute_yards_error: Math.abs(yardsError),
      attempts_error: projection.projected_attempts == null ? null : projection.projected_attempts - actual.attempts,
      ypa_error: projection.projected_ypa == null || actual.yards_per_attempt == null ? null : projection.projected_ypa - actual.yards_per_attempt,
    };
  }
  if (projection.type === "rushing" && actual.type === "rushing") {
    const yardsError = projection.projected_rushing_yards - actual.yards;
    return {
      type: "rushing", yards_error: yardsError, absolute_yards_error: Math.abs(yardsError),
      carries_error: projection.projected_carries - actual.carries,
      ypc_error: actual.yards_per_carry == null ? null : projection.projected_ypc - actual.yards_per_carry,
    };
  }
  if (projection.type === "receiving" && actual.type === "receiving") {
    const yardsError = projection.projected_receiving_yards - actual.yards;
    return {
      type: "receiving", yards_error: yardsError, absolute_yards_error: Math.abs(yardsError),
      targets_error: projection.projected_targets - actual.targets,
      receptions_error: projection.projected_receptions == null ? null : projection.projected_receptions - actual.receptions,
      yards_per_target_error: actual.yards_per_target == null ? null : projection.projected_yards_per_target - actual.yards_per_target,
      yards_per_reception_error: projection.projected_yards_per_reception == null || actual.yards_per_reception == null
        ? null : projection.projected_yards_per_reception - actual.yards_per_reception,
    };
  }
  throw new Error(`Prediction/actual type mismatch for ${prediction.prediction_id}`);
}

function teamOpportunityDerived(prediction: PredictionSnapshotV1, actual: TeamOpportunityActual): TeamOpportunityDerived {
  if (prediction.projection.type !== "team_opportunity") throw new Error("team_opportunity projection mismatch");
  const projection = prediction.projection;
  const teamPlaysError = projection.projected_team_plays - actual.team_plays;
  const dropbacksError = projection.projected_pass_attempts - actual.dropbacks;
  return {
    type: "team_opportunity",
    team_plays_error: teamPlaysError, absolute_team_plays_error: Math.abs(teamPlaysError),
    dropbacks_error: dropbacksError, absolute_dropbacks_error: Math.abs(dropbacksError),
    dropback_rate_error: projection.projected_dropback_rate - actual.dropback_rate,
    designed_rush_attempts_error: projection.projected_rush_attempts - actual.designed_rush_attempts,
    pass_attempts_error: actual.pass_attempts == null ? null : projection.projected_pass_attempts - actual.pass_attempts,
  };
}

function actualPassAttemptsForTeam(prediction: PredictionSnapshotV1, playerStats: CsvRow[] | null): number | null {
  if (!playerStats) return null;
  const rows = playerStats.filter(
    (row) => row.game_id === prediction.game_id && normalizeNflTeamAbbr(row.team) === prediction.team,
  );
  if (rows.length === 0) return null;
  let total = 0;
  let sawAny = false;
  for (const row of rows) {
    const attempts = nullableNumber(row, "attempts");
    if (attempts == null) continue;
    total += attempts;
    sawAny = true;
  }
  return sawAny ? total : null;
}

function artifactList(sources: ResolverSeasonSources, names: SourceArtifact["logical_name"][]): SourceArtifact[] {
  return names.flatMap((name) => sources.artifacts[name] ? [sources.artifacts[name] as SourceArtifact] : []);
}

function unresolvedDraft(
  prediction: PredictionSnapshotV1,
  status: Exclude<ResolutionStatus, "resolved">,
  sources: ResolverSeasonSources,
  gameCompletionStatus: PredictionOutcomeEventV1["game_completion_status"],
  evidence: JsonValue,
  artifacts: SourceArtifact[],
  identity: PredictionOutcomeEventV1["identity_resolution"],
  recordedAt: string,
): OutcomeDraft {
  return {
    schema_version: OUTCOME_SCHEMA_VERSION, prediction_id: prediction.prediction_id, snapshot_key: prediction.snapshot_key,
    prediction_type: prediction.prediction_type, season: prediction.season, week: prediction.week,
    game_id: prediction.game_id, player_id: prediction.player_id, team: prediction.team, opponent: prediction.opponent,
    recorded_at: recordedAt, resolved_at: null, resolution_status: status, game_completion_status: gameCompletionStatus,
    resolver_version: OUTCOME_RESOLVER_VERSION, provider: "nflverse", source_artifacts: artifacts,
    source_state_hash: contentHash(evidence), identity_resolution: identity, actual: null, derived: null,
  };
}

function gameIdentity(game: RawGame): { home: string | null; away: string | null } {
  return { home: normalizeNflTeamAbbr(game.homeAbbr), away: normalizeNflTeamAbbr(game.awayAbbr) };
}

function exactPlayerRows(prediction: PredictionSnapshotV1, rows: CsvRow[]): CsvRow[] {
  return rows.filter((row) => canonicalPlayerId(row.player_id) === prediction.player_id && row.game_id === prediction.game_id);
}

function rosterRows(prediction: PredictionSnapshotV1, rows: CsvRow[]): CsvRow[] {
  return rows.filter((row) => Number(row.season) === prediction.season && Number(row.week) === prediction.week && canonicalPlayerId(row.gsis_id) === prediction.player_id);
}

function actualFromStats(type: PredictionType, row: CsvRow): PassingActual | RushingActual | ReceivingActual | null {
  if (type === "passing") {
    const attempts = nullableNumber(row, "attempts");
    const yards = nullableNumber(row, "passing_yards", { signed: true });
    if (attempts == null || yards == null) return null;
    return {
      type, attempts, completions: nullableNumber(row, "completions"), yards,
      yards_per_attempt: attempts > 0 ? yards / attempts : null,
      touchdowns: nullableNumber(row, "passing_tds"), interceptions: nullableNumber(row, "passing_interceptions"),
    };
  }
  if (type === "rushing") {
    const carries = nullableNumber(row, "carries");
    const yards = nullableNumber(row, "rushing_yards", { signed: true });
    if (carries == null || yards == null) return null;
    return { type, carries, yards, yards_per_carry: carries > 0 ? yards / carries : null };
  }
  if (type === "receiving") {
    const targets = nullableNumber(row, "targets");
    const receptions = nullableNumber(row, "receptions");
    const yards = nullableNumber(row, "receiving_yards", { signed: true });
    if (targets == null || receptions == null || yards == null) return null;
    return {
      type, targets, receptions, yards,
      yards_per_target: targets > 0 ? yards / targets : null,
      yards_per_reception: receptions > 0 ? yards / receptions : null,
    };
  }
  return null;
}

function zeroActual(type: Exclude<PredictionType, "spread">): PassingActual | RushingActual | ReceivingActual {
  if (type === "passing") return { type, attempts: 0, completions: 0, yards: 0, yards_per_attempt: null, touchdowns: 0, interceptions: 0 };
  if (type === "rushing") return { type, carries: 0, yards: 0, yards_per_carry: null };
  return { type, targets: 0, receptions: 0, yards: 0, yards_per_target: null, yards_per_reception: null };
}

export function resolvePredictionOutcome(
  prediction: PredictionSnapshotV1,
  sources: ResolverSeasonSources,
  recordedAt = new Date().toISOString(),
): OutcomeDraft {
  validatePredictionSnapshot(prediction);
  const gamesArtifacts = artifactList(sources, ["nfl_game_schedule", "nfl_game_results"]);
  if (!sources.games || !sources.results) {
    return unresolvedDraft(prediction, "source_missing", sources, "missing", { games: sources.games, results: sources.results }, gamesArtifacts,
      { method: "unresolved", actual_team: null, actual_opponent: null, team_match: null, roster_status: null, zero_source: null }, recordedAt);
  }
  const game = sources.games.find((candidate) => candidate.gameId === prediction.game_id);
  const result = sources.results.find((candidate) => candidate.gameId === prediction.game_id);
  if (!game) {
    return unresolvedDraft(prediction, "identity_unresolved", sources, "missing", { game_id: prediction.game_id, game: null }, gamesArtifacts,
      { method: "unresolved", actual_team: null, actual_opponent: null, team_match: null, roster_status: null, zero_source: null }, recordedAt);
  }
  const teams = gameIdentity(game);
  if (!teams.home || !teams.away || new Set([teams.home, teams.away]).size !== 2) {
    return unresolvedDraft(prediction, "identity_unresolved", sources, "missing", { game }, gamesArtifacts,
      { method: "unresolved", actual_team: null, actual_opponent: null, team_match: null, roster_status: null, zero_source: null }, recordedAt);
  }
  const isFinal = game.status === "final" && result?.final === true;
  if (!isFinal || !result) {
    return unresolvedDraft(prediction, "pending_game", sources, "not_final", { game, result: result ?? null }, gamesArtifacts,
      { method: "game_id", actual_team: prediction.prediction_type === "spread" ? teams.home : null, actual_opponent: prediction.prediction_type === "spread" ? teams.away : null, team_match: prediction.prediction_type === "spread" ? prediction.team === teams.home && prediction.opponent === teams.away : null, roster_status: null, zero_source: null }, recordedAt);
  }
  const resultHome = normalizeNflTeamAbbr(result.homeAbbr);
  const resultAway = normalizeNflTeamAbbr(result.awayAbbr);
  if (game.season !== prediction.season || game.week !== prediction.week || result.season !== prediction.season || result.week !== prediction.week || resultHome !== teams.home || resultAway !== teams.away) {
    return unresolvedDraft(prediction, "identity_unresolved", sources, "final", { game, result }, gamesArtifacts,
      { method: "unresolved", actual_team: resultHome, actual_opponent: resultAway, team_match: false, roster_status: null, zero_source: null }, recordedAt);
  }
  const homeScore = requiredInteger(result.homeScore, "homeScore");
  const awayScore = requiredInteger(result.awayScore, "awayScore");

  if (prediction.prediction_type === "team_opportunity") {
    // Team-level grade: only games + the play-volume-team-game cache are
    // required. Deliberately does NOT gate on player-week stats or rosters
    // (Part 10) -- a delayed player-stat publication must never block
    // grading WU4A's team-level plays/dropback-rate/rush-attempts targets.
    const teamOppArtifacts = artifactList(sources, ["nfl_game_schedule", "nfl_game_results", "nfl_team_play_volume"]);
    if (prediction.team !== teams.home && prediction.team !== teams.away) {
      return unresolvedDraft(prediction, "identity_unresolved", sources, "final", { game, result }, teamOppArtifacts,
        { method: "game_id", actual_team: null, actual_opponent: null, team_match: false, roster_status: null, zero_source: null }, recordedAt);
    }
    if (!sources.teamPlayVolume) {
      return unresolvedDraft(prediction, "source_missing", sources, "final", { game, result, team_play_volume: null }, teamOppArtifacts,
        { method: "unresolved", actual_team: null, actual_opponent: null, team_match: null, roster_status: null, zero_source: null }, recordedAt);
    }
    const volumeRow = sources.teamPlayVolume.find(
      (row) => row.gameId === prediction.game_id && normalizeNflTeamAbbr(row.team) === prediction.team,
    );
    if (!volumeRow) {
      return unresolvedDraft(prediction, "pending_team_stats", sources, "final", { game, result, team_play_volume: null }, teamOppArtifacts,
        { method: "game_id", actual_team: prediction.team, actual_opponent: prediction.opponent, team_match: true, roster_status: null, zero_source: null }, recordedAt);
    }
    if (volumeRow.eligiblePlays <= 0) {
      return unresolvedDraft(prediction, "identity_unresolved", sources, "final", { game, result, team_play_volume: volumeRow }, teamOppArtifacts,
        { method: "game_id", actual_team: prediction.team, actual_opponent: prediction.opponent, team_match: true, roster_status: null, zero_source: null }, recordedAt);
    }
    const actual: TeamOpportunityActual = {
      type: "team_opportunity", team_plays: volumeRow.eligiblePlays, dropbacks: volumeRow.passPlays,
      dropback_rate: volumeRow.passPlays / volumeRow.eligiblePlays, designed_rush_attempts: volumeRow.rushPlays,
      pass_attempts: actualPassAttemptsForTeam(prediction, sources.playerStats),
    };
    return {
      schema_version: OUTCOME_SCHEMA_VERSION, prediction_id: prediction.prediction_id, snapshot_key: prediction.snapshot_key,
      prediction_type: "team_opportunity", season: prediction.season, week: prediction.week, game_id: prediction.game_id,
      player_id: null, team: prediction.team, opponent: prediction.opponent, recorded_at: recordedAt, resolved_at: recordedAt,
      resolution_status: "resolved", game_completion_status: "final", resolver_version: OUTCOME_RESOLVER_VERSION,
      provider: "nflverse", source_artifacts: teamOppArtifacts, source_state_hash: contentHash({ game, result, team_play_volume: volumeRow } as unknown as JsonValue),
      identity_resolution: { method: "game_id", actual_team: prediction.team, actual_opponent: prediction.opponent, team_match: true, roster_status: null, zero_source: null },
      actual, derived: teamOpportunityDerived(prediction, actual),
    };
  }

  if (prediction.prediction_type === "spread") {
    if (prediction.team !== teams.home || prediction.opponent !== teams.away || prediction.home_away !== "home") {
      return unresolvedDraft(prediction, "identity_unresolved", sources, "final", { game, result }, gamesArtifacts,
        { method: "game_id", actual_team: teams.home, actual_opponent: teams.away, team_match: false, roster_status: null, zero_source: null }, recordedAt);
    }
    const margin = homeScore - awayScore;
    const actual: SpreadActual = { type: "spread", home_score: homeScore, away_score: awayScore, margin, total: homeScore + awayScore, winner: margin > 0 ? "home" : margin < 0 ? "away" : "tie" };
    return {
      schema_version: OUTCOME_SCHEMA_VERSION, prediction_id: prediction.prediction_id, snapshot_key: prediction.snapshot_key,
      prediction_type: "spread", season: prediction.season, week: prediction.week, game_id: prediction.game_id,
      player_id: null, team: prediction.team, opponent: prediction.opponent, recorded_at: recordedAt, resolved_at: recordedAt,
      resolution_status: "resolved", game_completion_status: "final", resolver_version: OUTCOME_RESOLVER_VERSION,
      provider: "nflverse", source_artifacts: gamesArtifacts, source_state_hash: contentHash({ game, result } as unknown as JsonValue),
      identity_resolution: { method: "game_id", actual_team: teams.home, actual_opponent: teams.away, team_match: prediction.team === teams.home && prediction.opponent === teams.away, roster_status: null, zero_source: null },
      actual, derived: spreadDerived(prediction, actual),
    };
  }

  const playerArtifacts = artifactList(sources, ["nfl_game_schedule", "nfl_game_results", "nfl_player_week_stats", "nfl_weekly_roster"]);
  if (!sources.playerStats) {
    return unresolvedDraft(prediction, "source_missing", sources, "final", { game, result, player_stats: null }, playerArtifacts,
      { method: "unresolved", actual_team: null, actual_opponent: null, team_match: null, roster_status: null, zero_source: null }, recordedAt);
  }
  const statsMatches = exactPlayerRows(prediction, sources.playerStats);
  if (statsMatches.length > 1) {
    return unresolvedDraft(prediction, "identity_unresolved", sources, "final", { game, result, stats_matches: statsMatches }, playerArtifacts,
      { method: "unresolved", actual_team: null, actual_opponent: null, team_match: null, roster_status: null, zero_source: null }, recordedAt);
  }
  if (statsMatches.length === 1) {
    const row = statsMatches[0];
    const actualTeam = normalizeNflTeamAbbr(row.team);
    const actualOpponent = normalizeNflTeamAbbr(row.opponent_team);
    if (!actualTeam || !actualOpponent || ![teams.home, teams.away].includes(actualTeam) || ![teams.home, teams.away].includes(actualOpponent) || actualTeam === actualOpponent) {
      return unresolvedDraft(prediction, "identity_unresolved", sources, "final", { game, result, stats_row: row }, playerArtifacts,
        { method: "unresolved", actual_team: actualTeam, actual_opponent: actualOpponent, team_match: false, roster_status: null, zero_source: null }, recordedAt);
    }
    const actual = actualFromStats(prediction.prediction_type, row);
    if (!actual) {
      return unresolvedDraft(prediction, "pending_player_stats", sources, "final", { game, result, stats_row: row }, playerArtifacts,
        { method: "canonical_player_id_and_game_id", actual_team: actualTeam, actual_opponent: actualOpponent, team_match: actualTeam === prediction.team, roster_status: null, zero_source: "stats_table" }, recordedAt);
    }
    return {
      schema_version: OUTCOME_SCHEMA_VERSION, prediction_id: prediction.prediction_id, snapshot_key: prediction.snapshot_key,
      prediction_type: prediction.prediction_type, season: prediction.season, week: prediction.week, game_id: prediction.game_id,
      player_id: prediction.player_id, team: prediction.team, opponent: prediction.opponent, recorded_at: recordedAt, resolved_at: recordedAt,
      resolution_status: "resolved", game_completion_status: "final", resolver_version: OUTCOME_RESOLVER_VERSION,
      provider: "nflverse", source_artifacts: playerArtifacts,
      source_state_hash: contentHash({ game, result, stats_row: row } as unknown as JsonValue),
      identity_resolution: { method: "canonical_player_id_and_game_id", actual_team: actualTeam, actual_opponent: actualOpponent, team_match: actualTeam === prediction.team && actualOpponent === prediction.opponent, roster_status: null, zero_source: "stats_table" },
      actual, derived: playerDerived(prediction, actual),
    };
  }

  // A weekly nflverse file may be published incrementally. Roster evidence is
  // safe for a zero/inactive decision only after this exact game's box-score
  // rows are present; otherwise an ACT player could be turned into a false zero.
  const gameStatsPublished = sources.playerStats.some((row) => row.game_id === prediction.game_id);
  if (!gameStatsPublished) {
    return unresolvedDraft(prediction, "pending_player_stats", sources, "final", { game, result, stats_row: null, game_stats_published: false }, playerArtifacts,
      { method: "unresolved", actual_team: null, actual_opponent: null, team_match: null, roster_status: null, zero_source: null }, recordedAt);
  }

  if (!sources.rosters) {
    return unresolvedDraft(prediction, "pending_player_stats", sources, "final", { game, result, stats_row: null, roster_source: null }, playerArtifacts,
      { method: "unresolved", actual_team: null, actual_opponent: null, team_match: null, roster_status: null, zero_source: null }, recordedAt);
  }
  const rosterMatches = rosterRows(prediction, sources.rosters);
  const gameRosterMatches = rosterMatches.filter((row) => {
    const team = normalizeNflTeamAbbr(row.team);
    return team != null && [teams.home, teams.away].includes(team);
  });
  if (gameRosterMatches.length !== 1) {
    return unresolvedDraft(prediction, rosterMatches.length ? "identity_unresolved" : "pending_player_stats", sources, "final", { game, result, stats_row: null, roster_matches: rosterMatches }, playerArtifacts,
      { method: "unresolved", actual_team: rosterMatches.length === 1 ? normalizeNflTeamAbbr(rosterMatches[0].team) : null, actual_opponent: null, team_match: false, roster_status: rosterMatches.length === 1 ? rosterMatches[0].status || null : null, zero_source: null }, recordedAt);
  }
  const roster = gameRosterMatches[0];
  const actualTeam = normalizeNflTeamAbbr(roster.team) as string;
  const actualOpponent = actualTeam === teams.home ? teams.away : teams.home;
  const rosterStatus = roster.status.trim().toUpperCase();
  const identity = { method: "canonical_player_id_and_roster" as const, actual_team: actualTeam, actual_opponent: actualOpponent, team_match: actualTeam === prediction.team && actualOpponent === prediction.opponent, roster_status: rosterStatus, zero_source: null as "active_roster_confirmed" | null };
  if (rosterStatus === "INA") {
    return unresolvedDraft(prediction, "inactive", sources, "final", { game, result, stats_row: null, roster }, playerArtifacts, identity, recordedAt);
  }
  if (rosterStatus !== "ACT") {
    return unresolvedDraft(prediction, "not_applicable", sources, "final", { game, result, stats_row: null, roster }, playerArtifacts, identity, recordedAt);
  }
  const actual = zeroActual(prediction.prediction_type);
  return {
    schema_version: OUTCOME_SCHEMA_VERSION, prediction_id: prediction.prediction_id, snapshot_key: prediction.snapshot_key,
    prediction_type: prediction.prediction_type, season: prediction.season, week: prediction.week, game_id: prediction.game_id,
    player_id: prediction.player_id, team: prediction.team, opponent: prediction.opponent, recorded_at: recordedAt, resolved_at: recordedAt,
    resolution_status: "resolved", game_completion_status: "final", resolver_version: OUTCOME_RESOLVER_VERSION,
    provider: "nflverse", source_artifacts: playerArtifacts,
    source_state_hash: contentHash({ game, result, stats_row: null, roster } as unknown as JsonValue),
    identity_resolution: { ...identity, zero_source: "active_roster_confirmed" }, actual, derived: playerDerived(prediction, actual),
  };
}

function eventState(draft: OutcomeDraft | PredictionOutcomeEventV1): JsonValue {
  return {
    prediction_id: draft.prediction_id, resolution_status: draft.resolution_status,
    game_completion_status: draft.game_completion_status, source_state_hash: draft.source_state_hash,
    identity_resolution: draft.identity_resolution, actual: draft.actual, derived: draft.derived,
  } as unknown as JsonValue;
}

function eventIdentity(event: Pick<PredictionOutcomeEventV1, "prediction_id" | "outcome_revision"> & OutcomeDraft): JsonValue {
  return { prediction_id: event.prediction_id, outcome_revision: event.outcome_revision, state: eventState(event) } as unknown as JsonValue;
}

export function validateOutcomeEvent(event: PredictionOutcomeEventV1): void {
  if (event.schema_version !== OUTCOME_SCHEMA_VERSION) throw new Error("unsupported outcome schema_version");
  if (!event.prediction_id.startsWith("pred_")) throw new Error("invalid prediction_id");
  if (!Number.isInteger(event.outcome_revision) || event.outcome_revision < 1) throw new Error("invalid outcome_revision");
  if (!event.outcome_id.startsWith("outcome_") || event.outcome_id !== `outcome_${contentHash(eventIdentity(event))}`) throw new Error("outcome_id mismatch");
  if (!event.source_state_hash || !event.game_id || !event.snapshot_key) throw new Error("outcome identity fields are required");
  if (event.resolution_status === "resolved" && (!event.actual || !event.derived || !event.resolved_at)) throw new Error("resolved event requires actual, derived, and resolved_at");
  if (event.resolution_status !== "resolved" && (event.actual != null || event.derived != null || event.resolved_at != null)) throw new Error("unresolved event cannot contain actual/derived/resolved_at");
  canonicalJson(event as unknown as JsonValue);
}

function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function outcomePath(rootDir: string, draft: OutcomeDraft): string {
  return join(rootDir, String(draft.season), String(draft.week).padStart(2, "0"), `${draft.prediction_type}.jsonl`);
}

export function appendOutcomeDrafts(options: { rootDir: string; drafts: readonly OutcomeDraft[]; dryRun?: boolean }): {
  events: PredictionOutcomeEventV1[];
  appended: number;
  alreadyResolved: number;
  corrections: number;
  files: string[];
} {
  const grouped = new Map<string, OutcomeDraft[]>();
  for (const draft of options.drafts) {
    const path = outcomePath(options.rootDir, draft);
    grouped.set(path, [...(grouped.get(path) ?? []), draft]);
  }
  const events: PredictionOutcomeEventV1[] = [];
  const files: string[] = [];
  let appended = 0;
  let alreadyResolved = 0;
  let corrections = 0;
  for (const [path, drafts] of grouped) {
    const existing = existsSync(path)
      ? readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as PredictionOutcomeEventV1)
      : [];
    existing.forEach(validateOutcomeEvent);
    const all = [...existing];
    for (const draft of drafts) {
      const prior = all.filter((event) => event.prediction_id === draft.prediction_id).sort((a, b) => b.outcome_revision - a.outcome_revision)[0] ?? null;
      if (prior && canonicalJson(eventState(prior)) === canonicalJson(eventState(draft))) {
        alreadyResolved += 1;
        events.push(prior);
        continue;
      }
      const outcomeRevision = (prior?.outcome_revision ?? 0) + 1;
      const outcomeId = `outcome_${contentHash(eventIdentity({ ...draft, outcome_revision: outcomeRevision }))}`;
      const event: PredictionOutcomeEventV1 = {
        ...draft, outcome_id: outcomeId, outcome_revision: outcomeRevision,
        supersedes_outcome_id: prior?.outcome_id ?? null,
      };
      validateOutcomeEvent(event);
      all.push(event);
      events.push(event);
      appended += 1;
      if (prior) corrections += 1;
    }
    if (all.length !== existing.length && !options.dryRun) {
      atomicWrite(path, `${all.map((event) => canonicalJson(event as unknown as JsonValue)).join("\n")}\n`);
      files.push(path);
    }
  }
  return { events, appended, alreadyResolved, corrections, files };
}

export function summarizeResolution(drafts: readonly OutcomeDraft[], write: ReturnType<typeof appendOutcomeDrafts>): ResolutionSummary {
  const summary = emptySummary();
  for (const draft of drafts) {
    summary[draft.resolution_status] += 1;
    if (draft.resolution_status === "resolved") summary[`${draft.prediction_type}_resolved` as keyof ResolutionSummary] += 1;
  }
  summary.appended = write.appended;
  summary.already_resolved = write.alreadyResolved;
  summary.corrections = write.corrections;
  return summary;
}

function jsonSourceUpdatedAt(text: string): string | null {
  const parsed = JSON.parse(text) as { _meta?: { generatedAt?: unknown } };
  return typeof parsed._meta?.generatedAt === "string" ? parsed._meta.generatedAt : null;
}

function manifestSourceUpdatedAt(path: string, season: number): string | null {
  if (!existsSync(path)) return null;
  const manifest = JSON.parse(readFileSync(path, "utf8")) as { files?: { season?: number; retrievedAtUtc?: string; retrievedDateUtc?: string }[] };
  const entry = manifest.files?.find((file) => file.season === season);
  return entry?.retrievedAtUtc ?? entry?.retrievedDateUtc ?? null;
}

function readArtifact(options: {
  rootDir: string;
  relativePath: string;
  logicalName: SourceArtifact["logical_name"];
  provider: string;
  sourceUpdatedAt: (text: string) => string | null;
}): { text: string; artifact: SourceArtifact } | null {
  const path = join(options.rootDir, ...options.relativePath.split("/"));
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  return {
    text,
    artifact: {
      logical_name: options.logicalName, path: options.relativePath, provider: options.provider,
      content_hash: contentHash(text), source_updated_at: options.sourceUpdatedAt(text),
    },
  };
}

export function loadResolverSeasonSources(rootDir: string, season: number): ResolverSeasonSources {
  const schedule = readArtifact({
    rootDir, relativePath: `public/data/nfl/${season}/games.json`, logicalName: "nfl_game_schedule",
    provider: "nflverse/nfldata games.csv", sourceUpdatedAt: jsonSourceUpdatedAt,
  });
  const results = readArtifact({
    rootDir, relativePath: `public/data/nfl/${season}/results.json`, logicalName: "nfl_game_results",
    provider: "nflverse/nfldata games.csv", sourceUpdatedAt: jsonSourceUpdatedAt,
  });
  const playerManifestPath = join(rootDir, "data", "nfl", "nflverse", "player-week-stats", "manifest.json");
  const stats = readArtifact({
    rootDir, relativePath: `data/nfl/nflverse/player-week-stats/stats_player_week_${season}.csv`, logicalName: "nfl_player_week_stats",
    provider: "nflverse/nflverse-data stats_player", sourceUpdatedAt: () => manifestSourceUpdatedAt(playerManifestPath, season),
  });
  const rosterManifestPath = join(rootDir, "data", "nfl", "nflverse", "weekly-rosters", "manifest.json");
  const rosters = readArtifact({
    rootDir, relativePath: `data/nfl/nflverse/weekly-rosters/roster_weekly_${season}.csv`, logicalName: "nfl_weekly_roster",
    provider: "nflverse/nflverse-data weekly_rosters", sourceUpdatedAt: () => manifestSourceUpdatedAt(rosterManifestPath, season),
  });
  const playVolumeManifestPath = join(rootDir, "data", "nfl", "nflverse", "play-volume-team-game", "manifest.json");
  const playVolume = readArtifact({
    rootDir, relativePath: `data/nfl/nflverse/play-volume-team-game/play_volume_team_game_${season}.csv`, logicalName: "nfl_team_play_volume",
    provider: "nflverse (play-by-play, nflfastR)", sourceUpdatedAt: () => manifestSourceUpdatedAt(playVolumeManifestPath, season),
  });
  const gamesPayload = schedule ? JSON.parse(schedule.text) as { games?: RawGame[] } : null;
  const resultsPayload = results ? JSON.parse(results.text) as { results?: RawResult[] } : null;
  const teamPlayVolume: TeamPlayVolumeRow[] | null = playVolume
    ? (parseCsv(playVolume.text) as CsvRow[]).map((row) => parsePlayVolumeCompactRow(row) as TeamPlayVolumeRow)
    : null;
  return {
    season,
    games: gamesPayload?.games ?? null,
    results: resultsPayload?.results ?? null,
    playerStats: stats ? parseCsv(stats.text) as CsvRow[] : null,
    rosters: rosters ? parseCsv(rosters.text) as CsvRow[] : null,
    teamPlayVolume,
    artifacts: Object.fromEntries([schedule, results, stats, rosters, playVolume].filter((item) => item != null).map((item) => [item.artifact.logical_name, item.artifact])),
  };
}
