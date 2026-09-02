/**
 * WU3 evaluation dataset contract (`jkb-football-evaluation-v1`).
 *
 * This module owns the row schema, deterministic serialization, row
 * validation, and latest-valid outcome selection for the JKB football
 * evaluation materializer. It never mutates a prediction snapshot or an
 * outcome event; it only reads immutable WU1/WU2 records and derives
 * analysis-ready rows.
 *
 * Separation of concerns:
 *  - production-vs-backtest: only `mode: "production"` predictions feed the
 *    evaluable datasets, and every emitted row/summary carries
 *    `evaluation_mode: "production"`. Backtest/replay evaluation would use a
 *    different `evaluation_mode` and namespace; it is not implemented here.
 *  - resolved-vs-non-resolved: only `resolution_status: "resolved"` outcomes
 *    enter the per-family evaluable datasets and numeric metrics. Every
 *    prediction (resolved or not) also produces a resolution-status row so
 *    coverage/exclusions stay fully traceable (see EVALUATION_DATASET_SCHEMA.md).
 */
import {
  canonicalJson,
  contentHash,
  type JsonValue,
} from "./nfl-production-prediction-archive";
import type {
  PredictionOutcomeEventV1,
  ResolutionStatus,
} from "./nfl-prediction-outcome-resolver";

export const EVALUATION_DATASET_SCHEMA_VERSION = "jkb-football-evaluation-v1" as const;
export const EVALUATION_MATERIALIZER_VERSION = "nfl-evaluation-materializer-v1" as const;

export type EvaluationMode = "production";

export type EvaluationPredictionType = "spread" | "passing" | "rushing" | "receiving";

/** Datasets the materializer writes. `resolution-status` is the coverage/exclusion ledger. */
export type EvaluationDataset = EvaluationPredictionType | "resolution-status";

/**
 * A synthetic status used only in the resolution-status ledger when a
 * production prediction has no outcome event at all (the resolver was never
 * run for it). It is never a real WU2 `ResolutionStatus`.
 */
export type LedgerResolutionStatus = ResolutionStatus | "unresolved_missing_event";

export type OutcomeRevisionChronologyEntry = {
  outcome_revision: number;
  outcome_id: string;
  resolution_status: ResolutionStatus;
  game_completion_status: PredictionOutcomeEventV1["game_completion_status"];
  recorded_at: string;
  supersedes_outcome_id: string | null;
};

export type OutcomeSelection = {
  selected: PredictionOutcomeEventV1 | null;
  selected_outcome_revision: number | null;
  outcome_revision_count: number;
  superseded_outcome_ids: string[];
  chronology: OutcomeRevisionChronologyEntry[];
};

/**
 * Deterministic latest-valid outcome selection for one prediction ID.
 *
 * WU2 outcomes are revisioned append-only events; a later correction
 * supersedes but never deletes the prior event, and a reversion to an older
 * value is still a new (higher) revision. The evaluation dataset therefore
 * always selects the highest `outcome_revision`, records how many revisions
 * exist, keeps every superseded outcome ID, and preserves the full
 * chronology so the exact correction history stays inspectable.
 */
export function selectLatestOutcome(events: readonly PredictionOutcomeEventV1[]): OutcomeSelection {
  const ordered = [...events].sort(
    (a, b) => a.outcome_revision - b.outcome_revision || a.outcome_id.localeCompare(b.outcome_id),
  );
  const chronology: OutcomeRevisionChronologyEntry[] = ordered.map((event) => ({
    outcome_revision: event.outcome_revision,
    outcome_id: event.outcome_id,
    resolution_status: event.resolution_status,
    game_completion_status: event.game_completion_status,
    recorded_at: event.recorded_at,
    supersedes_outcome_id: event.supersedes_outcome_id,
  }));
  const selected = ordered.length > 0 ? ordered[ordered.length - 1] : null;
  return {
    selected,
    selected_outcome_revision: selected ? selected.outcome_revision : null,
    outcome_revision_count: ordered.length,
    superseded_outcome_ids: ordered
      .filter((event) => selected == null || event.outcome_id !== selected.outcome_id)
      .map((event) => event.outcome_id),
    chronology,
  };
}

