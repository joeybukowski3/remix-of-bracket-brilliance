/**
 * WU3 — pure join/metrics core for the NFL totals performance artifact
 * (public/data/nfl/performance/totals.json).
 *
 * Error convention matches the rest of the evaluation pipeline
 * (nfl-prediction-outcome-resolver.ts's TeamTotalDerived doc comment):
 * every signed error is `projection - actual`. Positive means JKB
 * over-projected.
 *
 * This module contains NO file I/O and NO model math. It composes:
 *  - archived team_total prediction snapshots (already produced by the
 *    totals model / archive),
 *  - already-resolved actual outcomes (produced by the canonical
 *    resolvePredictionOutcome() in nfl-prediction-outcome-resolver.ts),
 *  - a market total observation (produced by the betting-lines pipeline),
 *  - pregame context (nfl-game-context.ts).
 * It never re-derives an actual score or re-implements outcome grading.
 */
import { totalBucket, absPointBucket } from "./nfl-evaluation-cohorts";
import type { PregameGameContext } from "./nfl-game-context";

export type TeamTotalSnapshotSide = {
  gameId: string;
  season: number;
  week: number;
  kickoffUtc: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  projectedTeamPoints: number;
  modelVersion: string;
  fittedModelHash: string | null;
  predictionTimestamp: string;
};

export type SnapshotSelectionResult =
  | { status: "selected"; home: TeamTotalSnapshotSide; away: TeamTotalSnapshotSide }
  | {
      status: "rejected";
      reason: "missing_home" | "missing_away" | "model_version_mismatch" | "fitted_hash_mismatch";
    };

function latestByPredictionTimestamp(rows: readonly TeamTotalSnapshotSide[]): TeamTotalSnapshotSide {
  return rows.reduce((latest, row) => (row.predictionTimestamp > latest.predictionTimestamp ? row : latest));
}

/**
 * Selects the canonical pregame snapshot pair for one game: the
 * latest-by-`predictionTimestamp` row on each side, requiring both sides to
 * agree on `modelVersion` and a non-null `fittedModelHash`. Does not
 * average snapshots and never considers a post-kickoff revision (the
 * archive validator already rejects `prediction_timestamp >= kickoff_utc`
 * for production-mode rows, so every archived row here is already pregame).
 */
export function selectPregameSnapshotPair(
  homeRows: readonly TeamTotalSnapshotSide[],
  awayRows: readonly TeamTotalSnapshotSide[]
): SnapshotSelectionResult {
  if (homeRows.length === 0) return { status: "rejected", reason: "missing_home" };
  if (awayRows.length === 0) return { status: "rejected", reason: "missing_away" };
  const home = latestByPredictionTimestamp(homeRows);
  const away = latestByPredictionTimestamp(awayRows);
  if (home.modelVersion !== away.modelVersion) return { status: "rejected", reason: "model_version_mismatch" };
  if (home.fittedModelHash == null || home.fittedModelHash !== away.fittedModelHash) {
    return { status: "rejected", reason: "fitted_hash_mismatch" };
  }
  return { status: "selected", home, away };
}

export type ResolvedTeamTotalActual = {
  teamPoints: number;
  opponentPoints: number;
  gameCompletionStatus: "final" | "not_final" | "missing";
  resolutionStatus: string;
};

export type MarketTotalObservation = {
  marketTotal: number;
  marketTimestamp: string;
  provider: string;
  sportsbook: string;
  snapshotRef: string;
  selectionRule: "latest_valid_pregame_snapshot";
};

export type MarketDirection = "JKB_OVER" | "JKB_UNDER" | "NEUTRAL";
export type MarketOutcomeLabel = "OVER" | "UNDER" | "PUSH";
export type DirectionalResult = "WIN" | "LOSS" | "PUSH" | "NEUTRAL";

export function computeMarketDirection(projectedGameTotal: number, marketTotal: number | null): MarketDirection | null {
  if (marketTotal == null) return null;
  if (projectedGameTotal > marketTotal) return "JKB_OVER";
  if (projectedGameTotal < marketTotal) return "JKB_UNDER";
  return "NEUTRAL";
}

export function computeMarketOutcome(actualGameTotal: number, marketTotal: number | null): MarketOutcomeLabel | null {
  if (marketTotal == null) return null;
  if (actualGameTotal > marketTotal) return "OVER";
  if (actualGameTotal < marketTotal) return "UNDER";
  return "PUSH";
}

export function computeDirectionalResult(
  direction: MarketDirection | null,
  outcome: MarketOutcomeLabel | null
): DirectionalResult | null {
  if (direction == null || outcome == null) return null;
  if (outcome === "PUSH") return "PUSH";
  if (direction === "NEUTRAL") return "NEUTRAL";
  const jkbSide: MarketOutcomeLabel = direction === "JKB_OVER" ? "OVER" : "UNDER";
  return jkbSide === outcome ? "WIN" : "LOSS";
}

