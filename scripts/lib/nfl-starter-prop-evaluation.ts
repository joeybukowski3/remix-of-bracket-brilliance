/**
 * NFL Performance Center WU2: canonical starter-prop evaluation materializer.
 *
 * Joins the WU1 frozen starter cohort (`data/nfl/starter-cohorts/<season>/
 * <week>.jsonl`) to archived production player-yardage projections
 * (`PredictionSnapshotV1`, prediction_type passing/rushing/receiving),
 * pregame `market_snapshot_refs` embedded on those same immutable snapshots,
 * and resolved `PredictionOutcomeEventV1` outcome events. It never reads a
 * postgame source to decide starter eligibility or projection/market
 * selection -- only `selected.actual`/`selected.derived` (gated on
 * `resolution_status === "resolved"`) ever sees postgame data, and only
 * after a row is otherwise fully pregame-qualified.
 *
 * Market-line source: `market_snapshot_refs` on the prediction snapshot
 * itself (not the raw `data/nfl/props/market-archive/nfl-yardage-market-
 * archive.jsonl` file) is the correct join target, because
 * `validatePredictionSnapshot` already enforces `observed_at <=
 * prediction_timestamp < kickoff_utc` for every reference on a production
 * row -- the raw archive file has no equivalent per-row immutability
 * guarantee tied to a specific prediction. Only `purpose: "comparison"`
 * references are used; `model_input` is never substituted (see
 * `selectComparisonMarket`).
 *
 * One starter-cohort row maps to exactly one gradeable market
 * (QB->passing_yards, RB->rushing_yards, WR/TE->receiving_yards) per V1
 * scope; there is intentionally no cross-market grading (e.g. no
 * QB rushing_yards) even where a cohort player also carries an off-position
 * projection.
 */
import { canonicalJson, contentHash, type JsonValue, type PredictionSnapshotV1, type PredictionType } from "./nfl-production-prediction-archive";
import type { PredictionOutcomeEventV1 } from "./nfl-prediction-outcome-resolver";
import { selectLatestOutcome } from "./nfl-evaluation-dataset";
import type { StarterCohortRecordV1 } from "./nfl-starter-cohort";

export const STARTER_PROP_EVALUATION_SCHEMA_VERSION = "nfl-starter-prop-evaluation-v1" as const;
export const STARTER_PROP_MATERIALIZER_VERSION = "nfl-starter-prop-evaluation-materializer-v1" as const;

export type StarterPropMarket = "passing_yards" | "rushing_yards" | "receiving_yards";

const MARKET_BY_POSITION: Record<StarterCohortRecordV1["position"], StarterPropMarket> = {
  QB: "passing_yards",
  RB: "rushing_yards",
  WR: "receiving_yards",
  TE: "receiving_yards",
};

const PREDICTION_TYPE_BY_POSITION: Record<StarterCohortRecordV1["position"], PredictionType> = {
  QB: "passing",
  RB: "rushing",
  WR: "receiving",
  TE: "receiving",
};

export type EvaluationExclusionReason =
  | "NO_VALID_PROJECTION"
  | "MODEL_STATUS_NOT_PROJECTED"
  | "POST_KICKOFF_ONLY_PROJECTION"
  | "NO_VALID_COMPARISON_LINE"
  | "GAME_NOT_FINAL"
  | "ACTUAL_UNRESOLVED"
  | "MARKET_MISMATCH";

export type StarterPropExclusion = {
  season: number;
  week: number;
  game_id: string;
  team: string;
  player_id: string;
  player_name: string | null;
  position: StarterCohortRecordV1["position"];
  market: StarterPropMarket;
  starter_cohort_row_id: string;
  reason: EvaluationExclusionReason;
  detail: string | null;
};

export type StarterPropDirection = "OVER" | "UNDER" | "NEUTRAL";
export type StarterPropMarketOutcome = "OVER" | "UNDER" | "PUSH";
export type StarterPropDirectionalResult = "WIN" | "LOSS" | "PUSH" | "NEUTRAL";

