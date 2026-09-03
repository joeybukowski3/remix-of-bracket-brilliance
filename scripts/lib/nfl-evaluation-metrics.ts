/**
 * WU3 evaluation metrics + machine-readable summary.
 *
 * Reuses the Phase 11A descriptive-accuracy primitives (`mae`, `rmse`,
 * `bias`, `pearsonCorrelation`) verbatim so the forward-production evaluation
 * layer and the historical research layer report the same quantities the
 * same way. `bias` is mean(prediction - actual): positive = over-projection.
 *
 * Sample-size discipline (EVALUATION_STANDARDS): every block carries `n`;
 * correlation, directional/ATS percentages, and cohort comparisons return
 * null with an explicit `insufficient_sample` flag below their threshold.
 * Row-level datasets always exist regardless of sample size; the summary
 * only labels small cells, it never hides them.
 */
import { bias, mae, pearsonCorrelation, rmse } from "./nfl-research-metrics.mjs";
import type { JsonValue } from "./nfl-production-prediction-archive";
import type { EvaluationPredictionType, EvaluationRowV1 } from "./nfl-evaluation-dataset";

export const SAMPLE_SIZE_THRESHOLDS = Object.freeze({
  /** Below this, Pearson correlation is not reported. */
  correlation: 10,
  /** Below this, a hit-rate style percentage (winner, ATS, over/under) is not reported. */
  rate: 20,
  /** At/above this a cohort cell is "full"; below it the cell is labeled small-sample. */
  cohort_label: 20,
});

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratePct(numerator: number, denominator: number): number | null {
  if (denominator < SAMPLE_SIZE_THRESHOLDS.rate) return null;
  return numerator / denominator;
}

type ProjActual = { projection: number; actual: number };

function projActualPairs(rows: readonly EvaluationRowV1[]): ProjActual[] {
  return rows.map((row) => {
    if (row.prediction_type === "spread") {
      return { projection: row.outcome.projection.projected_home_margin, actual: row.outcome.actual.home_margin };
    }
    if (row.prediction_type === "passing") {
      return { projection: row.outcome.projection.projected_passing_yards, actual: row.outcome.actual.yards };
    }
    if (row.prediction_type === "rushing") {
      return { projection: row.outcome.projection.projected_rushing_yards, actual: row.outcome.actual.yards };
    }
    if (row.prediction_type === "team_opportunity") {
      return { projection: row.outcome.projection.projected_team_plays, actual: row.outcome.actual.team_plays };
    }
    return { projection: row.outcome.projection.projected_receiving_yards, actual: row.outcome.actual.yards };
  });
}

function coreErrorBlock(rows: readonly EvaluationRowV1[]): Record<string, JsonValue> {
  const pairs = projActualPairs(rows);
  const actuals = pairs.map((pair) => pair.actual);
  const projections = pairs.map((pair) => pair.projection);
  const absErrors = pairs.map((pair) => Math.abs(pair.projection - pair.actual));
  const correlationEligible = pairs.length >= SAMPLE_SIZE_THRESHOLDS.correlation;
  return {
    n: pairs.length,
    mae: mae(actuals, projections),
    median_absolute_error: median(absErrors),
    rmse: rmse(actuals, projections),
    bias: bias(actuals, projections),
    correlation: correlationEligible ? pearsonCorrelation(actuals, projections) : null,
    correlation_insufficient_sample: !correlationEligible,
  };
}

