/**
 * WU4G: forward evaluation operational layer.
 *
 * Wires the pure diagnostic contracts already defined by WU4F.1
 * (`shadowVsProductionEvaluation.ts`) and WU4F.2A
 * (`receivingRoleConflictForwardEvaluation.ts`) into the existing WU3
 * evaluation dataset -- it never re-derives predictions or outcomes itself.
 * Reads WU3 `RushingEvaluationRow`/`ReceivingEvaluationRow` rows (already
 * the join of an immutable WU1 prediction snapshot to its resolved WU2
 * outcome) and:
 *
 *  1. selects exactly one row per (season, week, game_id, player_id) -- the
 *     archived snapshot with the latest `prediction_timestamp` (WU1
 *     validation already guarantees every production snapshot's
 *     `prediction_timestamp` precedes `kickoff_utc`, so "latest" is always
 *     "final pregame"). This is the archive-selection policy: a week's
 *     daily-refreshed snapshots for the same player/game must not each
 *     produce their own forward-evaluation row (WU3's raw per-snapshot
 *     dataset intentionally keeps every snapshot; this layer is the one
 *     place that collapses to one row per player-game for the cumulative
 *     rushing/receiving research questions).
 *  2. maps each selected row's archived diagnostic payload into the pure
 *     `ShadowVsProductionRow` / `ReceivingRoleConflictEvaluationRow`
 *     shapes, reading every field verbatim from `feature_snapshot_values`
 *     and `outcome.projection`/`outcome.actual` -- never recomputing a
 *     projection or diagnostic.
 *  3. calls the existing pure error/cohort/summary functions and assembles
 *     the durable, machine-readable cumulative summaries.
 *
 * Deterministic and idempotent: given the same WU3 rows, produces
 * byte-identical output (selection, error math, and cohort membership are
 * all pure functions of already-immutable inputs).
 */
import type { JsonValue, ReceivingEvaluationRow, RushingEvaluationRow } from "./nfl-evaluation-dataset";
import { SAMPLE_SIZE_THRESHOLDS } from "./nfl-evaluation-metrics";
import {
  classifyConflictLevel,
} from "../../src/lib/nfl/research/rushingRoleConflictDiagnosticV2";
import {
  classifyRushingShadowCohorts,
  computeRushingPromotionReadiness,
  computeShadowVsProductionErrors,
  summarizeRushingShadowCohort,
  type NflRushingEvaluationCohort,
  type NflRushingPromotionReadiness,
  type ShadowVsProductionErrors,
  type ShadowVsProductionRow,
} from "../../src/lib/nfl/research/shadowVsProductionEvaluation";
import {
  classifyReceivingRoleConflictCohorts,
  computeReceivingRoleConflictErrors,
  summarizeReceivingRoleConflictCohort,
  type NflReceivingRoleConflictEvaluationCohort,
  type ReceivingRoleConflictEvaluationErrors,
  type ReceivingRoleConflictEvaluationRow,
} from "../../src/lib/nfl/research/receivingRoleConflictForwardEvaluation";

export const FORWARD_EVALUATION_SCHEMA_VERSION = "jkb-football-forward-evaluation-v1" as const;

/**
 * Selects one row per (season, week, game_id, player_id, prediction_type):
 * the row with the lexicographically-latest `prediction_timestamp`
 * (ISO-8601 UTC strings sort correctly as strings), tie-broken
 * deterministically by `prediction_id`.
 *
 * WU4G.1 §1: `prediction_type` (the existing WU1/WU3 canonical evaluation-
 * target discriminator -- "rushing"/"receiving"/etc, already present on
 * every `EvaluationRowIdentity`) is PART OF THE KEY. A dual-role RB
 * legitimately produces both a `RushingEvaluationRow` and a
 * `ReceivingEvaluationRow` for the same `(season, week, game_id,
 * player_id)` -- omitting `prediction_type` from the key would silently
 * collapse the two into one, discarding whichever evaluation target lost
 * the "latest timestamp" comparison. Current call sites happen to invoke
 * this once per already-homogeneous array (all-rushing or all-receiving),
 * so that specific collision was never triggered in practice, but the
 * function itself must be safe against a mixed input -- see the "RB with
 * both rushing and receiving" regression test.
 *
 * WU4G.1 §2: also defensively filters to `prediction_timestamp <
 * kickoff_utc` before selecting the latest. WU1's `validatePredictionSnapshot`
 * already enforces this invariant at write time for every `mode:
 * "production"` snapshot, so this filter should never actually exclude a
 * row today -- it exists so this layer stays point-in-time safe even if
 * that upstream guarantee were to regress, without re-deriving or
 * duplicating any kickoff logic (both fields are read verbatim from the
 * row, never recomputed).
 */
