/**
 * WU3 per-family evaluation row builders. Joins one immutable prediction
 * snapshot to its latest valid resolved outcome and flattens both, plus the
 * prediction-time market/feature state, into an analysis-ready row.
 *
 * Market edge sign conventions (see EVALUATION_DATASET_SCHEMA.md):
 *  - spread: jkb_vs_market_edge = projected_home_margin - market_implied_home_margin
 *            where market_implied_home_margin = -home_line (matches the WU2
 *            resolver's convention). A positive edge means JKB is more
 *            favorable to the home team than the market.
 *  - player props: jkb_vs_market_edge = projected_yards - market_line.
 *            A positive edge means JKB projects the over.
 */
import type { JsonValue, PredictionSnapshotV1 } from "./nfl-production-prediction-archive";
import type { PredictionOutcomeEventV1 } from "./nfl-prediction-outcome-resolver";
import { americanToImplied } from "./nfl-research-odds-math.mjs";
import {
  evaluationRowId,
  hoursToKickoff,
  selectLatestOutcome,
  type EvaluationOutcomeProvenance,
  type EvaluationRowIdentity,
  type EvaluationRowV1,
  type PassingEvaluationRow,
  type PlayerMarketEvaluation,
  type PlayerVolumeEvaluation,
  type ReceivingEvaluationRow,
  type ResolutionStatusRow,
  type RushingEvaluationRow,
  type SpreadEvaluationRow,
  type SpreadMarketObservationEvaluation,
  type TeamOpportunityEvaluationRow,
  type TeamTotalEvaluationRow,
  EVALUATION_DATASET_SCHEMA_VERSION,
  EVALUATION_MATERIALIZER_VERSION,
} from "./nfl-evaluation-dataset";
import {
  derivePlayerCohorts,
  deriveSpreadCohorts,
  deriveTeamOpportunityCohorts,
  deriveTeamTotalCohorts,
  type CohortContext,
} from "./nfl-evaluation-cohorts";

export type EvaluationRowBuildContext = {
  /** true/false when both team divisions are known, null when a divisions table was unavailable. */
  divisionGame: boolean | null;
};

export type BuiltEvaluationRow = {
  row: EvaluationRowV1 | null;
  ledger: ResolutionStatusRow;
};

function identity(prediction: PredictionSnapshotV1, provenance: EvaluationOutcomeProvenance): EvaluationRowIdentity {
  return {
    schema_version: EVALUATION_DATASET_SCHEMA_VERSION,
    materializer_version: EVALUATION_MATERIALIZER_VERSION,
    evaluation_mode: "production",
    evaluation_row_id: evaluationRowId(prediction.prediction_id, provenance.selected_outcome_id),
    prediction_id: prediction.prediction_id,
    snapshot_key: prediction.snapshot_key,
    snapshot_label: prediction.snapshot_label,
    prediction_timestamp: prediction.prediction_timestamp,
    prediction_created_at: prediction.created_at,
    kickoff_utc: prediction.kickoff_utc,
    hours_to_kickoff: hoursToKickoff(prediction.prediction_timestamp, prediction.kickoff_utc),
    season: prediction.season,
    week: prediction.week,
    game_id: prediction.game_id,
    team: prediction.team,
    opponent: prediction.opponent,
    home_away: prediction.home_away,
    neutral_site: prediction.neutral_site,
    position: prediction.position,
    player_id: prediction.player_id,
    player_name_at_prediction: prediction.player_name_at_prediction,
    prediction_type: prediction.prediction_type,
    model_name: prediction.model_name,
    model_version: prediction.model_version,
    feature_schema_version: prediction.feature_schema_version,
    pipeline_version: prediction.pipeline_version,
    code_revision: prediction.code_revision,
    run_id: prediction.run_id,
    fitted_model_hash: prediction.feature_snapshot.fitted_model_hash,
    feature_payload_hash: prediction.feature_snapshot.feature_payload_hash,
    source_manifest_hashes: prediction.feature_snapshot.source_manifest_hashes,
  };
}