function spreadExtras(rows: readonly EvaluationRowV1[]): Record<string, JsonValue> {
  const spreadRows = rows.filter((row): row is Extract<EvaluationRowV1, { prediction_type: "spread" }> => row.prediction_type === "spread");
  const winnerCorrect = spreadRows.filter((row) => row.outcome.error.projected_winner_correct).length;
  const actualTies = spreadRows.filter((row) => row.outcome.actual.winner === "tie").length;
  const projectedPicks = spreadRows.filter((row) => row.outcome.error.projected_margin_direction === "pick").length;

  const withMarket = spreadRows.filter((row) => row.outcome.market.observation_count > 0);
  const jkbErrors: number[] = [];
  const marketErrors: number[] = [];
  let atsWin = 0;
  let atsLoss = 0;
  let atsPush = 0;
  for (const row of withMarket) {
    const primary = row.outcome.market.observations[0];
    jkbErrors.push(Math.abs(row.outcome.projection.projected_home_margin - row.outcome.actual.home_margin));
    marketErrors.push(Math.abs(primary.market_implied_home_margin - row.outcome.actual.home_margin));
    if (primary.ats_result === "win") atsWin += 1;
    else if (primary.ats_result === "loss") atsLoss += 1;
    else if (primary.ats_result === "push") atsPush += 1;
  }
  const atsDecided = atsWin + atsLoss;
  return {
    winner_accuracy: {
      correct: winnerCorrect,
      total: spreadRows.length,
      accuracy: ratePct(winnerCorrect, spreadRows.length),
      actual_ties: actualTies,
      projected_picks: projectedPicks,
      insufficient_sample: spreadRows.length < SAMPLE_SIZE_THRESHOLDS.rate,
    },
    market_comparison: {
      comparable_n: withMarket.length,
      jkb_mae: mean(jkbErrors),
      market_mae: mean(marketErrors),
      jkb_minus_market_mae: mean(jkbErrors) != null && mean(marketErrors) != null ? (mean(jkbErrors) as number) - (mean(marketErrors) as number) : null,
    },
    ats: {
      win: atsWin,
      loss: atsLoss,
      push: atsPush,
      decided: atsDecided,
      ats_win_pct: ratePct(atsWin, atsDecided),
      insufficient_sample: atsDecided < SAMPLE_SIZE_THRESHOLDS.rate,
    },
  };
}

type PlayerRow = Extract<EvaluationRowV1, { prediction_type: "passing" | "rushing" | "receiving" }>;

function componentMean(rows: readonly PlayerRow[], pick: (row: PlayerRow) => number | null): number | null {
  return mean(rows.map(pick).filter((value): value is number => value != null));
}

function absComponentMean(rows: readonly PlayerRow[], pick: (row: PlayerRow) => number | null): number | null {
  return mean(rows.map(pick).filter((value): value is number => value != null).map(Math.abs));
}

