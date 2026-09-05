/**
 * WU1: deterministic, pregame NFL starter-cohort selector.
 *
 * Freezes, for every (season, week, game_id, team), the starter-level
 * players eligible for later props performance grading: 1 QB, 1 RB, up to 3
 * WR, 1 TE. Every input is an already-archived, immutable, PRODUCTION-mode
 * prediction row (`data/nfl/predictions/<season>/<week>/*.jsonl`). Nothing
 * here reads outcomes, results, or actual stats -- see the pregame-cutoff
 * checks in `isValidPregameRow`/`isValidPregameRole`, which are the only
 * gates on which archived evidence is eligible to be used at all.
 *
 * QB uses a two-stage hierarchy (see `selectQb`):
 *   1. QB1_BY_ARCHIVED_DEPTH_CHART -- archived `feature_snapshot.values.role`
 *      evidence (starter_flag + depth_rank), only when its
 *      `role_source_updated_at` is itself provably pregame.
 *   2. QB1_BY_PROJECTED_PASSING_YARDS -- fallback when no depth-chart
 *      evidence qualifies, ranked by the archived passing-yards projection.
 *      `projection.projected_attempts` is NEVER used: it is null in every
 *      currently-archived row (nfl-passing-direct-ridge predicts yards
 *      directly), so a `QB1_BY_PROJECTED_ATTEMPTS` basis would silently
 *      substitute a metric that doesn't exist. If that field starts being
 *      populated later, a new basis should be added rather than repurposing
 *      this one.
 *
 * RB/WR/TE rank by the archived workload projection
 * (`projected_carries`/`projected_targets`) already present on `rushing`/
 * `receiving` prediction rows, filtered to the relevant `position`.
 */
import type { PredictionSnapshotV1 } from "./nfl-production-prediction-archive";
import { canonicalJson, contentHash } from "./nfl-production-prediction-archive";

export const STARTER_COHORT_SCHEMA_VERSION = "nfl-starter-cohort-v1" as const;

export type StarterBasis =
  | "QB1_BY_ARCHIVED_DEPTH_CHART"
  | "QB1_BY_PROJECTED_PASSING_YARDS"
  | "RB1_BY_PROJECTED_CARRIES"
  | "WR1_BY_PROJECTED_TARGETS"
  | "WR2_BY_PROJECTED_TARGETS"
  | "WR3_BY_PROJECTED_TARGETS"
  | "TE1_BY_PROJECTED_TARGETS";

export type StarterSlot = "QB1" | "RB1" | "WR1" | "WR2" | "WR3" | "TE1";

export type StarterCohortRecordV1 = {
  schema_version: typeof STARTER_COHORT_SCHEMA_VERSION;
  cohort_row_id: string;
  season: number;
  week: number;
  game_id: string;
  kickoff_time: string;
  team: string;
  opponent: string;
  home_away: "home" | "away";
  player_id: string;
  player_name: string | null;
  position: "QB" | "RB" | "WR" | "TE";
  starter_eligible: true;
  starter_basis: StarterBasis;
  starter_rank: number;
  starter_metric: "depth_rank" | "projected_passing_yards" | "projected_carries" | "projected_targets";
  starter_metric_value: number;
  eligibility_prediction_timestamp: string;
  eligibility_model_version: string;
  eligibility_prediction_id: string;
  eligibility_source_type: "archived_depth_chart_role" | "archived_projection";
  role_source_updated_at: string | null;
  generated_at: string;
};

export type MissingStarterSlot = {
  season: number;
  week: number;
  game_id: string;
  team: string;
  opponent: string;
  slot: StarterSlot;
  reason:
    | "no_archived_projection_for_position"
    | "no_valid_pregame_qb_evidence";
};

type GameTeamKey = string;

function gameTeamKey(row: Pick<PredictionSnapshotV1, "game_id" | "team">): GameTeamKey {
  return `${row.game_id}|${row.team}`;
}

/**
 * Pregame validity gate applied to EVERY candidate row before it may be used
 * for eligibility: production mode only (never shadow/backtest/replay),
 * status must be an actual projection, and the prediction timestamp must be
 * strictly before kickoff. `validatePredictionSnapshot` (run by the archive
 * loader) already enforces `prediction_timestamp < kickoff_utc` for
 * production rows, but this is re-checked here defensively so this module
 * never depends on that invariant holding upstream.
 */