function outcomeProvenance(
  selected: PredictionOutcomeEventV1,
  selection: ReturnType<typeof selectLatestOutcome>,
): EvaluationOutcomeProvenance {
  return {
    resolution_status: selected.resolution_status,
    resolved_at: selected.resolved_at,
    game_completion_status: selected.game_completion_status,
    resolver_version: selected.resolver_version,
    selected_outcome_id: selected.outcome_id,
    selected_outcome_revision: selected.outcome_revision,
    outcome_revision_count: selection.outcome_revision_count,
    superseded_outcome_ids: selection.superseded_outcome_ids,
    outcome_revision_chronology: selection.chronology,
    outcome_source_state_hash: selected.source_state_hash,
    outcome_source_artifacts: selected.source_artifacts.map((artifact) => ({
      logical_name: artifact.logical_name,
      content_hash: artifact.content_hash,
      source_updated_at: artifact.source_updated_at,
    })),
    identity_resolution: selected.identity_resolution,
  };
}

function cohortContext(prediction: PredictionSnapshotV1, ctx: EvaluationRowBuildContext): CohortContext {
  return {
    season: prediction.season,
    week: prediction.week,
    home_away: prediction.home_away,
    neutral_site: prediction.neutral_site,
    position: prediction.position,
    status: prediction.status,
    division_game: ctx.divisionGame,
  };
}

function marginDirection(value: number): "home" | "away" | "pick" {
  return value > 0 ? "home" : value < 0 ? "away" : "pick";
}

function matchMarketResult(
  event: PredictionOutcomeEventV1,
  reference: PredictionSnapshotV1["market_snapshot_refs"][number],
): { jkb_side: "home" | "away" | "pick"; ats_result: "win" | "loss" | "push" | "not_applicable" } | null {
  if (event.derived?.type !== "spread") return null;
  const hit = event.derived.market_results.find((entry) =>
    reference.market_observation_id != null
      ? entry.market_observation_id === reference.market_observation_id
      : entry.provider === reference.provider &&
        entry.sportsbook === reference.sportsbook &&
        entry.observed_at === reference.observed_at &&
        entry.home_line === reference.line,
  );
  if (!hit) return null;
  return { jkb_side: hit.jkb_side === "equal" ? "pick" : hit.jkb_side, ats_result: hit.ats_result };
}

function buildSpreadRow(
  prediction: PredictionSnapshotV1,
  selected: PredictionOutcomeEventV1,
  selection: ReturnType<typeof selectLatestOutcome>,
  ctx: EvaluationRowBuildContext,
): SpreadEvaluationRow {
  if (prediction.projection.type !== "spread" || selected.actual?.type !== "spread" || selected.derived?.type !== "spread") {
    throw new Error(`spread row type mismatch for ${prediction.prediction_id}`);
  }
  const projection = prediction.projection;
  const actual = selected.actual;
  const derived = selected.derived;
  const observations: SpreadMarketObservationEvaluation[] = prediction.market_snapshot_refs
    .filter((reference) => reference.market_type === "spread" && reference.purpose === "comparison")
    .map((reference) => {
      const marketImpliedHomeMargin = -reference.line;
      const edge = projection.projected_home_margin - marketImpliedHomeMargin;
      const matched = matchMarketResult(selected, reference);
      return {
        market_observation_id: reference.market_observation_id,
        provider: reference.provider,
        sportsbook: reference.sportsbook,
        observed_at: reference.observed_at,
        home_line: reference.line,
        market_implied_home_margin: marketImpliedHomeMargin,
        jkb_vs_market_edge: edge,
        jkb_side: matched?.jkb_side ?? marginDirection(edge),
        ats_result: matched?.ats_result ?? "not_applicable",
      };
    })
    .sort((a, b) => a.observed_at.localeCompare(b.observed_at) || a.sportsbook.localeCompare(b.sportsbook));
  const primary = observations[0] ?? null;
  const provenance = outcomeProvenance(selected, selection);
  return {
    ...identity(prediction, provenance),
    prediction_type: "spread",
    outcome: {
      ...provenance,
      projection: {
        projected_home_margin: projection.projected_home_margin,
        projected_spread_line: projection.projected_spread_line,
        projected_spread_team: projection.projected_spread_team,
        home_power_number: projection.home_power_number ?? null,
        away_power_number: projection.away_power_number ?? null,
        home_field_adjustment: projection.home_field_adjustment ?? null,
        archived_market_spread: projection.market_spread ?? null,
        archived_projection_edge: projection.edge ?? null,
      },
      actual: {
        home_score: actual.home_score,
        away_score: actual.away_score,
        home_margin: actual.margin,
        total: actual.total,
        winner: actual.winner,
      },
      error: {
        margin_error: derived.margin_error,
        absolute_margin_error: derived.absolute_margin_error,
        projected_winner_correct: derived.projected_winner_correct,
        projected_margin_direction: derived.projected_margin_direction,
        actual_margin_direction: marginDirection(actual.margin),
      },
      market: { observation_count: observations.length, observations },
    },
    feature_snapshot_values: prediction.feature_snapshot.values,
    cohorts: deriveSpreadCohorts({
      context: cohortContext(prediction, ctx),
      projectedHomeMargin: projection.projected_home_margin,
      homePowerNumber: projection.home_power_number ?? null,
      awayPowerNumber: projection.away_power_number ?? null,
      primaryMarketImpliedHomeMargin: primary?.market_implied_home_margin ?? null,
      primaryJkbVsMarketEdge: primary?.jkb_vs_market_edge ?? null,
      featureValues: prediction.feature_snapshot.values,
    }),
  };
}