export type StarterPropEvaluationRowV1 = {
  // IDENTITY
  schema_version: typeof STARTER_PROP_EVALUATION_SCHEMA_VERSION;
  evaluation_row_id: string;
  season: number;
  week: number;
  game_id: string;
  kickoff_time: string;
  team: string;
  opponent: string;
  home_away: "home" | "away";
  player_id: string;
  player_name: string | null;
  position: StarterCohortRecordV1["position"];
  market: StarterPropMarket;

  // STARTER ELIGIBILITY
  starter_basis: StarterCohortRecordV1["starter_basis"];
  starter_rank: number;
  starter_metric: StarterCohortRecordV1["starter_metric"];
  starter_metric_value: number;
  starter_cohort_row_id: string;
  eligibility_prediction_timestamp: string;
  eligibility_model_version: string;
  eligibility_prediction_id: string;
  role_source_updated_at: string | null;

  // PROJECTION
  jkb_projection: number;
  prediction_id: string;
  prediction_timestamp: string;
  prediction_type: PredictionType;
  model_version: string;
  fitted_model_hash: string | null;
  projection_status: PredictionSnapshotV1["status"];

  // MARKET
  market_line: number;
  market_provider: string;
  market_book: string;
  market_snapshot_timestamp: string;
  market_snapshot_ref: string | null;
  market_purpose: "comparison";
  over_price: number | null;
  under_price: number | null;

  // RESULT
  actual: number;
  game_completion_status: PredictionOutcomeEventV1["game_completion_status"];
  resolution_status: PredictionOutcomeEventV1["resolution_status"];
  projection_difference: number;
  direction: StarterPropDirection;
  market_outcome: StarterPropMarketOutcome;
  directional_result: StarterPropDirectionalResult;
  signed_projection_error: number;
  absolute_projection_error: number;
  squared_projection_error: number;

  // PROVENANCE
  generated_at: string;
  outcome_id: string;
  outcome_revision: number;
  resolver_version: PredictionOutcomeEventV1["resolver_version"];
  outcome_source_state_hash: string;
  feature_payload_hash: string;

  // DEEP ANALYSIS CONTEXT -- verbatim `feature_snapshot.values` from the
  // selected pregame projection snapshot. Nothing here is invented or
  // recomputed: it is the exact immutable pregame feature payload the model
  // used, preserved for future segmentation (see module docblock).
  context: Record<string, JsonValue>;
};

export type StarterPropEvaluationSummary = {
  total_cohort_rows: number;
  gradeable_rows: number;
  win_n: number;
  loss_n: number;
  push_n: number;
  neutral_n: number;
  directional_hit_rate: number | null;
  exclusions_by_reason: Record<EvaluationExclusionReason, number>;
};

function isValidPregameProjection(row: PredictionSnapshotV1, kickoffMillis: number): boolean {
  if (row.mode !== "production") return false;
  if (row.status !== "projected") return false;
  const predictionMillis = Date.parse(row.prediction_timestamp);
  return Number.isFinite(predictionMillis) && predictionMillis < kickoffMillis;
}

/** Latest valid pregame snapshot for one (player_id, game_id, prediction_type). Never averages; never picks a post-kickoff row. */
function selectLatestPregameProjection(
  candidates: readonly PredictionSnapshotV1[],
  kickoffMillis: number,
): { selected: PredictionSnapshotV1 | null; sawAnyRow: boolean; sawOnlyPostKickoff: boolean; sawOnlyNonProjectedStatus: boolean } {
  const sawAnyRow = candidates.length > 0;
  let sawPostKickoffOnly = candidates.length > 0;
  let sawNonProjectedOnly = candidates.length > 0;
  let best: PredictionSnapshotV1 | null = null;
  for (const row of candidates) {
    if (row.status === "projected") sawNonProjectedOnly = false;
    const predictionMillis = Date.parse(row.prediction_timestamp);
    if (Number.isFinite(predictionMillis) && predictionMillis < kickoffMillis) sawPostKickoffOnly = false;
    if (!isValidPregameProjection(row, kickoffMillis)) continue;
    if (!best || row.prediction_timestamp > best.prediction_timestamp) best = row;
  }
  return { selected: best, sawAnyRow, sawOnlyPostKickoff: sawPostKickoffOnly, sawOnlyNonProjectedStatus: sawNonProjectedOnly };
}