export function selectFinalPregameEvaluationRows<
  T extends {
    season: number;
    week: number;
    game_id: string;
    player_id: string | null;
    prediction_type: string;
    prediction_timestamp: string;
    kickoff_utc: string;
    prediction_id: string;
  },
>(rows: readonly T[]): T[] {
  const eligible = rows.filter((row) => row.prediction_timestamp < row.kickoff_utc);
  const byKey = new Map<string, T>();
  for (const row of eligible) {
    const key = `${row.season}|${row.week}|${row.game_id}|${row.player_id ?? "team"}|${row.prediction_type}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const later =
      row.prediction_timestamp > existing.prediction_timestamp ||
      (row.prediction_timestamp === existing.prediction_timestamp && row.prediction_id > existing.prediction_id);
    if (later) byKey.set(key, row);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.season - b.season ||
      a.week - b.week ||
      a.game_id.localeCompare(b.game_id) ||
      (a.player_id ?? "").localeCompare(b.player_id ?? "") ||
      a.prediction_type.localeCompare(b.prediction_type),
  );
}

type RushingAllocationDiagnosticsJson = {
  projectedCarries: number | null;
  roleConflictScore: number | null;
  roleConflictFlag: boolean;
} | null;

type RushingRoleConflictV2Json =
  | { available: true; diagnostic: { conflict_level: "low" | "medium" | "high" | null } }
  | { available: false }
  | null
  | undefined;

/**
 * Maps one selected WU3 rushing evaluation row into the pure
 * `ShadowVsProductionRow` shape. Every field is read verbatim from the
 * archive. WU4G.2 §6: `rushingConflictLevel` is read from the archived
 * `rushing_role_conflict_v2` entry (the corrected, pool-scoped diagnostic)
 * -- NEVER derived from `allocation_diagnostics.roleConflictScore` (the OLD
 * cross-position-biased allocator score, still read here verbatim ONLY for
 * S5E/allocator provenance).
 */
export function buildRushingShadowVsProductionRow(evalRow: RushingEvaluationRow): ShadowVsProductionRow {
  const values = evalRow.feature_snapshot_values;
  const alloc = (values.allocation_diagnostics as unknown as RushingAllocationDiagnosticsJson) ?? null;
  const v2 = values.rushing_role_conflict_v2 as unknown as RushingRoleConflictV2Json;
  return {
    playerId: evalRow.player_id ?? "",
    gameId: evalRow.game_id,
    season: evalRow.season,
    week: evalRow.week,
    productionCarries: evalRow.outcome.projection.projected_carries,
    shadowCarries: alloc?.projectedCarries ?? null,
    actualCarries: evalRow.outcome.actual.carries,
    roleConflictScore: alloc?.roleConflictScore ?? null,
    roleConflictFlag: alloc ? alloc.roleConflictFlag : null,
    teamChanged: values.team_changed === true ? true : values.team_changed === false ? false : null,
    roleSourced: values.role_sourced === true,
    noHistory: values.no_history === true,
    depthRank: typeof values.depth_chart_rank === "number" ? values.depth_chart_rank : null,
    starterFlag: values.starter_flag === true ? true : values.starter_flag === false ? false : null,
    position: evalRow.position,
    rushingConflictLevel: v2 && v2.available ? v2.diagnostic.conflict_level : null,
    rushingConflictDiagnosticAvailable: v2 != null && v2.available === true,
  };
}

/**
 * WU4G.2 §11: reads the run-level pool-coherence fact broadcast onto every
 * rushing row this run (`rushing_pool_coherence_failures`) -- a flat mirror
 * of the same in-run computation the shadow-allocation loop already logs.
 * All selected rows from the SAME archived run carry the same value; this
 * takes the first non-null one found (or `null` if the shadow allocator
 * never ran for any selected row this season).
 */
export function derivePoolCoherenceFailureCount(rows: readonly RushingEvaluationRow[]): number | null {
  for (const row of rows) {
    const value = row.feature_snapshot_values.rushing_pool_coherence_failures;
    if (typeof value === "number") return value;
  }
  return null;
}

type ReceivingRoleConflictJson =
  | {
      available: true;
      diagnostic: {
        conflict_level: "low" | "medium" | "high" | null;
        ordering_conflict: boolean | null;
        team_changed: boolean | null;
        role_sourced: boolean;
        depth_rank: number | null;
        no_history: boolean;
      };
    }
  | { available: false }
  | null
  | undefined;

/**
 * Maps one selected WU3 receiving evaluation row into the pure
 * `ReceivingRoleConflictEvaluationRow` shape. Returns null for a position
 * the receiving role-conflict diagnostic never covers (see
 * `receivingRoleConflictDiagnostic.ts`'s supported-position set) -- such a
 * row is excluded from the forward evaluation dataset entirely, never
 * silently defaulted.
 */
export function buildReceivingRoleConflictRow(evalRow: ReceivingEvaluationRow): ReceivingRoleConflictEvaluationRow | null {
  const position = evalRow.position;
  if (position !== "WR" && position !== "TE" && position !== "RB") return null;
  const values = evalRow.feature_snapshot_values;
  const conflict = values.receiving_role_conflict as unknown as ReceivingRoleConflictJson;
  const diag = conflict && conflict.available ? conflict.diagnostic : null;
  return {
    playerId: evalRow.player_id ?? "",
    gameId: evalRow.game_id,
    season: evalRow.season,
    week: evalRow.week,
    position,
    projectedTargets: evalRow.outcome.projection.projected_targets,
    projectedYards: evalRow.outcome.projection.projected_receiving_yards,
    actualTargets: evalRow.outcome.actual.targets,
    actualYards: evalRow.outcome.actual.yards,
    conflictLevel: diag?.conflict_level ?? null,
    orderingConflict: diag?.ordering_conflict ?? null,
    teamChanged: diag?.team_changed ?? null,
    roleSourced: diag?.role_sourced ?? false,
    depthRank: diag?.depth_rank ?? null,
    noHistory: diag?.no_history ?? false,
    diagnosticAvailable: conflict != null && conflict.available === true,
  };
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Rushing cumulative summary
// ---------------------------------------------------------------------------

export interface RushingForwardEvaluationSummary {
  schema_version: typeof FORWARD_EVALUATION_SCHEMA_VERSION;
  prediction_type: "rushing";
  season: number;
  generated_at: string;
  completed_weeks: number;
  evaluated_player_games: number;
  production_carry_mae: number | null;
  shadow_carry_mae: number | null;
  delta_mae: number | null;
  /** (production_carry_mae - shadow_carry_mae) / production_carry_mae * 100. Positive = shadow better. Null when either MAE is unavailable. */
  relative_improvement_pct: number | null;
  production_bias: number | null;
  shadow_bias: number | null;
  shadow_win_count: number;
  production_win_count: number;
  tie_count: number;
  shadow_coverage_available: number;
  shadow_coverage_unavailable: number;
  coverage_rate: number | null;
  /**
   * WU4G.2 §6: coverage of the archived CORRECTED `rushing_role_conflict_v2`
   * diagnostic, computed over structurally-expected (RB-position) rows
   * only -- a QB/WR/TE rushing row never counts against this denominator. A
   * legitimate noHistory RB with an available-but-null severity still
   * counts as covered.
   */
  rushing_conflict_diagnostic_available: number;
  rushing_conflict_diagnostic_unavailable: number;
  rushing_conflict_diagnostic_coverage_rate: number | null;
  /** Persisted run-level fact (WU4G.2 §11) when present on the archive; null when the shadow allocator never ran for any selected row. */
  pool_coherence_failure_count: number | null;
  cohorts: Record<NflRushingEvaluationCohort, { n: number; insufficient_sample: boolean; mae_production: number | null; mae_shadow: number | null; bias_production: number | null; bias_shadow: number | null; shadow_coverage_n: number }>;
  readiness: NflRushingPromotionReadiness;
}

const RUSHING_COHORTS: NflRushingEvaluationCohort[] = [
  "overall", "week1", "weeks1to4", "teamChanged", "sameTeam", "sourcedStarter", "sourcedBackup",
  "noHistory", "roleConflictLow", "roleConflictMedium", "roleConflictHigh", "productionShadowOrderingDisagreement",
];

export function buildRushingForwardEvaluationSummary(input: {
  season: number;
  generatedAt: string;
  completedWeeks: number;
  rows: readonly ShadowVsProductionRow[];
  poolCoherenceFailureCount?: number | null;
}): RushingForwardEvaluationSummary {
  const errors = computeShadowVsProductionErrors(input.rows, () => null, () => null, () => null);
  const errorsByPlayerGame = new Map<string, ShadowVsProductionErrors>(errors.map((e) => [`${e.gameId}|${e.playerId}`, e]));

  const cohorts = Object.fromEntries(
    RUSHING_COHORTS.map((cohort) => {
      const summary = summarizeRushingShadowCohort(cohort, input.rows, errorsByPlayerGame);
      return [cohort, {
        n: summary.n,
        insufficient_sample: summary.n < SAMPLE_SIZE_THRESHOLDS.cohort_label,
        mae_production: Number.isNaN(summary.meanAbsoluteProductionCarriesError) ? null : summary.meanAbsoluteProductionCarriesError,
        mae_shadow: Number.isNaN(summary.meanAbsoluteShadowCarriesError) ? null : summary.meanAbsoluteShadowCarriesError,
        bias_production: Number.isNaN(summary.meanSignedProductionCarriesError) ? null : summary.meanSignedProductionCarriesError,
        bias_shadow: Number.isNaN(summary.meanSignedShadowCarriesError) ? null : summary.meanSignedShadowCarriesError,
        shadow_coverage_n: summary.shadowCoverageN,
      }];
    }),
  ) as RushingForwardEvaluationSummary["cohorts"];

  const overall = cohorts.overall;
  const structurallyExpected = input.rows.filter((row) => row.position === "RB");
  const conflictDiagnosticAvailableCount = structurallyExpected.filter((row) => row.rushingConflictDiagnosticAvailable).length;
  const shadowCovered = errors.filter((e) => e.shadowCarriesError != null);
  let shadowWinCount = 0;
  let productionWinCount = 0;
  let tieCount = 0;
  for (const e of shadowCovered) {
    if ((e.shadowCarriesError as number) < e.productionCarriesError) shadowWinCount += 1;
    else if ((e.shadowCarriesError as number) > e.productionCarriesError) productionWinCount += 1;
    else tieCount += 1;
  }

  // WU4G.1 §3: `undefined` (caller didn't supply one) collapses to `null`
  // ("unknown"), never to `0` ("affirmatively zero failures") -- see
  // `computeRushingPromotionReadiness`'s null-handling.
  const readiness = computeRushingPromotionReadiness({
    completedWeeks: input.completedWeeks,
    rows: input.rows,
    errorsByPlayerGame,
    poolCoherenceFailureCount: input.poolCoherenceFailureCount ?? null,
  });

  return {
    schema_version: FORWARD_EVALUATION_SCHEMA_VERSION,
    prediction_type: "rushing",
    season: input.season,
    generated_at: input.generatedAt,
    completed_weeks: input.completedWeeks,
    evaluated_player_games: input.rows.length,
    production_carry_mae: overall.mae_production,
    shadow_carry_mae: overall.mae_shadow,
    delta_mae: overall.mae_shadow != null && overall.mae_production != null ? overall.mae_shadow - overall.mae_production : null,
    relative_improvement_pct:
      overall.mae_shadow != null && overall.mae_production != null && overall.mae_production !== 0
        ? ((overall.mae_production - overall.mae_shadow) / overall.mae_production) * 100
        : null,
    production_bias: overall.bias_production,
    shadow_bias: overall.bias_shadow,
    shadow_win_count: shadowWinCount,
    production_win_count: productionWinCount,
    tie_count: tieCount,
    shadow_coverage_available: overall.shadow_coverage_n,
    shadow_coverage_unavailable: input.rows.length - overall.shadow_coverage_n,
    coverage_rate: input.rows.length > 0 ? overall.shadow_coverage_n / input.rows.length : null,
    rushing_conflict_diagnostic_available: conflictDiagnosticAvailableCount,
    rushing_conflict_diagnostic_unavailable: structurallyExpected.length - conflictDiagnosticAvailableCount,
    rushing_conflict_diagnostic_coverage_rate: structurallyExpected.length > 0 ? conflictDiagnosticAvailableCount / structurallyExpected.length : null,
    pool_coherence_failure_count: input.poolCoherenceFailureCount ?? null,
    cohorts,
    readiness,
  };
}

// ---------------------------------------------------------------------------
// Receiving cumulative summary
// ---------------------------------------------------------------------------

export interface ReceivingForwardEvaluationSummary {
  schema_version: typeof FORWARD_EVALUATION_SCHEMA_VERSION;
  prediction_type: "receiving";
  season: number;
  generated_at: string;
  completed_weeks: number;
  evaluated_player_games: number;
  target_mae: number | null;
  target_bias: number | null;
  receiving_yards_mae: number | null;
  /**
   * WU4G.1 §5: coverage of the ARCHIVED diagnostic itself, computed from
   * `diagnosticAvailable` -- distinct from `by_role_conflict.NULL`, which
   * includes both a genuinely unavailable diagnostic AND an available
   * diagnostic with a legitimately null `conflictLevel` (e.g. `noHistory`).
   * Use this to know whether the low/medium/high cohort breakdown below
   * covers the full evaluated slate or only part of it.
   */
  diagnostic_available: number;
  diagnostic_unavailable: number;
  diagnostic_coverage_rate: number | null;
  by_role_conflict: Record<"LOW" | "MEDIUM" | "HIGH" | "NULL", { n: number; insufficient_sample: boolean; target_mae: number | null; target_bias: number | null; receiving_yards_mae: number | null }>;
  same_team_vs_team_changed: {
    same_team: { n: number; target_mae: number | null };
    team_changed: { n: number; target_mae: number | null };
  };
  high_conflict_by_team_change: {
    high_conflict_team_changed: { n: number; target_mae: number | null };
    high_conflict_same_team: { n: number; target_mae: number | null };
  };
  cohorts: Record<NflReceivingRoleConflictEvaluationCohort, { n: number; insufficient_sample: boolean; mean_absolute_target_error: number | null; mean_signed_target_error: number | null }>;
}

const RECEIVING_COHORTS: NflReceivingRoleConflictEvaluationCohort[] = [
  "overall", "week1", "weeks1to4", "sameTeam", "teamChanged", "roleConflictLow", "roleConflictMedium",
  "roleConflictHigh", "noHistory", "sourcedWR1", "sourcedWR2", "sourcedTE1", "orderingConflict",
];

function receivingYardsMae(
  rows: readonly ReceivingRoleConflictEvaluationRow[],
  errorsByPlayerGame: ReadonlyMap<string, ReceivingRoleConflictEvaluationErrors>,
): number | null {
  const values = rows
    .map((row) => errorsByPlayerGame.get(`${row.gameId}|${row.playerId}`)?.receivingYardsError)
    .filter((value): value is number => value != null);
  return mean(values);
}

function targetBias(
  rows: readonly ReceivingRoleConflictEvaluationRow[],
  errorsByPlayerGame: ReadonlyMap<string, ReceivingRoleConflictEvaluationErrors>,
): number | null {
  const values = rows
    .map((row) => errorsByPlayerGame.get(`${row.gameId}|${row.playerId}`)?.signedTargetError)
    .filter((value): value is number => value != null);
  return mean(values);
}

export function buildReceivingForwardEvaluationSummary(input: {
  season: number;
  generatedAt: string;
  completedWeeks: number;
  rows: readonly ReceivingRoleConflictEvaluationRow[];
}): ReceivingForwardEvaluationSummary {
  const errors = computeReceivingRoleConflictErrors(input.rows);
  const errorsByPlayerGame = new Map<string, ReceivingRoleConflictEvaluationErrors>(errors.map((e) => [`${e.gameId}|${e.playerId}`, e]));

  const cohorts = Object.fromEntries(
    RECEIVING_COHORTS.map((cohort) => {
      const summary = summarizeReceivingRoleConflictCohort(cohort, input.rows, errorsByPlayerGame);
      return [cohort, {
        n: summary.n,
        insufficient_sample: summary.n < SAMPLE_SIZE_THRESHOLDS.cohort_label,
        mean_absolute_target_error: Number.isNaN(summary.meanAbsoluteTargetError) ? null : summary.meanAbsoluteTargetError,
        mean_signed_target_error: Number.isNaN(summary.meanSignedTargetError) ? null : summary.meanSignedTargetError,
      }];
    }),
  ) as ReceivingForwardEvaluationSummary["cohorts"];

  const byLevel = (level: "low" | "medium" | "high" | null) => {
    const members = input.rows.filter((row) => row.conflictLevel === level);
    return {
      n: members.length,
      insufficient_sample: members.length < SAMPLE_SIZE_THRESHOLDS.cohort_label,
      target_mae: mean(members.map((row) => errorsByPlayerGame.get(`${row.gameId}|${row.playerId}`)?.absoluteTargetError).filter((v): v is number => v != null)),
      target_bias: targetBias(members, errorsByPlayerGame),
      receiving_yards_mae: receivingYardsMae(members, errorsByPlayerGame),
    };
  };

  const sameTeamRows = input.rows.filter((row) => row.teamChanged === false);
  const teamChangedRows = input.rows.filter((row) => row.teamChanged === true);
  const highConflictTeamChanged = input.rows.filter((row) => row.conflictLevel === "high" && row.teamChanged === true);
  const highConflictSameTeam = input.rows.filter((row) => row.conflictLevel === "high" && row.teamChanged === false);

  const targetMaeOf = (rows: readonly ReceivingRoleConflictEvaluationRow[]) =>
    mean(rows.map((row) => errorsByPlayerGame.get(`${row.gameId}|${row.playerId}`)?.absoluteTargetError).filter((v): v is number => v != null));

  const diagnosticAvailableCount = input.rows.filter((row) => row.diagnosticAvailable).length;

  return {
    schema_version: FORWARD_EVALUATION_SCHEMA_VERSION,
    prediction_type: "receiving",
    season: input.season,
    generated_at: input.generatedAt,
    completed_weeks: input.completedWeeks,
    evaluated_player_games: input.rows.length,
    target_mae: cohorts.overall.mean_absolute_target_error,
    target_bias: cohorts.overall.mean_signed_target_error,
    receiving_yards_mae: receivingYardsMae(input.rows, errorsByPlayerGame),
    diagnostic_available: diagnosticAvailableCount,
    diagnostic_unavailable: input.rows.length - diagnosticAvailableCount,
    diagnostic_coverage_rate: input.rows.length > 0 ? diagnosticAvailableCount / input.rows.length : null,
    by_role_conflict: {
      LOW: byLevel("low"),
      MEDIUM: byLevel("medium"),
      HIGH: byLevel("high"),
      NULL: byLevel(null),
    },
    same_team_vs_team_changed: {
      same_team: { n: sameTeamRows.length, target_mae: targetMaeOf(sameTeamRows) },
      team_changed: { n: teamChangedRows.length, target_mae: targetMaeOf(teamChangedRows) },
    },
    high_conflict_by_team_change: {
      high_conflict_team_changed: { n: highConflictTeamChanged.length, target_mae: targetMaeOf(highConflictTeamChanged) },
      high_conflict_same_team: { n: highConflictSameTeam.length, target_mae: targetMaeOf(highConflictSameTeam) },
    },
    cohorts,
  };
}

export { classifyRushingShadowCohorts, classifyReceivingRoleConflictCohorts, classifyConflictLevel };