export type TotalsPerformanceRow = {
  // IDENTITY
  season: number;
  week: number;
  game_id: string;
  kickoff_time: string;
  away_team: string;
  home_team: string;
  // JKB PROJECTION
  away_expected_points: number;
  home_expected_points: number;
  projected_game_total: number;
  model_version: string;
  fitted_model_hash: string;
  prediction_timestamp: string;
  // ACTUAL
  actual_away_points: number;
  actual_home_points: number;
  actual_game_total: number;
  game_completion_status: "final" | "not_final" | "missing";
  resolution_status: string;
  // ERROR (projection - actual)
  signed_total_error: number;
  absolute_total_error: number;
  squared_total_error: number;
  away_team_signed_error: number;
  home_team_signed_error: number;
  away_team_absolute_error: number;
  home_team_absolute_error: number;
  // MARKET
  market_total: number | null;
  market_timestamp: string | null;
  market_provider: string | null;
  market_snapshot_ref: string | null;
  jkb_minus_market: number | null;
  // DIRECTION / OUTCOME
  jkb_market_direction: MarketDirection | null;
  market_outcome: MarketOutcomeLabel | null;
  directional_result: DirectionalResult | null;
  // BUCKETS
  projected_total_bucket: string | null;
  jkb_market_difference_bucket: string | null;
  // CONTEXT
  context: PregameGameContext;
  // PROVENANCE
  provenance: {
    home_prediction_id_ref: string;
    away_prediction_id_ref: string;
  };
};

export function buildTotalsPerformanceRow(input: {
  snapshots: { home: TeamTotalSnapshotSide; away: TeamTotalSnapshotSide };
  homeActual: ResolvedTeamTotalActual;
  awayActual: ResolvedTeamTotalActual;
  market: MarketTotalObservation | null;
  context: PregameGameContext;
  homePredictionIdRef: string;
  awayPredictionIdRef: string;
}): TotalsPerformanceRow {
  const { snapshots, homeActual, awayActual, market, context } = input;
  const projectedGameTotal = snapshots.home.projectedTeamPoints + snapshots.away.projectedTeamPoints;
  const actualGameTotal = homeActual.teamPoints + awayActual.teamPoints;
  const signedTotalError = projectedGameTotal - actualGameTotal;
  const homeSignedError = snapshots.home.projectedTeamPoints - homeActual.teamPoints;
  const awaySignedError = snapshots.away.projectedTeamPoints - awayActual.teamPoints;
  const marketTotal = market?.marketTotal ?? null;
  const jkbMinusMarket = marketTotal != null ? projectedGameTotal - marketTotal : null;
  const direction = computeMarketDirection(projectedGameTotal, marketTotal);
  const outcome = computeMarketOutcome(actualGameTotal, marketTotal);

  return {
    season: snapshots.home.season,
    week: snapshots.home.week,
    game_id: snapshots.home.gameId,
    kickoff_time: snapshots.home.kickoffUtc,
    away_team: snapshots.away.team,
    home_team: snapshots.home.team,

    away_expected_points: snapshots.away.projectedTeamPoints,
    home_expected_points: snapshots.home.projectedTeamPoints,
    projected_game_total: projectedGameTotal,
    model_version: snapshots.home.modelVersion,
    fitted_model_hash: snapshots.home.fittedModelHash as string,
    prediction_timestamp:
      snapshots.home.predictionTimestamp > snapshots.away.predictionTimestamp
        ? snapshots.home.predictionTimestamp
        : snapshots.away.predictionTimestamp,

    actual_away_points: awayActual.teamPoints,
    actual_home_points: homeActual.teamPoints,
    actual_game_total: actualGameTotal,
    game_completion_status: homeActual.gameCompletionStatus,
    resolution_status: homeActual.resolutionStatus,

    signed_total_error: signedTotalError,
    absolute_total_error: Math.abs(signedTotalError),
    squared_total_error: signedTotalError ** 2,
    away_team_signed_error: awaySignedError,
    home_team_signed_error: homeSignedError,
    away_team_absolute_error: Math.abs(awaySignedError),
    home_team_absolute_error: Math.abs(homeSignedError),

    market_total: marketTotal,
    market_timestamp: market?.marketTimestamp ?? null,
    market_provider: market ? `${market.provider}/${market.sportsbook}` : null,
    market_snapshot_ref: market?.snapshotRef ?? null,
    jkb_minus_market: jkbMinusMarket,

    jkb_market_direction: direction,
    market_outcome: outcome,
    directional_result: computeDirectionalResult(direction, outcome),

    projected_total_bucket: totalBucket(projectedGameTotal, [40, 45, 50]),
    jkb_market_difference_bucket: absPointBucket(jkbMinusMarket, [1, 2, 3, 4]),

    context,

    provenance: {
      home_prediction_id_ref: input.homePredictionIdRef,
      away_prediction_id_ref: input.awayPredictionIdRef,
    },
  };
}