const PLAYER_MARKET_TYPE = {
  passing: "passing_yards",
  rushing: "rushing_yards",
  receiving: "receiving_yards",
} as const;

function selectPlayerMarket(
  prediction: PredictionSnapshotV1,
  projectedYards: number,
  actualYards: number,
): PlayerMarketEvaluation | null {
  if (prediction.prediction_type === "spread") return null;
  const wanted = PLAYER_MARKET_TYPE[prediction.prediction_type];
  const candidates = prediction.market_snapshot_refs
    .filter((reference) => reference.market_type === wanted && reference.purpose === "comparison")
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at) || a.sportsbook.localeCompare(b.sportsbook));
  const reference = candidates[0];
  if (!reference || !Number.isFinite(reference.line)) return null;
  const edge = projectedYards - reference.line;
  return {
    market_observation_id: reference.market_observation_id,
    provider: reference.provider,
    sportsbook: reference.sportsbook,
    observed_at: reference.observed_at,
    line: reference.line,
    over_price: reference.over_price,
    under_price: reference.under_price,
    break_even_over: americanToImplied(reference.over_price),
    break_even_under: americanToImplied(reference.under_price),
    jkb_vs_market_edge: edge,
    over_under_result:
      actualYards > reference.line ? "over" : actualYards < reference.line ? "under" : "push",
  };
}

function playerVolume(
  field: PlayerVolumeEvaluation["volume_denominator_field"],
  actualVolume: number,
): PlayerVolumeEvaluation {
  return { zero_volume: actualVolume === 0, actual_volume: actualVolume, volume_denominator_field: field };
}