function playerExtras(predictionType: Exclude<EvaluationPredictionType, "spread">, rows: readonly EvaluationRowV1[]): Record<string, JsonValue> {
  const playerRows = rows.filter((row): row is PlayerRow => row.prediction_type === predictionType);
  const yardAbs = playerRows.map((row) => row.outcome.error.absolute_yards_error);
  const zeroVolume = playerRows.filter((row) => row.outcome.volume.zero_volume);
  const nonZeroVolume = playerRows.filter((row) => !row.outcome.volume.zero_volume);

  const component: Record<string, JsonValue> = { yards_mae: mean(yardAbs) };
  if (predictionType === "passing") {
    component.attempts_mae = absComponentMean(playerRows, (row) => (row.prediction_type === "passing" ? row.outcome.error.attempts_error : null));
    component.ypa_error_mean = componentMean(playerRows, (row) => (row.prediction_type === "passing" ? row.outcome.error.ypa_error : null));
  } else if (predictionType === "rushing") {
    component.carries_mae = absComponentMean(playerRows, (row) => (row.prediction_type === "rushing" ? row.outcome.error.carries_error : null));
    component.ypc_error_mean = componentMean(playerRows, (row) => (row.prediction_type === "rushing" ? row.outcome.error.ypc_error : null));
  } else {
    component.targets_mae = absComponentMean(playerRows, (row) => (row.prediction_type === "receiving" ? row.outcome.error.targets_error : null));
    component.ypt_error_mean = componentMean(playerRows, (row) => (row.prediction_type === "receiving" ? row.outcome.error.yards_per_target_error : null));
    component.receptions_mae = absComponentMean(playerRows, (row) => (row.prediction_type === "receiving" ? row.outcome.error.receptions_error : null));
    component.ypr_error_mean = componentMean(playerRows, (row) => (row.prediction_type === "receiving" ? row.outcome.error.yards_per_reception_error : null));
  }

  const graded = playerRows.filter((row) => row.outcome.market != null);
  let over = 0;
  let under = 0;
  let push = 0;
  for (const row of graded) {
    const result = row.outcome.market?.over_under_result;
    if (result === "over") over += 1;
    else if (result === "under") under += 1;
    else if (result === "push") push += 1;
  }
  return {
    component,
    volume_decomposition: {
      zero_volume_n: zeroVolume.length,
      non_zero_volume_n: nonZeroVolume.length,
      zero_volume_yards_mae: mean(zeroVolume.map((row) => row.outcome.error.absolute_yards_error)),
      non_zero_volume_yards_mae: mean(nonZeroVolume.map((row) => row.outcome.error.absolute_yards_error)),
      note: "Zero-volume rows are recorded/ACT-confirmed zeros; aggregate MAE must be read with this decomposition (EVALUATION_STANDARDS).",
    },
    market_direction: {
      graded_n: graded.length,
      over,
      under,
      push,
      insufficient_sample: graded.length - push < SAMPLE_SIZE_THRESHOLDS.rate,
      note: "Directional counts only; price and break-even are on each row. Raw hit rate is not a promotion signal.",
    },
  };
}

type TeamOpportunityRow = Extract<EvaluationRowV1, { prediction_type: "team_opportunity" }>;

/**
 * team_opportunity diagnostics (Part 9): the top-level core block already
 * carries plays MAE/bias (see projActualPairs above); this adds
 * dropbacks/dropback-rate/designed-rush-attempts MAE + bias, using the same
 * honest naming as TeamOpportunityDerived (see
 * nfl-prediction-outcome-resolver.ts's doc comment for why "dropbacks", not
 * "pass_attempts", is the correct comparison for WU4A's trained target).
 */
function teamOpportunityExtras(rows: readonly EvaluationRowV1[]): Record<string, JsonValue> {
  const teamRows = rows.filter((row): row is TeamOpportunityRow => row.prediction_type === "team_opportunity");
  const dropbackErrors = teamRows.map((row) => row.outcome.error.dropbacks_error);
  const dropbackRateErrors = teamRows.map((row) => row.outcome.error.dropback_rate_error);
  const designedRushErrors = teamRows.map((row) => row.outcome.error.designed_rush_attempts_error);
  return {
    component: {
      dropbacks_mae: mean(dropbackErrors.map(Math.abs)),
      dropbacks_bias: mean(dropbackErrors),
      dropback_rate_mae: mean(dropbackRateErrors.map(Math.abs)),
      dropback_rate_bias: mean(dropbackRateErrors),
      designed_rush_attempts_mae: mean(designedRushErrors.map(Math.abs)),
      designed_rush_attempts_bias: mean(designedRushErrors),
    },
  };
}

export function computeMetricBlock(predictionType: EvaluationPredictionType, rows: readonly EvaluationRowV1[]): Record<string, JsonValue> {
  const typed = rows.filter((row) => row.prediction_type === predictionType);
  const core = coreErrorBlock(typed);
  const extras = predictionType === "spread" ? spreadExtras(typed)
    : predictionType === "team_opportunity" ? teamOpportunityExtras(typed)
    : playerExtras(predictionType, typed);
  return {
    ...core,
    ...extras,
    small_sample: typed.length < SAMPLE_SIZE_THRESHOLDS.cohort_label,
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(key(item)) ?? [];
    bucket.push(item);
    map.set(key(item), bucket);
  }
  return map;
}

