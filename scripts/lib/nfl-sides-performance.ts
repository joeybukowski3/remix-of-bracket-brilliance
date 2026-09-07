/**
 * WU6 -- pure join/metrics core for the NFL sides (spread) performance
 * artifact (public/data/nfl/performance/sides.json).
 *
 * Error convention matches the rest of the evaluation pipeline
 * (nfl-prediction-outcome-resolver.ts's spreadDerived): every signed error
 * is `projection - actual`, both expressed as a HOME margin (home points -
 * away points). Positive `signed_margin_error` means JKB projected the home
 * team to do better than it actually did.
 *
 * This module contains NO file I/O and NO model math. It composes:
 *  - archived `spread` prediction snapshots from the live side model
 *    (jkb-power-number-v1.0.0), already produced by the power-number
 *    generator / archive,
 *  - already-resolved actual outcomes (produced by the canonical
 *    resolvePredictionOutcome() in nfl-prediction-outcome-resolver.ts),
 *  - one canonical pregame comparison spread observation, selected from the
 *    prediction's own embedded `market_snapshot_refs`,
 *  - pregame context (nfl-game-context.ts, the WU3 shared module).
 *
 * It never re-derives an actual score, never re-implements outcome grading
 * beyond the ATS bookkeeping that is already duplicated verbatim in
 * nfl-evaluation-rows.ts, and never touches the side-model math.
 */
import { absPointBucket } from "./nfl-evaluation-cohorts";
import type { PregameGameContext } from "./nfl-game-context";

export const SIDES_LIVE_MODEL_VERSION = "jkb-power-number-v1.0.0" as const;

/** Absolute market-spread magnitude boundaries (field goal / touchdown / two scores). */
export const MARKET_SPREAD_BUCKET_BOUNDARIES = Object.freeze([3, 7, 10]);

/** JKB-vs-market home-margin difference boundaries -- matches the WU6 spec's <1 / 1-2 / 2-3 / 3-4 / 4+. */
export const JKB_MARKET_DIFF_BUCKET_BOUNDARIES = Object.freeze([1, 2, 3, 4]);

// -------------------------------------------------------------------------
// Snapshot selection
// -------------------------------------------------------------------------

export type SpreadSnapshot = {
  gameId: string;
  season: number;
  week: number;
  kickoffUtc: string;
  homeTeam: string;
  awayTeam: string;
  projectedHomeMargin: number;
  projectedSpreadLine: number;
  projectedSpreadTeam: string | null;
  homePowerNumber: number | null;
  awayPowerNumber: number | null;
  homeFieldAdjustment: number | null;
  modelVersion: string;
  fittedModelHash: string | null;
  predictionTimestamp: string;
  predictionId: string;
};

export type SpreadSnapshotSelectionResult =
  | { status: "selected"; snapshot: SpreadSnapshot }
  | { status: "rejected"; reason: "missing" | "model_version_mismatch" };

function latestByPredictionTimestamp(rows: readonly SpreadSnapshot[]): SpreadSnapshot {
  return rows.reduce((latest, row) => (row.predictionTimestamp > latest.predictionTimestamp ? row : latest));
}

/**
 * Selects the canonical pregame spread snapshot for one game: the
 * latest-by-`predictionTimestamp` row, requiring the live side model
 * identity (`jkb-power-number-v1.0.0`). Never averages snapshots and never
 * considers a post-kickoff revision -- the archive validator already
 * rejects `prediction_timestamp >= kickoff_utc` for production rows, so
 * every archived row here is already pregame.
 */
export function selectPregameSpreadSnapshot(
  rows: readonly SpreadSnapshot[],
  expectedModelVersion: string = SIDES_LIVE_MODEL_VERSION
): SpreadSnapshotSelectionResult {
  if (rows.length === 0) return { status: "rejected", reason: "missing" };
  const snapshot = latestByPredictionTimestamp(rows);
  if (snapshot.modelVersion !== expectedModelVersion) {
    return { status: "rejected", reason: "model_version_mismatch" };
  }
  return { status: "selected", snapshot };
}

// -------------------------------------------------------------------------
// Market spread selection
// -------------------------------------------------------------------------