function isValidPregameRow(row: PredictionSnapshotV1, kickoffMillis: number): boolean {
  if (row.mode !== "production") return false;
  if (row.status !== "projected") return false;
  if (row.player_id == null) return false;
  const predictionMillis = Date.parse(row.prediction_timestamp);
  return Number.isFinite(predictionMillis) && predictionMillis < kickoffMillis;
}

type RoleEvidence = { starter_flag: boolean; depth_rank: number; role_source_updated_at: string };

function readRoleEvidence(row: PredictionSnapshotV1): RoleEvidence | null {
  const role = row.feature_snapshot.values.role as Record<string, unknown> | undefined;
  if (!role || typeof role !== "object") return null;
  const starterFlag = role.starter_flag;
  const depthRank = role.depth_rank;
  const roleSourceUpdatedAt = role.role_source_updated_at;
  if (typeof starterFlag !== "boolean") return null;
  if (typeof depthRank !== "number" || !Number.isFinite(depthRank)) return null;
  if (typeof roleSourceUpdatedAt !== "string") return null;
  return { starter_flag: starterFlag, depth_rank: depthRank, role_source_updated_at: roleSourceUpdatedAt };
}

/** Role evidence is pregame-eligible only when its own source timestamp precedes kickoff. */
function isValidPregameRole(role: RoleEvidence, kickoffMillis: number): boolean {
  const roleMillis = Date.parse(role.role_source_updated_at);
  return Number.isFinite(roleMillis) && roleMillis <= kickoffMillis;
}

/**
 * Latest valid pregame snapshot per player_id within one (game_id, team)
 * group. Rows failing `isValidPregameRow` (including post-kickoff snapshots)
 * are dropped before the "latest" comparison runs, so a stale-but-valid
 * earlier snapshot is never displaced by an invalid later one.
 */
function latestPregameByPlayer(rows: readonly PredictionSnapshotV1[], kickoffMillis: number): Map<string, PredictionSnapshotV1> {
  const out = new Map<string, PredictionSnapshotV1>();
  for (const row of rows) {
    if (!isValidPregameRow(row, kickoffMillis)) continue;
    const playerId = row.player_id as string;
    const prior = out.get(playerId);
    if (!prior || row.prediction_timestamp > prior.prediction_timestamp) out.set(playerId, row);
  }
  return out;
}

function playerIdAscending(a: PredictionSnapshotV1, b: PredictionSnapshotV1): number {
  return (a.player_id as string).localeCompare(b.player_id as string);
}

function selectQbDepthChart(candidates: readonly PredictionSnapshotV1[], kickoffMillis: number): PredictionSnapshotV1 | null {
  const starters = candidates
    .map((row) => ({ row, role: readRoleEvidence(row) }))
    .filter((entry): entry is { row: PredictionSnapshotV1; role: RoleEvidence } => entry.role != null && entry.role.starter_flag === true && isValidPregameRole(entry.role, kickoffMillis));
  if (starters.length === 0) return null;
  starters.sort((a, b) => a.role.depth_rank - b.role.depth_rank || playerIdAscending(a.row, b.row));
  return starters[0].row;
}

function selectQbProjectionFallback(candidates: readonly PredictionSnapshotV1[]): PredictionSnapshotV1 | null {
  const eligible = candidates.filter(
    (row) => row.projection.type === "passing" && Number.isFinite(row.projection.projected_passing_yards),
  );
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const aYards = (a.projection as { projected_passing_yards: number }).projected_passing_yards;
    const bYards = (b.projection as { projected_passing_yards: number }).projected_passing_yards;
    return bYards - aYards || playerIdAscending(a, b);
  });
  return eligible[0];
}

function selectRankedByMetric(
  candidates: readonly PredictionSnapshotV1[],
  metric: (row: PredictionSnapshotV1) => number | null,
  topN: number,
): PredictionSnapshotV1[] {
  const eligible = candidates
    .map((row) => ({ row, value: metric(row) }))
    .filter((entry): entry is { row: PredictionSnapshotV1; value: number } => entry.value != null && Number.isFinite(entry.value));
  eligible.sort((a, b) => b.value - a.value || playerIdAscending(a.row, b.row));
  return eligible.slice(0, topN).map((entry) => entry.row);
}