/**
 * Latest valid comparison-purpose market reference for the wanted market
 * type. `model_input` references are never used as a fallback -- if no
 * `comparison` reference exists this returns null and the caller records
 * `NO_VALID_COMPARISON_LINE`, per the WU2 contract's explicit prohibition on
 * inventing a fallback hierarchy that isn't already present in the archive.
 */
function selectComparisonMarket(
  prediction: PredictionSnapshotV1,
  market: StarterPropMarket,
): PredictionSnapshotV1["market_snapshot_refs"][number] | null {
  const candidates = prediction.market_snapshot_refs.filter((ref) => ref.market_type === market && ref.purpose === "comparison");
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort(
    (a, b) => b.observed_at.localeCompare(a.observed_at) || a.sportsbook.localeCompare(b.sportsbook),
  );
  return sorted[0];
}

function projectedValue(projection: PredictionSnapshotV1["projection"]): number {
  switch (projection.type) {
    case "passing":
      return projection.projected_passing_yards;
    case "rushing":
      return projection.projected_rushing_yards;
    case "receiving":
      return projection.projected_receiving_yards;
    default:
      throw new Error(`unsupported projection type for starter prop grading: ${projection.type}`);
  }
}

function actualValue(actual: NonNullable<PredictionOutcomeEventV1["actual"]>): number {
  switch (actual.type) {
    case "passing":
      return actual.yards;
    case "rushing":
      return actual.yards;
    case "receiving":
      return actual.yards;
    default:
      throw new Error(`unsupported actual type for starter prop grading: ${actual.type}`);
  }
}

function direction(projectionDifference: number): StarterPropDirection {
  if (projectionDifference > 0) return "OVER";
  if (projectionDifference < 0) return "UNDER";
  return "NEUTRAL";
}

function marketOutcome(actual: number, marketLine: number): StarterPropMarketOutcome {
  if (actual > marketLine) return "OVER";
  if (actual < marketLine) return "UNDER";
  return "PUSH";
}

function directionalResult(dir: StarterPropDirection, outcome: StarterPropMarketOutcome): StarterPropDirectionalResult {
  if (dir === "NEUTRAL") return "NEUTRAL";
  if (outcome === "PUSH") return "PUSH";
  return dir === outcome ? "WIN" : "LOSS";
}

function evaluationRowId(season: number, week: number, gameId: string, playerId: string, market: StarterPropMarket): string {
  return `starterprop_${contentHash({ season, week, game_id: gameId, player_id: playerId, market } as JsonValue)}`;
}