function sortedEntries<T>(map: Map<string, T>): [string, T][] {
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const PREDICTION_TYPES: EvaluationPredictionType[] = ["spread", "passing", "rushing", "receiving", "team_opportunity"];

export type LedgerStatusCounts = Record<string, number>;

export type EvaluationSummaryInput = {
  season: number | "all";
  filters: { week: number | null; prediction_type: EvaluationPredictionType | null };
  rows: readonly EvaluationRowV1[];
  coverage: {
    predictions_loaded: number;
    non_production_skipped: number;
    ledger_by_status: LedgerStatusCounts;
    evaluable_by_type: Record<string, number>;
  };
  source_provenance: Record<string, JsonValue>;
};

export function buildEvaluationSummary(input: EvaluationSummaryInput): Record<string, JsonValue> {
  const activeTypes = input.filters.prediction_type ? [input.filters.prediction_type] : PREDICTION_TYPES;

  const byPredictionType: Record<string, JsonValue> = {};
  for (const type of activeTypes) {
    byPredictionType[type] = computeMetricBlock(type, input.rows);
  }

  const byModelVersion = sortedEntries(
    groupBy(input.rows, (row) => `${row.prediction_type}::${row.model_name}::${row.model_version}`),
  ).map(([composite, rows]) => {
    const [prediction_type, model_name, model_version] = composite.split("::");
    return { prediction_type, model_name, model_version, metrics: computeMetricBlock(prediction_type as EvaluationPredictionType, rows) };
  });

  const byFittedState = sortedEntries(
    groupBy(input.rows, (row) => `${row.prediction_type}::${row.model_name}::${row.model_version}::${row.fitted_model_hash ?? "none"}`),
  ).map(([composite, rows]) => {
    const [prediction_type, model_name, model_version, fitted_model_hash] = composite.split("::");
    return {
      prediction_type,
      model_name,
      model_version,
      fitted_model_hash: fitted_model_hash === "none" ? null : fitted_model_hash,
      metrics: computeMetricBlock(prediction_type as EvaluationPredictionType, rows),
    };
  });

  const bySeason = sortedEntries(groupBy(input.rows, (row) => `${row.prediction_type}::${row.season}`)).map(([composite, rows]) => {
    const [prediction_type, season] = composite.split("::");
    return { prediction_type, season: Number(season), metrics: computeMetricBlock(prediction_type as EvaluationPredictionType, rows) };
  });

  const byCohort: Record<string, JsonValue> = {};
  for (const type of activeTypes) {
    const typed = input.rows.filter((row) => row.prediction_type === type);
    const dimensions = new Set<string>();
    for (const row of typed) for (const key of Object.keys(row.cohorts)) dimensions.add(key);
    const dimensionMap: Record<string, JsonValue> = {};
    for (const dimension of [...dimensions].sort()) {
      const labelled = groupBy(
        typed.filter((row) => row.cohorts[dimension] != null),
        (row) => String(row.cohorts[dimension]),
      );
      const labels: Record<string, JsonValue> = {};
      for (const [label, rows] of sortedEntries(labelled)) {
        labels[label] = computeMetricBlock(type, rows);
      }
      if (Object.keys(labels).length > 0) dimensionMap[dimension] = labels;
    }
    byCohort[type] = dimensionMap;
  }

  return {
    schema_version: "jkb-football-evaluation-summary-v1",
    materializer_version: "nfl-evaluation-materializer-v1",
    evaluation_mode: "production",
    season: input.season,
    filters: { week: input.filters.week, prediction_type: input.filters.prediction_type },
    sample_size_thresholds: { ...SAMPLE_SIZE_THRESHOLDS },
    source_provenance: input.source_provenance,
    coverage: input.coverage,
    metrics: {
      by_prediction_type: byPredictionType,
      by_model_version: byModelVersion,
      by_fitted_state: byFittedState,
      by_season: bySeason,
      by_cohort: byCohort,
    },
  };
}