function buildPassingRow(
  prediction: PredictionSnapshotV1,
  selected: PredictionOutcomeEventV1,
  selection: ReturnType<typeof selectLatestOutcome>,
  ctx: EvaluationRowBuildContext,
): PassingEvaluationRow {
  if (prediction.projection.type !== "passing" || selected.actual?.type !== "passing" || selected.derived?.type !== "passing") {
    throw new Error(`passing row type mismatch for ${prediction.prediction_id}`);
  }
  const projection = prediction.projection;
  const actual = selected.actual;
  const derived = selected.derived;
  const market = selectPlayerMarket(prediction, projection.projected_passing_yards, actual.yards);
  const provenance = outcomeProvenance(selected, selection);
  return {
    ...identity(prediction, provenance),
    prediction_type: "passing",
    outcome: {
      ...provenance,
      projection: {
        projected_passing_yards: projection.projected_passing_yards,
        direct_model_prediction: projection.direct_model_prediction,
        projected_attempts: projection.projected_attempts,
        projected_ypa: projection.projected_ypa,
      },
      actual: {
        attempts: actual.attempts,
        completions: actual.completions,
        yards: actual.yards,
        yards_per_attempt: actual.yards_per_attempt,
        touchdowns: actual.touchdowns,
        interceptions: actual.interceptions,
      },
      error: {
        yards_error: derived.yards_error,
        absolute_yards_error: derived.absolute_yards_error,
        attempts_error: derived.attempts_error,
        ypa_error: derived.ypa_error,
      },
      volume: playerVolume("attempts", actual.attempts),
      market,
    },
    fitted_ordered_vector: prediction.feature_snapshot.ordered_vector ?? null,
    imputation_flags: prediction.feature_snapshot.imputation_flags ?? null,
    feature_snapshot_values: prediction.feature_snapshot.values,
    cohorts: derivePlayerCohorts({
      predictionType: "passing",
      context: cohortContext(prediction, ctx),
      projectedVolume: projection.projected_attempts ?? actual.attempts,
      market,
      featureValues: prediction.feature_snapshot.values,
    }),
  };
}

function buildRushingRow(
  prediction: PredictionSnapshotV1,
  selected: PredictionOutcomeEventV1,
  selection: ReturnType<typeof selectLatestOutcome>,
  ctx: EvaluationRowBuildContext,
): RushingEvaluationRow {
  if (prediction.projection.type !== "rushing" || selected.actual?.type !== "rushing" || selected.derived?.type !== "rushing") {
    throw new Error(`rushing row type mismatch for ${prediction.prediction_id}`);
  }
  const projection = prediction.projection;
  const actual = selected.actual;
  const derived = selected.derived;
  const market = selectPlayerMarket(prediction, projection.projected_rushing_yards, actual.yards);
  const provenance = outcomeProvenance(selected, selection);
  return {
    ...identity(prediction, provenance),
    prediction_type: "rushing",
    outcome: {
      ...provenance,
      projection: {
        projected_carries: projection.projected_carries,
        projected_ypc: projection.projected_ypc,
        projected_rushing_yards: projection.projected_rushing_yards,
      },
      actual: { carries: actual.carries, yards: actual.yards, yards_per_carry: actual.yards_per_carry },
      error: {
        yards_error: derived.yards_error,
        absolute_yards_error: derived.absolute_yards_error,
        carries_error: derived.carries_error,
        ypc_error: derived.ypc_error,
      },
      volume: playerVolume("carries", actual.carries),
      market,
    },
    feature_snapshot_values: prediction.feature_snapshot.values,
    cohorts: derivePlayerCohorts({
      predictionType: "rushing",
      context: cohortContext(prediction, ctx),
      projectedVolume: projection.projected_carries,
      market,
      featureValues: prediction.feature_snapshot.values,
    }),
  };
}

function buildReceivingRow(
  prediction: PredictionSnapshotV1,
  selected: PredictionOutcomeEventV1,
  selection: ReturnType<typeof selectLatestOutcome>,
  ctx: EvaluationRowBuildContext,
): ReceivingEvaluationRow {
  if (prediction.projection.type !== "receiving" || selected.actual?.type !== "receiving" || selected.derived?.type !== "receiving") {
    throw new Error(`receiving row type mismatch for ${prediction.prediction_id}`);
  }
  const projection = prediction.projection;
  const actual = selected.actual;
  const derived = selected.derived;
  const market = selectPlayerMarket(prediction, projection.projected_receiving_yards, actual.yards);
  const provenance = outcomeProvenance(selected, selection);
  return {
    ...identity(prediction, provenance),
    prediction_type: "receiving",
    outcome: {
      ...provenance,
      projection: {
        projected_targets: projection.projected_targets,
        projected_yards_per_target: projection.projected_yards_per_target,
        projected_receiving_yards: projection.projected_receiving_yards,
        projected_receptions: projection.projected_receptions,
        projected_yards_per_reception: projection.projected_yards_per_reception,
      },
      actual: {
        targets: actual.targets,
        receptions: actual.receptions,
        yards: actual.yards,
        yards_per_target: actual.yards_per_target,
        yards_per_reception: actual.yards_per_reception,
      },
      error: {
        yards_error: derived.yards_error,
        absolute_yards_error: derived.absolute_yards_error,
        targets_error: derived.targets_error,
        receptions_error: derived.receptions_error,
        yards_per_target_error: derived.yards_per_target_error,
        yards_per_reception_error: derived.yards_per_reception_error,
      },
      volume: playerVolume("targets", actual.targets),
      market,
    },
    feature_snapshot_values: prediction.feature_snapshot.values,
    cohorts: derivePlayerCohorts({
      predictionType: "receiving",
      context: cohortContext(prediction, ctx),
      projectedVolume: projection.projected_targets,
      market,
      featureValues: prediction.feature_snapshot.values,
    }),
  };
}