export type RawSpreadMarketRef = {
  market_type: string;
  purpose: string;
  line: number | null;
  observed_at: string;
  provider: string;
  sportsbook: string;
  content_hash: string | null;
  market_observation_id: string | null;
};

export type MarketSpreadObservation = {
  /** The home team's spread line as posted (negative = home favored). */
  marketHomeLine: number;
  /** `-marketHomeLine`: the margin the market implies the home team wins by. */
  marketImpliedHomeMargin: number;
  marketTimestamp: string;
  provider: string;
  sportsbook: string;
  snapshotRef: string;
  marketObservationId: string | null;
  selectionRule: "latest_valid_pregame_comparison_line";
};

const SPORTSBOOK_PRIORITY = ["draftkings", "fanduel", "betmgm", "caesars"] as const;

/**
 * Selects one canonical comparison spread from a prediction's embedded
 * `market_snapshot_refs`: among spread/comparison refs observed strictly
 * before kickoff (a post-kickoff line is never eligible), take the
 * highest-priority sportsbook present, then that book's latest-by-observed_at
 * row. Never mixes books, never chooses a line after seeing the result.
 */
export function selectCanonicalMarketSpread(
  refs: readonly RawSpreadMarketRef[],
  kickoffUtc: string
): MarketSpreadObservation | null {
  const pregame = refs.filter(
    (ref) =>
      ref.market_type === "spread" &&
      ref.purpose === "comparison" &&
      ref.line != null &&
      Number.isFinite(ref.line) &&
      ref.observed_at < kickoffUtc
  );
  if (pregame.length === 0) return null;

  const bySportsbook = new Map<string, RawSpreadMarketRef>();
  for (const ref of pregame) {
    const current = bySportsbook.get(ref.sportsbook);
    if (!current || ref.observed_at > current.observed_at) bySportsbook.set(ref.sportsbook, ref);
  }

  let selected: RawSpreadMarketRef | null = null;
  for (const book of SPORTSBOOK_PRIORITY) {
    const candidate = bySportsbook.get(book);
    if (candidate) {
      selected = candidate;
      break;
    }
  }
  if (!selected) {
    selected = [...bySportsbook.values()].sort((a, b) => a.sportsbook.localeCompare(b.sportsbook))[0] ?? null;
  }
  if (!selected || selected.line == null) return null;

  return {
    marketHomeLine: selected.line,
    marketImpliedHomeMargin: -selected.line,
    marketTimestamp: selected.observed_at,
    provider: selected.provider,
    sportsbook: selected.sportsbook,
    snapshotRef: selected.content_hash ?? `${selected.sportsbook}:${selected.observed_at}`,
    marketObservationId: selected.market_observation_id,
    selectionRule: "latest_valid_pregame_comparison_line",
  };
}

// -------------------------------------------------------------------------
// Orientation / ATS grading (identical bookkeeping to nfl-evaluation-rows.ts)
// -------------------------------------------------------------------------

export type AtsSide = "home" | "away" | "pick";
export type AtsResult = "WIN" | "LOSS" | "PUSH" | "NEUTRAL";

export function marginDirection(value: number): "home" | "away" | "pick" {
  return value > 0 ? "home" : value < 0 ? "away" : "pick";
}

/** Which side JKB prefers ATS relative to the market's implied home margin. */
export function computeJkbAtsSide(projectedHomeMargin: number, marketImpliedHomeMargin: number | null): AtsSide | null {
  if (marketImpliedHomeMargin == null) return null;
  if (projectedHomeMargin > marketImpliedHomeMargin) return "home";
  if (projectedHomeMargin < marketImpliedHomeMargin) return "away";
  return "pick";
}

/**
 * ATS result for JKB's chosen side. `homeCoverMargin = actualHomeMargin +
 * marketHomeLine` (> 0 means the home team covered). PUSH when it lands on
 * the number; NEUTRAL when JKB has no ATS lean (pick) or there is no market.
 */
export function computeAtsResult(
  jkbSide: AtsSide | null,
  actualHomeMargin: number | null,
  marketHomeLine: number | null
): AtsResult | null {
  if (jkbSide == null || actualHomeMargin == null || marketHomeLine == null) return null;
  if (jkbSide === "pick") return "NEUTRAL";
  const homeCoverMargin = actualHomeMargin + marketHomeLine;
  if (homeCoverMargin === 0) return "PUSH";
  const homeCovered = homeCoverMargin > 0;
  return homeCovered === (jkbSide === "home") ? "WIN" : "LOSS";
}