function buildRecord(input: {
  row: PredictionSnapshotV1;
  basis: StarterBasis;
  rank: number;
  metric: StarterCohortRecordV1["starter_metric"];
  metricValue: number;
  sourceType: StarterCohortRecordV1["eligibility_source_type"];
  roleSourceUpdatedAt: string | null;
  generatedAt: string;
}): StarterCohortRecordV1 {
  const { row } = input;
  const identity = {
    season: row.season,
    week: row.week,
    game_id: row.game_id,
    team: row.team,
    player_id: row.player_id,
    starter_basis: input.basis,
  };
  return {
    schema_version: STARTER_COHORT_SCHEMA_VERSION,
    cohort_row_id: `starter_${contentHash(identity)}`,
    season: row.season,
    week: row.week,
    game_id: row.game_id,
    kickoff_time: row.kickoff_utc,
    team: row.team,
    opponent: row.opponent,
    home_away: row.home_away,
    player_id: row.player_id as string,
    player_name: row.player_name_at_prediction,
    position: row.position as "QB" | "RB" | "WR" | "TE",
    starter_eligible: true,
    starter_basis: input.basis,
    starter_rank: input.rank,
    starter_metric: input.metric,
    starter_metric_value: input.metricValue,
    eligibility_prediction_timestamp: row.prediction_timestamp,
    eligibility_model_version: row.model_version,
    eligibility_prediction_id: row.prediction_id,
    eligibility_source_type: input.sourceType,
    role_source_updated_at: input.roleSourceUpdatedAt,
    generated_at: input.generatedAt,
  };
}