function nestedMarketNumber(values: Record<string, JsonValue>, field: "spread" | "total"): number | null {
  const snapshot = values.feature_snapshot as { market?: Record<string, unknown> } | undefined;
  const value = snapshot?.market?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildTeamOpportunityRow(
  prediction: PredictionSnapshotV1,
  selected: PredictionOutcomeEventV1,
  selection: ReturnType<typeof selectLatestOutcome>,
  ctx: EvaluationRowBuildContext,
): TeamOpportunityEvaluationRow {
  if (prediction.projection.type !== "team_opportunity" || selected.actual?.type !== "team_opportunity" || selected.derived?.type !== "team_opportunity") {
    throw new Error(`team_opportunity row type mismatch for ${prediction.prediction_id}`);
  }
  const projection = prediction.projection;
  const actual = selected.actual;
  const derived = selected.derived;
  const provenance = outcomeProvenance(selected, selection);
  const featureValues = prediction.feature_snapshot.values;
  return {
    ...identity(prediction, provenance),
    prediction_type: "team_opportunity",
    outcome: {
      ...provenance,
      projection: {
        projected_team_plays: projection.projected_team_plays,
        projected_dropback_rate: projection.projected_dropback_rate,
        projected_pass_attempts: projection.projected_pass_attempts,
        projected_rush_attempts: projection.projected_rush_attempts,
      },
      actual: {
        team_plays: actual.team_plays, dropbacks: actual.dropbacks, dropback_rate: actual.dropback_rate,
        designed_rush_attempts: actual.designed_rush_attempts, pass_attempts: actual.pass_attempts,
      },
      error: {
        team_plays_error: derived.team_plays_error, absolute_team_plays_error: derived.absolute_team_plays_error,
        dropbacks_error: derived.dropbacks_error, absolute_dropbacks_error: derived.absolute_dropbacks_error,
        dropback_rate_error: derived.dropback_rate_error, designed_rush_attempts_error: derived.designed_rush_attempts_error,
        pass_attempts_error: derived.pass_attempts_error,
      },
    },
    feature_snapshot_values: featureValues,
    cohorts: deriveTeamOpportunityCohorts({
      context: cohortContext(prediction, ctx),
      homeAway: prediction.home_away,
      modelVersion: prediction.model_version,
      marketSpread: nestedMarketNumber(featureValues, "spread"),
      marketTotal: nestedMarketNumber(featureValues, "total"),
      featureValues,
    }),
  };
}

function nestedString(values: Record<string, JsonValue>, path: readonly string[]): string | null {
  let cursor: JsonValue = values;
  for (const key of path) {
    if (cursor == null || typeof cursor !== "object" || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, JsonValue>)[key];
  }
  return typeof cursor === "string" ? cursor : null;
}

function nestedNumber(values: Record<string, JsonValue>, path: readonly string[]): number | null {
  let cursor: JsonValue = values;
  for (const key of path) {
    if (cursor == null || typeof cursor !== "object" || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, JsonValue>)[key];
  }
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null;
}

function buildTeamTotalRow(
  prediction: PredictionSnapshotV1,
  selected: PredictionOutcomeEventV1,
  selection: ReturnType<typeof selectLatestOutcome>,
  ctx: EvaluationRowBuildContext,
): TeamTotalEvaluationRow {
  if (prediction.projection.type !== "team_total" || selected.actual?.type !== "team_total" || selected.derived?.type !== "team_total") {
    throw new Error(`team_total row type mismatch for ${prediction.prediction_id}`);
  }
  const projection = prediction.projection;
  const actual = selected.actual;
  const derived = selected.derived;
  const provenance = outcomeProvenance(selected, selection);
  const featureValues = prediction.feature_snapshot.values;
  return {
    ...identity(prediction, provenance),
    prediction_type: "team_total",
    outcome: {
      ...provenance,
      projection: { projected_team_points: projection.projected_team_points },
      actual: { team_points: actual.team_points, opponent_points: actual.opponent_points, game_total: actual.game_total },
      error: { points_error: derived.points_error, absolute_points_error: derived.absolute_points_error },
    },
    feature_snapshot_values: featureValues,
    cohorts: deriveTeamTotalCohorts({
      context: cohortContext(prediction, ctx),
      homeAway: prediction.home_away,
      modelVersion: prediction.model_version,
      historyStatus: nestedString(featureValues, ["history", "history_status"]),
      projectedGameTotal: nestedNumber(featureValues, ["prediction", "projected_game_total"]),
      featureValues,
    }),
  };
}

function ledgerRow(
  prediction: PredictionSnapshotV1,
  selection: ReturnType<typeof selectLatestOutcome>,
): ResolutionStatusRow {
  const selected = selection.selected;
  const evaluable = selected?.resolution_status === "resolved";
  return {
    schema_version: EVALUATION_DATASET_SCHEMA_VERSION,
    materializer_version: EVALUATION_MATERIALIZER_VERSION,
    evaluation_mode: "production",
    prediction_id: prediction.prediction_id,
    snapshot_key: prediction.snapshot_key,
    snapshot_label: prediction.snapshot_label,
    prediction_timestamp: prediction.prediction_timestamp,
    kickoff_utc: prediction.kickoff_utc,
    season: prediction.season,
    week: prediction.week,
    game_id: prediction.game_id,
    player_id: prediction.player_id,
    team: prediction.team,
    opponent: prediction.opponent,
    prediction_type: prediction.prediction_type,
    model_name: prediction.model_name,
    model_version: prediction.model_version,
    fitted_model_hash: prediction.feature_snapshot.fitted_model_hash,
    ledger_status: selected ? selected.resolution_status : "unresolved_missing_event",
    evaluable,
    selected_outcome_id: selected?.outcome_id ?? null,
    selected_outcome_revision: selection.selected_outcome_revision,
    outcome_revision_count: selection.outcome_revision_count,
    superseded_outcome_ids: selection.superseded_outcome_ids,
    outcome_revision_chronology: selection.chronology,
    game_completion_status: selected ? selected.game_completion_status : "missing",
    identity_method: selected ? selected.identity_resolution.method : "unresolved",
    note: selected
      ? null
      : "No outcome event exists for this production prediction; run the WU2 resolver before materializing evaluation metrics.",
  };
}

/**
 * Build the ledger row (always) and the evaluable row (only when the latest
 * valid outcome revision is `resolved`) for one prediction.
 */
export function buildEvaluationRow(
  prediction: PredictionSnapshotV1,
  events: readonly PredictionOutcomeEventV1[],
  ctx: EvaluationRowBuildContext,
): BuiltEvaluationRow {
  const selection = selectLatestOutcome(events);
  const ledger = ledgerRow(prediction, selection);
  const selected = selection.selected;
  if (!selected || selected.resolution_status !== "resolved") {
    return { row: null, ledger };
  }
  const builders = {
    spread: buildSpreadRow,
    passing: buildPassingRow,
    rushing: buildRushingRow,
    receiving: buildReceivingRow,
    team_opportunity: buildTeamOpportunityRow,
    team_total: buildTeamTotalRow,
  } as const;
  const row = builders[prediction.prediction_type](prediction, selected, selection, ctx);
  return { row, ledger };
}

export type { EvaluationRowV1, ResolutionStatusRow };