export type EvaluationRowIdentity = {
  schema_version: typeof EVALUATION_DATASET_SCHEMA_VERSION;
  materializer_version: typeof EVALUATION_MATERIALIZER_VERSION;
  evaluation_mode: EvaluationMode;
  evaluation_row_id: string;
  prediction_id: string;
  snapshot_key: string;
  snapshot_label: string | null;
  prediction_timestamp: string;
  prediction_created_at: string;
  kickoff_utc: string;
  hours_to_kickoff: number;
  season: number;
  week: number;
  game_id: string;
  team: string;
  opponent: string;
  home_away: "home" | "away";
  neutral_site: boolean;
  position: "QB" | "RB" | "WR" | "TE" | null;
  player_id: string | null;
  player_name_at_prediction: string | null;
  prediction_type: EvaluationPredictionType;
  model_name: string;
  model_version: string;
  feature_schema_version: string;
  pipeline_version: string;
  code_revision: string | null;
  run_id: string;
  fitted_model_hash: string | null;
  feature_payload_hash: string;
  source_manifest_hashes: Record<string, string>;
};

export type EvaluationOutcomeProvenance = {
  resolution_status: ResolutionStatus;
  resolved_at: string | null;
  game_completion_status: PredictionOutcomeEventV1["game_completion_status"];
  resolver_version: PredictionOutcomeEventV1["resolver_version"];
  selected_outcome_id: string;
  selected_outcome_revision: number;
  outcome_revision_count: number;
  superseded_outcome_ids: string[];
  outcome_revision_chronology: OutcomeRevisionChronologyEntry[];
  outcome_source_state_hash: string;
  outcome_source_artifacts: { logical_name: string; content_hash: string; source_updated_at: string | null }[];
  identity_resolution: PredictionOutcomeEventV1["identity_resolution"];
};

export type SpreadMarketObservationEvaluation = {
  market_observation_id: string | null;
  provider: string;
  sportsbook: string;
  observed_at: string;
  home_line: number;
  market_implied_home_margin: number;
  jkb_vs_market_edge: number;
  jkb_side: "home" | "away" | "pick";
  ats_result: "win" | "loss" | "push" | "not_applicable";
};

export type PlayerMarketEvaluation = {
  market_observation_id: string | null;
  provider: string;
  sportsbook: string;
  observed_at: string;
  line: number;
  over_price: number | null;
  under_price: number | null;
  break_even_over: number | null;
  break_even_under: number | null;
  jkb_vs_market_edge: number;
  over_under_result: "over" | "under" | "push" | null;
};

export type SpreadEvaluationRow = EvaluationRowIdentity & {
  prediction_type: "spread";
  outcome: EvaluationOutcomeProvenance & {
    projection: {
      projected_home_margin: number;
      projected_spread_line: number;
      projected_spread_team: string | null;
      home_power_number: number | null;
      away_power_number: number | null;
      home_field_adjustment: number | null;
      archived_market_spread: number | null;
      archived_projection_edge: number | null;
    };
    actual: {
      home_score: number;
      away_score: number;
      home_margin: number;
      total: number;
      winner: "home" | "away" | "tie";
    };
    error: {
      margin_error: number;
      absolute_margin_error: number;
      projected_winner_correct: boolean;
      projected_margin_direction: "home" | "away" | "pick";
      actual_margin_direction: "home" | "away" | "pick";
    };
    market: {
      observation_count: number;
      observations: SpreadMarketObservationEvaluation[];
    };
  };
  feature_snapshot_values: Record<string, JsonValue>;
  cohorts: Record<string, JsonValue>;
};

export type PlayerVolumeEvaluation = {
  zero_volume: boolean;
  actual_volume: number;
  volume_denominator_field: "attempts" | "carries" | "targets" | "receptions";
};