/**
 * favorite/underdog classification of the team JKB backs ATS: look up that
 * team's own market line (home line, or its negation for the away team) --
 * negative = favorite, positive = underdog.
 */
export function computeFavoriteUnderdog(
  jkbSide: AtsSide | null,
  marketHomeLine: number | null
): "favorite" | "underdog" | "pick" | null {
  if (jkbSide == null || jkbSide === "pick" || marketHomeLine == null) return null;
  const backedTeamLine = jkbSide === "home" ? marketHomeLine : -marketHomeLine;
  if (backedTeamLine < 0) return "favorite";
  if (backedTeamLine > 0) return "underdog";
  return "pick";
}

// -------------------------------------------------------------------------
// Row builder
// -------------------------------------------------------------------------

export type ResolvedSpreadActual = {
  homePoints: number;
  awayPoints: number;
  homeMargin: number;
  gameCompletionStatus: "final" | "not_final" | "missing";
  resolutionStatus: string;
};

export type SidesPerformanceRow = {
  // IDENTITY
  season: number;
  week: number;
  game_id: string;
  kickoff_time: string;
  away_team: string;
  home_team: string;
  // JKB PROJECTION
  projected_home_margin: number;
  projected_spread_line: number;
  projected_spread_team: string | null;
  home_power_number: number | null;
  away_power_number: number | null;
  home_field_adjustment: number | null;
  model_version: string;
  fitted_model_hash: string | null;
  prediction_timestamp: string;
  // MARKET
  market_spread: number | null;
  market_implied_home_margin: number | null;
  market_team_orientation: "home_line";
  market_provider: string | null;
  market_snapshot_timestamp: string | null;
  market_snapshot_ref: string | null;
  market_observation_id: string | null;
  jkb_minus_market: number | null;
  // ACTUAL
  actual_home_points: number;
  actual_away_points: number;
  actual_margin: number;
  game_completion_status: "final" | "not_final" | "missing";
  resolution_status: string;
  // ERROR (projection - actual, both home margin)
  signed_margin_error: number;
  absolute_margin_error: number;
  squared_margin_error: number;
  // DIRECTION
  jkb_ats_side: AtsSide | null;
  jkb_supports_team: string | null;
  projected_winner: "home" | "away" | "pick";
  actual_winner: "home" | "away" | "pick";
  projected_winner_correct: boolean;
  // RESULT
  ats_result: AtsResult | null;
  // BUCKETS
  jkb_market_difference_bucket: string | null;
  market_spread_bucket: string | null;
  favorite_underdog: "favorite" | "underdog" | "pick" | null;
  // CONTEXT
  context: PregameGameContext;
  // PROVENANCE
  provenance: {
    prediction_id_ref: string;
    market_snapshot_ref: string | null;
    market_observation_id: string | null;
    outcome_source_state_hash: string | null;
  };
};