// -------------------------------------------------------------------------
// Summary metrics
// -------------------------------------------------------------------------

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pearson(x: readonly number[], y: readonly number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  const mx = mean(x.slice(0, n)) as number;
  const my = mean(y.slice(0, n)) as number;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

export type TotalsSummaryMetrics = {
  graded_games: number;
  game_total_mae: number | null;
  game_total_rmse: number | null;
  game_total_median_absolute_error: number | null;
  mean_signed_error: number | null;
  correlation_projected_actual: number | null;
  team_score_mae: number | null;
  team_score_rmse: number | null;
  directional_wins: number;
  directional_losses: number;
  directional_pushes: number;
  directional_neutral: number;
  directional_hit_rate: number | null;
  average_abs_jkb_market_difference: number | null;
};

export function computeSummaryMetrics(rows: readonly TotalsPerformanceRow[]): TotalsSummaryMetrics {
  const totalAbsErrors = rows.map((r) => r.absolute_total_error);
  const totalSignedErrors = rows.map((r) => r.signed_total_error);
  const teamAbsErrors = rows.flatMap((r) => [r.home_team_absolute_error, r.away_team_absolute_error]);
  const projected = rows.map((r) => r.projected_game_total);
  const actual = rows.map((r) => r.actual_game_total);
  const marketDiffs = rows.map((r) => r.jkb_minus_market).filter((v): v is number => v != null);

  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let neutral = 0;
  for (const row of rows) {
    if (row.directional_result === "WIN") wins += 1;
    else if (row.directional_result === "LOSS") losses += 1;
    else if (row.directional_result === "PUSH") pushes += 1;
    else if (row.directional_result === "NEUTRAL") neutral += 1;
  }

  return {
    graded_games: rows.length,
    game_total_mae: mean(totalAbsErrors),
    game_total_rmse:
      totalSignedErrors.length === 0 ? null : Math.sqrt(mean(totalSignedErrors.map((e) => e ** 2)) as number),
    game_total_median_absolute_error: median(totalAbsErrors),
    mean_signed_error: mean(totalSignedErrors),
    correlation_projected_actual: pearson(projected, actual),
    team_score_mae: mean(teamAbsErrors),
    team_score_rmse: teamAbsErrors.length === 0 ? null : Math.sqrt(mean(teamAbsErrors.map((e) => e ** 2)) as number),
    directional_wins: wins,
    directional_losses: losses,
    directional_pushes: pushes,
    directional_neutral: neutral,
    directional_hit_rate: wins + losses === 0 ? null : wins / (wins + losses),
    average_abs_jkb_market_difference: marketDiffs.length === 0 ? null : mean(marketDiffs.map((v) => Math.abs(v))),
  };
}

// -------------------------------------------------------------------------
// Bucket / segmentation rollups
// -------------------------------------------------------------------------

export type BucketRollup = {
  key: string;
  n: number;
  mae: number | null;
  bias: number | null;
  directional_wins: number;
  directional_losses: number;
  directional_pushes: number;
  hit_rate: number | null;
};

function rollupGroup(key: string, rows: readonly TotalsPerformanceRow[]): BucketRollup {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  for (const row of rows) {
    if (row.directional_result === "WIN") wins += 1;
    else if (row.directional_result === "LOSS") losses += 1;
    else if (row.directional_result === "PUSH") pushes += 1;
  }
  return {
    key,
    n: rows.length,
    mae: mean(rows.map((r) => r.absolute_total_error)),
    bias: mean(rows.map((r) => r.signed_total_error)),
    directional_wins: wins,
    directional_losses: losses,
    directional_pushes: pushes,
    hit_rate: wins + losses === 0 ? null : wins / (wins + losses),
  };
}

function groupBy<T>(rows: readonly TotalsPerformanceRow[], keyOf: (row: TotalsPerformanceRow) => T | null): Map<T, TotalsPerformanceRow[]> {
  const map = new Map<T, TotalsPerformanceRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

export type TotalsBucketRollups = {
  by_week: BucketRollup[];
  by_projected_total_bucket: BucketRollup[];
  by_jkb_market_difference_bucket: BucketRollup[];
};

export function computeBucketRollups(rows: readonly TotalsPerformanceRow[]): TotalsBucketRollups {
  const byWeek = groupBy(rows, (r) => r.week);
  const byProjectedBucket = groupBy(rows, (r) => r.projected_total_bucket);
  const byMarketDiffBucket = groupBy(rows, (r) => r.jkb_market_difference_bucket);

  return {
    by_week: [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, groupRows]) => rollupGroup(String(week), groupRows)),
    by_projected_total_bucket: [...byProjectedBucket.entries()].map(([bucket, groupRows]) => rollupGroup(bucket, groupRows)),
    by_jkb_market_difference_bucket: [...byMarketDiffBucket.entries()].map(([bucket, groupRows]) => rollupGroup(bucket, groupRows)),
  };
}