export type PassingEvaluationRow = EvaluationRowIdentity & {
  prediction_type: "passing";
  outcome: EvaluationOutcomeProvenance & {
    projection: {
      projected_passing_yards: number;
      direct_model_prediction: number;
      projected_attempts: number | null;
      projected_ypa: number | null;
    };
    actual: {
      attempts: number;
      completions: number | null;
      yards: number;
      yards_per_attempt: number | null;
      touchdowns: number | null;
      interceptions: number | null;
    };
    error: {
      yards_error: number;
      absolute_yards_error: number;
      attempts_error: number | null;
      ypa_error: number | null;
    };
    volume: PlayerVolumeEvaluation;
    market: PlayerMarketEvaluation | null;
  };
  fitted_ordered_vector: number[] | null;
  imputation_flags: Record<string, string> | null;
  feature_snapshot_values: Record<string, JsonValue>;
  cohorts: Record<string, JsonValue>;
};

export type RushingEvaluationRow = EvaluationRowIdentity & {
  prediction_type: "rushing";
  outcome: EvaluationOutcomeProvenance & {
    projection: {
      projected_carries: number;
      projected_ypc: number;
      projected_rushing_yards: number;
    };
    actual: {
      carries: number;
      yards: number;
      yards_per_carry: number | null;
    };
    error: {
      yards_error: number;
      absolute_yards_error: number;
      carries_error: number;
      ypc_error: number | null;
    };
    volume: PlayerVolumeEvaluation;
    market: PlayerMarketEvaluation | null;
  };
  feature_snapshot_values: Record<string, JsonValue>;
  cohorts: Record<string, JsonValue>;
};

export type ReceivingEvaluationRow = EvaluationRowIdentity & {
  prediction_type: "receiving";
  outcome: EvaluationOutcomeProvenance & {
    projection: {
      projected_targets: number;
      projected_yards_per_target: number;
      projected_receiving_yards: number;
      projected_receptions: number | null;
      projected_yards_per_reception: number | null;
    };
    actual: {
      targets: number;
      receptions: number;
      yards: number;
      yards_per_target: number | null;
      yards_per_reception: number | null;
    };
    error: {
      yards_error: number;
      absolute_yards_error: number;
      targets_error: number;
      receptions_error: number | null;
      yards_per_target_error: number | null;
      yards_per_reception_error: number | null;
    };
    volume: PlayerVolumeEvaluation;
    market: PlayerMarketEvaluation | null;
  };
  feature_snapshot_values: Record<string, JsonValue>;
  cohorts: Record<string, JsonValue>;
};

export type EvaluationRowV1 =
  | SpreadEvaluationRow
  | PassingEvaluationRow
  | RushingEvaluationRow
  | ReceivingEvaluationRow;

export type ResolutionStatusRow = {
  schema_version: typeof EVALUATION_DATASET_SCHEMA_VERSION;
  materializer_version: typeof EVALUATION_MATERIALIZER_VERSION;
  evaluation_mode: EvaluationMode;
  prediction_id: string;
  snapshot_key: string;
  snapshot_label: string | null;
  prediction_timestamp: string;
  kickoff_utc: string;
  season: number;
  week: number;
  game_id: string;
  player_id: string | null;
  team: string;
  opponent: string;
  prediction_type: EvaluationPredictionType;
  model_name: string;
  model_version: string;
  fitted_model_hash: string | null;
  ledger_status: LedgerResolutionStatus;
  evaluable: boolean;
  selected_outcome_id: string | null;
  selected_outcome_revision: number | null;
  outcome_revision_count: number;
  superseded_outcome_ids: string[];
  outcome_revision_chronology: OutcomeRevisionChronologyEntry[];
  game_completion_status: PredictionOutcomeEventV1["game_completion_status"] | "missing";
  identity_method: PredictionOutcomeEventV1["identity_resolution"]["method"] | "unresolved";
  note: string | null;
};

export function evaluationRowId(predictionId: string, selectedOutcomeId: string): string {
  return `eval_${contentHash({ prediction_id: predictionId, selected_outcome_id: selectedOutcomeId } as JsonValue)}`;
}