export function buildSidesPerformanceRow(input: {
  snapshot: SpreadSnapshot;
  actual: ResolvedSpreadActual;
  market: MarketSpreadObservation | null;
  context: PregameGameContext;
  outcomeSourceStateHash: string | null;
}): SidesPerformanceRow {
  const { snapshot, actual, market, context } = input;
  const projectedHomeMargin = snapshot.projectedHomeMargin;
  const marketImpliedHomeMargin = market?.marketImpliedHomeMargin ?? null;
  const marketHomeLine = market?.marketHomeLine ?? null;
  const jkbMinusMarket = marketImpliedHomeMargin != null ? projectedHomeMargin - marketImpliedHomeMargin : null;
  const signedMarginError = projectedHomeMargin - actual.homeMargin;

  const jkbAtsSide = computeJkbAtsSide(projectedHomeMargin, marketImpliedHomeMargin);
  const jkbSupportsTeam =
    jkbAtsSide == null || jkbAtsSide === "pick"
      ? null
      : jkbAtsSide === "home"
        ? snapshot.homeTeam
        : snapshot.awayTeam;
  const projectedWinner = marginDirection(projectedHomeMargin);
  const actualWinner = marginDirection(actual.homeMargin);

  return {
    season: snapshot.season,
    week: snapshot.week,
    game_id: snapshot.gameId,
    kickoff_time: snapshot.kickoffUtc,
    away_team: snapshot.awayTeam,
    home_team: snapshot.homeTeam,

    projected_home_margin: projectedHomeMargin,
    projected_spread_line: snapshot.projectedSpreadLine,
    projected_spread_team: snapshot.projectedSpreadTeam,
    home_power_number: snapshot.homePowerNumber,
    away_power_number: snapshot.awayPowerNumber,
    home_field_adjustment: snapshot.homeFieldAdjustment,
    model_version: snapshot.modelVersion,
    fitted_model_hash: snapshot.fittedModelHash,
    prediction_timestamp: snapshot.predictionTimestamp,

    market_spread: marketHomeLine,
    market_implied_home_margin: marketImpliedHomeMargin,
    market_team_orientation: "home_line",
    market_provider: market ? `${market.provider}/${market.sportsbook}` : null,
    market_snapshot_timestamp: market?.marketTimestamp ?? null,
    market_snapshot_ref: market?.snapshotRef ?? null,
    market_observation_id: market?.marketObservationId ?? null,
    jkb_minus_market: jkbMinusMarket,

    actual_home_points: actual.homePoints,
    actual_away_points: actual.awayPoints,
    actual_margin: actual.homeMargin,
    game_completion_status: actual.gameCompletionStatus,
    resolution_status: actual.resolutionStatus,

    signed_margin_error: signedMarginError,
    absolute_margin_error: Math.abs(signedMarginError),
    squared_margin_error: signedMarginError ** 2,

    jkb_ats_side: jkbAtsSide,
    jkb_supports_team: jkbSupportsTeam,
    projected_winner: projectedWinner,
    actual_winner: actualWinner,
    projected_winner_correct: projectedWinner === actualWinner,

    ats_result: computeAtsResult(jkbAtsSide, actual.homeMargin, marketHomeLine),

    jkb_market_difference_bucket: absPointBucket(jkbMinusMarket, JKB_MARKET_DIFF_BUCKET_BOUNDARIES),
    market_spread_bucket: absPointBucket(marketHomeLine, MARKET_SPREAD_BUCKET_BOUNDARIES),
    favorite_underdog: computeFavoriteUnderdog(jkbAtsSide, marketHomeLine),

    context,

    provenance: {
      prediction_id_ref: snapshot.predictionId,
      market_snapshot_ref: market?.snapshotRef ?? null,
      market_observation_id: market?.marketObservationId ?? null,
      outcome_source_state_hash: input.outcomeSourceStateHash,
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

export type SidesMarketComparison = {
  comparable_n: number;
  jkb_mae: number | null;
  market_mae: number | null;
  jkb_minus_market_mae: number | null;
};

export type SidesSummaryMetrics = {
  graded_games: number;
  margin_mae: number | null;
  margin_rmse: number | null;
  margin_median_absolute_error: number | null;
  mean_signed_error: number | null;
  correlation_projected_actual_margin: number | null;
  directional_wins: number;
  directional_losses: number;
  directional_pushes: number;
  directional_neutral: number;
  ats_directional_hit_rate: number | null;
  average_abs_jkb_market_difference: number | null;
  winner_accuracy: { correct: number; total: number; accuracy: number | null };
  market_comparison: SidesMarketComparison;
};

export function computeSidesSummaryMetrics(rows: readonly SidesPerformanceRow[]): SidesSummaryMetrics {
  const absErrors = rows.map((r) => r.absolute_margin_error);
  const signedErrors = rows.map((r) => r.signed_margin_error);
  const projected = rows.map((r) => r.projected_home_margin);
  const actual = rows.map((r) => r.actual_margin);
  const marketDiffs = rows.map((r) => r.jkb_minus_market).filter((v): v is number => v != null);

  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let neutral = 0;
  for (const row of rows) {
    if (row.ats_result === "WIN") wins += 1;
    else if (row.ats_result === "LOSS") losses += 1;
    else if (row.ats_result === "PUSH") pushes += 1;
    else if (row.ats_result === "NEUTRAL") neutral += 1;
  }

  const winnerCorrect = rows.filter((r) => r.projected_winner_correct).length;

  const comparable = rows.filter((r) => r.market_implied_home_margin != null);
  const jkbErr = comparable.map((r) => r.absolute_margin_error);
  const mktErr = comparable.map((r) => Math.abs((r.market_implied_home_margin as number) - r.actual_margin));

  return {
    graded_games: rows.length,
    margin_mae: mean(absErrors),
    margin_rmse: signedErrors.length === 0 ? null : Math.sqrt(mean(signedErrors.map((e) => e ** 2)) as number),
    margin_median_absolute_error: median(absErrors),
    mean_signed_error: mean(signedErrors),
    correlation_projected_actual_margin: pearson(projected, actual),
    directional_wins: wins,
    directional_losses: losses,
    directional_pushes: pushes,
    directional_neutral: neutral,
    ats_directional_hit_rate: wins + losses === 0 ? null : wins / (wins + losses),
    average_abs_jkb_market_difference: marketDiffs.length === 0 ? null : mean(marketDiffs.map((v) => Math.abs(v))),
    winner_accuracy: {
      correct: winnerCorrect,
      total: rows.length,
      accuracy: rows.length === 0 ? null : winnerCorrect / rows.length,
    },
    market_comparison: {
      comparable_n: comparable.length,
      jkb_mae: mean(jkbErr),
      market_mae: mean(mktErr),
      jkb_minus_market_mae:
        comparable.length === 0 ? null : (mean(jkbErr) as number) - (mean(mktErr) as number),
    },
  };
}

// -------------------------------------------------------------------------
// Bucket / segmentation rollups
// -------------------------------------------------------------------------

export type SidesBucketRollup = {
  key: string;
  n: number;
  mae: number | null;
  bias: number | null;
  directional_wins: number;
  directional_losses: number;
  directional_pushes: number;
  hit_rate: number | null;
};

function rollupGroup(key: string, rows: readonly SidesPerformanceRow[]): SidesBucketRollup {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  for (const row of rows) {
    if (row.ats_result === "WIN") wins += 1;
    else if (row.ats_result === "LOSS") losses += 1;
    else if (row.ats_result === "PUSH") pushes += 1;
  }
  return {
    key,
    n: rows.length,
    mae: mean(rows.map((r) => r.absolute_margin_error)),
    bias: mean(rows.map((r) => r.signed_margin_error)),
    directional_wins: wins,
    directional_losses: losses,
    directional_pushes: pushes,
    hit_rate: wins + losses === 0 ? null : wins / (wins + losses),
  };
}

function groupBy<T>(
  rows: readonly SidesPerformanceRow[],
  keyOf: (row: SidesPerformanceRow) => T | null
): Map<T, SidesPerformanceRow[]> {
  const map = new Map<T, SidesPerformanceRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

export type SidesBucketRollups = {
  by_week: SidesBucketRollup[];
  by_jkb_market_difference_bucket: SidesBucketRollup[];
  by_market_spread_bucket: SidesBucketRollup[];
  by_favorite_underdog: SidesBucketRollup[];
  by_jkb_ats_side: SidesBucketRollup[];
};

export function computeSidesBucketRollups(rows: readonly SidesPerformanceRow[]): SidesBucketRollups {
  const byWeek = groupBy(rows, (r) => r.week);
  const byDiff = groupBy(rows, (r) => r.jkb_market_difference_bucket);
  const bySpread = groupBy(rows, (r) => r.market_spread_bucket);
  const byFavDog = groupBy(rows, (r) => r.favorite_underdog);
  const bySide = groupBy(rows, (r) => r.jkb_ats_side);

  return {
    by_week: [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, groupRows]) => rollupGroup(String(week), groupRows)),
    by_jkb_market_difference_bucket: [...byDiff.entries()].map(([b, r]) => rollupGroup(b, r)),
    by_market_spread_bucket: [...bySpread.entries()].map(([b, r]) => rollupGroup(b, r)),
    by_favorite_underdog: [...byFavDog.entries()].map(([b, r]) => rollupGroup(b, r)),
    by_jkb_ats_side: [...bySide.entries()].map(([b, r]) => rollupGroup(b, r)),
  };
}