export function buildStarterPropEvaluations(input: {
  cohort: readonly StarterCohortRecordV1[];
  predictions: readonly PredictionSnapshotV1[];
  outcomeEvents: readonly PredictionOutcomeEventV1[];
  generatedAt: string;
}): { rows: StarterPropEvaluationRowV1[]; exclusions: StarterPropExclusion[] } {
  const predictionsByPlayerGameType = new Map<string, PredictionSnapshotV1[]>();
  for (const row of input.predictions) {
    if (row.player_id == null) continue;
    const key = `${row.game_id}|${row.player_id}|${row.prediction_type}`;
    predictionsByPlayerGameType.set(key, [...(predictionsByPlayerGameType.get(key) ?? []), row]);
  }

  const eventsByPredictionId = new Map<string, PredictionOutcomeEventV1[]>();
  for (const event of input.outcomeEvents) {
    eventsByPredictionId.set(event.prediction_id, [...(eventsByPredictionId.get(event.prediction_id) ?? []), event]);
  }

  const rows: StarterPropEvaluationRowV1[] = [];
  const exclusions: StarterPropExclusion[] = [];
  const seenRowIdentity = new Set<string>();

  for (const cohortRow of input.cohort) {
    const market = MARKET_BY_POSITION[cohortRow.position];
    const predictionType = PREDICTION_TYPE_BY_POSITION[cohortRow.position];
    if (!market || !predictionType) {
      exclusions.push(baseExclusion(cohortRow, cohortRow.position in MARKET_BY_POSITION ? "receiving_yards" : "passing_yards", "MARKET_MISMATCH", `unsupported position ${cohortRow.position}`));
      continue;
    }

    const identityKey = `${cohortRow.season}|${cohortRow.week}|${cohortRow.game_id}|${cohortRow.player_id}|${market}`;
    if (seenRowIdentity.has(identityKey)) {
      throw new Error(`duplicate logical starter-prop row detected for ${identityKey}`);
    }
    seenRowIdentity.add(identityKey);

    const kickoffMillis = Date.parse(cohortRow.kickoff_time);
    const candidates = predictionsByPlayerGameType.get(`${cohortRow.game_id}|${cohortRow.player_id}|${predictionType}`) ?? [];
    const selection = selectLatestPregameProjection(candidates, kickoffMillis);
    if (!selection.selected) {
      if (!selection.sawAnyRow) {
        exclusions.push(baseExclusion(cohortRow, market, "NO_VALID_PROJECTION", "no archived projection for player/game/market"));
      } else if (selection.sawOnlyPostKickoff) {
        exclusions.push(baseExclusion(cohortRow, market, "POST_KICKOFF_ONLY_PROJECTION", "only post-kickoff projection snapshots exist"));
      } else if (selection.sawOnlyNonProjectedStatus) {
        exclusions.push(baseExclusion(cohortRow, market, "MODEL_STATUS_NOT_PROJECTED", "no snapshot with status=projected"));
      } else {
        exclusions.push(baseExclusion(cohortRow, market, "NO_VALID_PROJECTION", "no valid pregame projection snapshot"));
      }
      continue;
    }

    const prediction = selection.selected;
    const marketRef = selectComparisonMarket(prediction, market);
    if (!marketRef) {
      exclusions.push(baseExclusion(cohortRow, market, "NO_VALID_COMPARISON_LINE", "no purpose=comparison market_snapshot_ref for this market_type"));
      continue;
    }

    const events = eventsByPredictionId.get(prediction.prediction_id) ?? [];
    const outcomeSelection = selectLatestOutcome(events);
    const selectedOutcome = outcomeSelection.selected;
    if (!selectedOutcome) {
      exclusions.push(baseExclusion(cohortRow, market, "ACTUAL_UNRESOLVED", "no outcome event archived for this prediction_id yet"));
      continue;
    }
    if (selectedOutcome.game_completion_status !== "final") {
      exclusions.push(baseExclusion(cohortRow, market, "GAME_NOT_FINAL", `game_completion_status=${selectedOutcome.game_completion_status}`));
      continue;
    }
    if (selectedOutcome.resolution_status !== "resolved" || !selectedOutcome.actual) {
      exclusions.push(baseExclusion(cohortRow, market, "ACTUAL_UNRESOLVED", `resolution_status=${selectedOutcome.resolution_status}`));
      continue;
    }

    const jkbProjection = projectedValue(prediction.projection);
    const actual = actualValue(selectedOutcome.actual);
    const projectionDifference = jkbProjection - marketRef.line;
    const dir = direction(projectionDifference);
    const outcome = marketOutcome(actual, marketRef.line);
    const signedError = jkbProjection - actual;

    rows.push({
      schema_version: STARTER_PROP_EVALUATION_SCHEMA_VERSION,
      evaluation_row_id: evaluationRowId(cohortRow.season, cohortRow.week, cohortRow.game_id, cohortRow.player_id, market),
      season: cohortRow.season,
      week: cohortRow.week,
      game_id: cohortRow.game_id,
      kickoff_time: cohortRow.kickoff_time,
      team: cohortRow.team,
      opponent: cohortRow.opponent,
      home_away: cohortRow.home_away,
      player_id: cohortRow.player_id,
      player_name: cohortRow.player_name,
      position: cohortRow.position,
      market,

      starter_basis: cohortRow.starter_basis,
      starter_rank: cohortRow.starter_rank,
      starter_metric: cohortRow.starter_metric,
      starter_metric_value: cohortRow.starter_metric_value,
      starter_cohort_row_id: cohortRow.cohort_row_id,
      eligibility_prediction_timestamp: cohortRow.eligibility_prediction_timestamp,
      eligibility_model_version: cohortRow.eligibility_model_version,
      eligibility_prediction_id: cohortRow.eligibility_prediction_id,
      role_source_updated_at: cohortRow.role_source_updated_at,

      jkb_projection: jkbProjection,
      prediction_id: prediction.prediction_id,
      prediction_timestamp: prediction.prediction_timestamp,
      prediction_type: prediction.prediction_type,
      model_version: prediction.model_version,
      fitted_model_hash: prediction.feature_snapshot.fitted_model_hash,
      projection_status: prediction.status,

      market_line: marketRef.line,
      market_provider: marketRef.provider,
      market_book: marketRef.sportsbook,
      market_snapshot_timestamp: marketRef.observed_at,
      market_snapshot_ref: marketRef.market_observation_id ?? marketRef.content_hash,
      market_purpose: "comparison",
      over_price: marketRef.over_price,
      under_price: marketRef.under_price,

      actual,
      game_completion_status: selectedOutcome.game_completion_status,
      resolution_status: selectedOutcome.resolution_status,
      projection_difference: projectionDifference,
      direction: dir,
      market_outcome: outcome,
      directional_result: directionalResult(dir, outcome),
      signed_projection_error: signedError,
      absolute_projection_error: Math.abs(signedError),
      squared_projection_error: signedError * signedError,

      generated_at: input.generatedAt,
      outcome_id: selectedOutcome.outcome_id,
      outcome_revision: selectedOutcome.outcome_revision,
      resolver_version: selectedOutcome.resolver_version,
      outcome_source_state_hash: selectedOutcome.source_state_hash,
      feature_payload_hash: prediction.feature_snapshot.feature_payload_hash,

      context: prediction.feature_snapshot.values,
    });
  }

  rows.sort((a, b) => a.game_id.localeCompare(b.game_id) || a.team.localeCompare(b.team) || a.market.localeCompare(b.market) || a.player_id.localeCompare(b.player_id));
  exclusions.sort((a, b) => a.game_id.localeCompare(b.game_id) || a.team.localeCompare(b.team) || a.player_id.localeCompare(b.player_id));

  return { rows, exclusions };
}