export function buildStarterCohort(input: {
  passing: readonly PredictionSnapshotV1[];
  rushing: readonly PredictionSnapshotV1[];
  receiving: readonly PredictionSnapshotV1[];
  generatedAt: string;
}): { records: StarterCohortRecordV1[]; missing: MissingStarterSlot[] } {
  for (const row of input.passing) if (row.prediction_type !== "passing") throw new Error(`expected passing prediction_type, got ${row.prediction_type}`);
  for (const row of input.rushing) if (row.prediction_type !== "rushing") throw new Error(`expected rushing prediction_type, got ${row.prediction_type}`);
  for (const row of input.receiving) if (row.prediction_type !== "receiving") throw new Error(`expected receiving prediction_type, got ${row.prediction_type}`);

  const teamContext = new Map<GameTeamKey, { season: number; week: number; game_id: string; team: string; opponent: string; kickoffUtc: string }>();
  const passingByTeam = new Map<GameTeamKey, PredictionSnapshotV1[]>();
  const rushingRbByTeam = new Map<GameTeamKey, PredictionSnapshotV1[]>();
  const receivingWrByTeam = new Map<GameTeamKey, PredictionSnapshotV1[]>();
  const receivingTeByTeam = new Map<GameTeamKey, PredictionSnapshotV1[]>();

  const registerContext = (row: PredictionSnapshotV1) => {
    const key = gameTeamKey(row);
    if (!teamContext.has(key)) {
      teamContext.set(key, { season: row.season, week: row.week, game_id: row.game_id, team: row.team, opponent: row.opponent, kickoffUtc: row.kickoff_utc });
    }
  };

  for (const row of input.passing) {
    registerContext(row);
    if (row.position !== "QB") continue;
    const key = gameTeamKey(row);
    passingByTeam.set(key, [...(passingByTeam.get(key) ?? []), row]);
  }
  for (const row of input.rushing) {
    registerContext(row);
    if (row.position !== "RB") continue;
    const key = gameTeamKey(row);
    rushingRbByTeam.set(key, [...(rushingRbByTeam.get(key) ?? []), row]);
  }
  for (const row of input.receiving) {
    registerContext(row);
    const key = gameTeamKey(row);
    if (row.position === "WR") receivingWrByTeam.set(key, [...(receivingWrByTeam.get(key) ?? []), row]);
    else if (row.position === "TE") receivingTeByTeam.set(key, [...(receivingTeByTeam.get(key) ?? []), row]);
  }

  const records: StarterCohortRecordV1[] = [];
  const missing: MissingStarterSlot[] = [];

  for (const [key, context] of teamContext) {
    const kickoffMillis = Date.parse(context.kickoffUtc);
    const missingBase = { season: context.season, week: context.week, game_id: context.game_id, team: context.team, opponent: context.opponent };

    // QB: depth-chart primary, projected-passing-yards fallback.
    const qbCandidates = latestPregameByPlayer(passingByTeam.get(key) ?? [], kickoffMillis);
    const qbCandidateRows = [...qbCandidates.values()];
    const depthChartQb = selectQbDepthChart(qbCandidateRows, kickoffMillis);
    if (depthChartQb) {
      const role = readRoleEvidence(depthChartQb) as RoleEvidence;
      records.push(buildRecord({
        row: depthChartQb, basis: "QB1_BY_ARCHIVED_DEPTH_CHART", rank: 1,
        metric: "depth_rank", metricValue: role.depth_rank,
        sourceType: "archived_depth_chart_role", roleSourceUpdatedAt: role.role_source_updated_at,
        generatedAt: input.generatedAt,
      }));
    } else {
      const fallbackQb = selectQbProjectionFallback(qbCandidateRows);
      if (fallbackQb && fallbackQb.projection.type === "passing") {
        records.push(buildRecord({
          row: fallbackQb, basis: "QB1_BY_PROJECTED_PASSING_YARDS", rank: 1,
          metric: "projected_passing_yards", metricValue: fallbackQb.projection.projected_passing_yards,
          sourceType: "archived_projection", roleSourceUpdatedAt: null,
          generatedAt: input.generatedAt,
        }));
      } else {
        missing.push({ ...missingBase, slot: "QB1", reason: qbCandidateRows.length === 0 ? "no_archived_projection_for_position" : "no_valid_pregame_qb_evidence" });
      }
    }

    // RB: single slot by projected_carries.
    const rbCandidates = [...latestPregameByPlayer(rushingRbByTeam.get(key) ?? [], kickoffMillis).values()];
    const rbWinner = selectRankedByMetric(rbCandidates, (row) => (row.projection.type === "rushing" ? row.projection.projected_carries : null), 1);
    if (rbWinner.length === 1 && rbWinner[0].projection.type === "rushing") {
      records.push(buildRecord({
        row: rbWinner[0], basis: "RB1_BY_PROJECTED_CARRIES", rank: 1,
        metric: "projected_carries", metricValue: rbWinner[0].projection.projected_carries,
        sourceType: "archived_projection", roleSourceUpdatedAt: null, generatedAt: input.generatedAt,
      }));
    } else {
      missing.push({ ...missingBase, slot: "RB1", reason: "no_archived_projection_for_position" });
    }

    // WR: top 3 by projected_targets.
    const wrCandidates = [...latestPregameByPlayer(receivingWrByTeam.get(key) ?? [], kickoffMillis).values()];
    const wrWinners = selectRankedByMetric(wrCandidates, (row) => (row.projection.type === "receiving" ? row.projection.projected_targets : null), 3);
    const wrBases: StarterBasis[] = ["WR1_BY_PROJECTED_TARGETS", "WR2_BY_PROJECTED_TARGETS", "WR3_BY_PROJECTED_TARGETS"];
    const wrSlots: StarterSlot[] = ["WR1", "WR2", "WR3"];
    for (let i = 0; i < 3; i += 1) {
      const winner = wrWinners[i];
      if (winner && winner.projection.type === "receiving") {
        records.push(buildRecord({
          row: winner, basis: wrBases[i], rank: i + 1,
          metric: "projected_targets", metricValue: winner.projection.projected_targets,
          sourceType: "archived_projection", roleSourceUpdatedAt: null, generatedAt: input.generatedAt,
        }));
      } else {
        missing.push({ ...missingBase, slot: wrSlots[i], reason: "no_archived_projection_for_position" });
      }
    }

    // TE: single slot by projected_targets.
    const teCandidates = [...latestPregameByPlayer(receivingTeByTeam.get(key) ?? [], kickoffMillis).values()];
    const teWinner = selectRankedByMetric(teCandidates, (row) => (row.projection.type === "receiving" ? row.projection.projected_targets : null), 1);
    if (teWinner.length === 1 && teWinner[0].projection.type === "receiving") {
      records.push(buildRecord({
        row: teWinner[0], basis: "TE1_BY_PROJECTED_TARGETS", rank: 1,
        metric: "projected_targets", metricValue: teWinner[0].projection.projected_targets,
        sourceType: "archived_projection", roleSourceUpdatedAt: null, generatedAt: input.generatedAt,
      }));
    } else {
      missing.push({ ...missingBase, slot: "TE1", reason: "no_archived_projection_for_position" });
    }
  }

  records.sort((a, b) =>
    a.game_id.localeCompare(b.game_id) ||
    a.team.localeCompare(b.team) ||
    a.position.localeCompare(b.position) ||
    a.starter_rank - b.starter_rank ||
    a.player_id.localeCompare(b.player_id),
  );
  missing.sort((a, b) =>
    a.game_id.localeCompare(b.game_id) || a.team.localeCompare(b.team) || a.slot.localeCompare(b.slot),
  );

  return { records, missing };
}

export function serializeStarterCohort(records: readonly StarterCohortRecordV1[]): string {
  return records.map((record) => canonicalJson(record)).join("\n") + (records.length > 0 ? "\n" : "");
}