/** Hours between prediction time and kickoff, rounded to 2 decimals (archive guarantees both fields). */
export function hoursToKickoff(predictionTimestamp: string, kickoffUtc: string): number {
  const milliseconds = Date.parse(kickoffUtc) - Date.parse(predictionTimestamp);
  return Math.round((milliseconds / 3_600_000) * 100) / 100;
}

const NUMERIC_ERROR_FIELDS: Record<EvaluationPredictionType, string[]> = {
  spread: ["margin_error", "absolute_margin_error"],
  passing: ["yards_error", "absolute_yards_error"],
  rushing: ["yards_error", "absolute_yards_error", "carries_error"],
  receiving: ["yards_error", "absolute_yards_error", "targets_error"],
};

/**
 * Structural validation for an evaluable row. Intentionally strict on the
 * invariants downstream research relies on: identity linkage, deterministic
 * row ID, resolved status, finite primary errors, and market-edge presence
 * consistency.
 */
export function validateEvaluationRow(row: EvaluationRowV1): void {
  if (row.schema_version !== EVALUATION_DATASET_SCHEMA_VERSION) throw new Error("unsupported evaluation schema_version");
  if (row.evaluation_mode !== "production") throw new Error("evaluable rows must be production mode");
  if (!row.prediction_id.startsWith("pred_")) throw new Error("invalid prediction_id linkage");
  if (row.outcome.resolution_status !== "resolved") throw new Error("evaluable rows require resolved outcome");
  if (!row.outcome.selected_outcome_id.startsWith("outcome_")) throw new Error("invalid selected_outcome_id linkage");
  if (row.evaluation_row_id !== evaluationRowId(row.prediction_id, row.outcome.selected_outcome_id)) {
    throw new Error("evaluation_row_id does not match prediction/outcome linkage");
  }
  if (row.outcome.selected_outcome_revision < 1) throw new Error("selected_outcome_revision must be >= 1");
  if (row.outcome.outcome_revision_count < 1) throw new Error("outcome_revision_count must be >= 1");
  if (!Number.isFinite(row.hours_to_kickoff)) throw new Error("hours_to_kickoff must be finite");
  const errorPayload = row.outcome.error as Record<string, unknown>;
  for (const field of NUMERIC_ERROR_FIELDS[row.prediction_type]) {
    if (!Number.isFinite(errorPayload[field] as number)) throw new Error(`${row.prediction_type}.${field} must be finite`);
  }
  if (row.prediction_type !== "spread") {
    const market = (row.outcome as { market: PlayerMarketEvaluation | null }).market;
    if (market && !Number.isFinite(market.jkb_vs_market_edge)) throw new Error("player market edge must be finite when present");
  }
  // Throws on NaN/Infinity or undefined anywhere in the row.
  canonicalJson(row as unknown as JsonValue);
}

/** Deterministic pretty JSON: canonicalize key order, then indent. Byte-identical across runs. */
export function deterministicPrettyJson(value: JsonValue): string {
  return JSON.stringify(JSON.parse(canonicalJson(value)), null, 2);
}

/** One JSONL text block, rows sorted by evaluation_row_id for byte-identical reruns. */
export function serializeEvaluationRows(rows: readonly EvaluationRowV1[]): string {
  const ordered = [...rows].sort((a, b) => a.evaluation_row_id.localeCompare(b.evaluation_row_id));
  return ordered.length === 0 ? "" : `${ordered.map((row) => canonicalJson(row as unknown as JsonValue)).join("\n")}\n`;
}

export function serializeResolutionStatusRows(rows: readonly ResolutionStatusRow[]): string {
  const ordered = [...rows].sort(
    (a, b) => a.prediction_id.localeCompare(b.prediction_id) || a.prediction_type.localeCompare(b.prediction_type),
  );
  return ordered.length === 0 ? "" : `${ordered.map((row) => canonicalJson(row as unknown as JsonValue)).join("\n")}\n`;
}