function baseExclusion(
  cohortRow: StarterCohortRecordV1,
  market: StarterPropMarket,
  reason: EvaluationExclusionReason,
  detail: string,
): StarterPropExclusion {
  return {
    season: cohortRow.season,
    week: cohortRow.week,
    game_id: cohortRow.game_id,
    team: cohortRow.team,
    player_id: cohortRow.player_id,
    player_name: cohortRow.player_name,
    position: cohortRow.position,
    market,
    starter_cohort_row_id: cohortRow.cohort_row_id,
    reason,
    detail,
  };
}

export function summarizeStarterPropEvaluations(
  totalCohortRows: number,
  rows: readonly StarterPropEvaluationRowV1[],
  exclusions: readonly StarterPropExclusion[],
): StarterPropEvaluationSummary {
  let winN = 0;
  let lossN = 0;
  let pushN = 0;
  let neutralN = 0;
  for (const row of rows) {
    if (row.directional_result === "WIN") winN += 1;
    else if (row.directional_result === "LOSS") lossN += 1;
    else if (row.directional_result === "PUSH") pushN += 1;
    else neutralN += 1;
  }
  const exclusionsByReason: Record<EvaluationExclusionReason, number> = {
    NO_VALID_PROJECTION: 0,
    MODEL_STATUS_NOT_PROJECTED: 0,
    POST_KICKOFF_ONLY_PROJECTION: 0,
    NO_VALID_COMPARISON_LINE: 0,
    GAME_NOT_FINAL: 0,
    ACTUAL_UNRESOLVED: 0,
    MARKET_MISMATCH: 0,
  };
  for (const exclusion of exclusions) exclusionsByReason[exclusion.reason] += 1;
  return {
    total_cohort_rows: totalCohortRows,
    gradeable_rows: rows.length,
    win_n: winN,
    loss_n: lossN,
    push_n: pushN,
    neutral_n: neutralN,
    directional_hit_rate: winN + lossN > 0 ? winN / (winN + lossN) : null,
    exclusions_by_reason: exclusionsByReason,
  };
}

export function serializeStarterPropEvaluations(rows: readonly StarterPropEvaluationRowV1[]): string {
  return rows.map((row) => canonicalJson(row as unknown as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : "");
}
