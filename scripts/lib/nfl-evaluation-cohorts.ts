/**
 * WU3 diagnostic cohort derivation. Every field here is computed from
 * prediction-time information only (archived projection, archived market
 * observation, archived feature snapshot). No postgame/outcome value is ever
 * read into a cohort field.
 *
 * Edge buckets are descriptive diagnostic cohorts, not tuned betting
 * thresholds. Player-market edge widths are reused verbatim from the Phase
 * 11A research bucketer so the two research layers stay comparable; spread
 * point buckets follow EVALUATION_STANDARDS' magnitude-split intent and the
 * WU3 spec's <1 / 1-2 / 2-3 / 3-4 / 4+ example.
 */
import type { JsonValue } from "./nfl-production-prediction-archive";
import { bucketizeEdge } from "./nfl-research-buckets.mjs";
import type { EvaluationPredictionType, PlayerMarketEvaluation } from "./nfl-evaluation-dataset";

/** Absolute-value point boundaries for spread edge / power-rating-diff cohorts. */
export const SPREAD_ABS_BUCKET_BOUNDARIES = Object.freeze([1, 2, 3, 4]);

export function absPointBucket(value: number | null, boundaries: readonly number[] = SPREAD_ABS_BUCKET_BOUNDARIES): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const magnitude = Math.abs(value);
  for (let index = 0; index < boundaries.length; index += 1) {
    if (magnitude < boundaries[index]) {
      return index === 0 ? `<${boundaries[0]}` : `${boundaries[index - 1]}-${boundaries[index]}`;
    }
  }
  return `${boundaries[boundaries.length - 1]}+`;
}

/** Deterministic non-negative-count bucket for projected volume cohorts. */
export function volumeBucket(value: number | null, width: number): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const low = Math.floor(value / width) * width;
  return `${low}-${low + width}`;
}

export function weekBand(week: number): string {
  if (week <= 4) return "1-4";
  if (week <= 9) return "5-9";
  if (week <= 14) return "10-14";
  return "15-18+";
}

function marginSide(margin: number, favoriteLabel: string, underdogLabel: string): string {
  if (margin > 0) return favoriteLabel;
  if (margin < 0) return underdogLabel;
  return "pick";
}

export type CohortContext = {
  season: number;
  week: number;
  home_away: "home" | "away";
  neutral_site: boolean;
  position: "QB" | "RB" | "WR" | "TE" | null;
  status: string;
  division_game: boolean | null;
};

const PLAYER_EDGE_MARKET: Record<Exclude<EvaluationPredictionType, "spread">, "passing" | "rushing" | "receiving"> = {
  passing: "passing",
  rushing: "rushing",
  receiving: "receiving",
};

const PLAYER_VOLUME_WIDTH: Record<Exclude<EvaluationPredictionType, "spread">, number> = {
  passing: 5, // attempts
  rushing: 4, // carries
  receiving: 2, // targets
};

/**
 * Candidate diagnostic features that are NOT guaranteed to exist in every
 * archived snapshot today (offensive line / trench, rest, target share,
 * committee concentration, ...). They are passed through as cohort fields
 * ONLY when the archived feature snapshot actually carries them, and are
 * documented as future/candidate cohorts rather than current ones.
 */
export const CANDIDATE_COHORT_FEATURE_KEYS = Object.freeze([
  "rest_differential",
  "home_rest_days",
  "away_rest_days",
  "rest_days",
  "target_share",
  "carry_share",
  "committee_concentration",
  "target_concentration",
  "role_certainty",
  "depth_chart_rank",
  "starter_flag",
  "ol_pass_block_win_rate",
  "ol_run_block_win_rate",
  "opponent_run_defense_rank",
  "opponent_pass_defense_rank",
]);

function conditionalCandidateCohorts(values: Record<string, JsonValue>): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const key of CANDIDATE_COHORT_FEATURE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key] != null) {
      out[`candidate__${key}`] = values[key];
    }
  }
  return out;
}

export function deriveSpreadCohorts(input: {
  context: CohortContext;
  projectedHomeMargin: number;
  homePowerNumber: number | null;
  awayPowerNumber: number | null;
  primaryMarketImpliedHomeMargin: number | null;
  primaryJkbVsMarketEdge: number | null;
  featureValues: Record<string, JsonValue>;
}): Record<string, JsonValue> {
  const jkbHomeSide = marginSide(input.projectedHomeMargin, "favorite", "underdog");
  const marketHomeSide =
    input.primaryMarketImpliedHomeMargin == null
      ? null
      : marginSide(input.primaryMarketImpliedHomeMargin, "favorite", "underdog");
  const agrees =
    input.primaryMarketImpliedHomeMargin == null
      ? null
      : Math.sign(input.projectedHomeMargin) === Math.sign(input.primaryMarketImpliedHomeMargin) ||
        (input.projectedHomeMargin === 0 && input.primaryMarketImpliedHomeMargin === 0);
  const powerDiff =
    input.homePowerNumber != null && input.awayPowerNumber != null
      ? input.homePowerNumber - input.awayPowerNumber
      : null;
  return {
    week_band: weekBand(input.context.week),
    division_game: input.context.division_game,
    neutral_site: input.context.neutral_site,
    jkb_home_side: jkbHomeSide,
    jkb_supports_side: input.projectedHomeMargin === 0 ? "pick" : input.projectedHomeMargin > 0 ? "home" : "away",
    market_home_side: marketHomeSide,
    jkb_agrees_with_market: agrees,
    spread_edge_bucket_abs: absPointBucket(input.primaryJkbVsMarketEdge),
    spread_edge_direction:
      input.primaryJkbVsMarketEdge == null
        ? null
        : input.primaryJkbVsMarketEdge > 0
          ? "jkb_more_home"
          : input.primaryJkbVsMarketEdge < 0
            ? "jkb_more_away"
            : "aligned",
    power_rating_diff_bucket_abs: absPointBucket(powerDiff),
    market_reference_available: input.primaryMarketImpliedHomeMargin != null,
    ...conditionalCandidateCohorts(input.featureValues),
  };
}

export function derivePlayerCohorts(input: {
  predictionType: Exclude<EvaluationPredictionType, "spread">;
  context: CohortContext;
  projectedVolume: number;
  market: PlayerMarketEvaluation | null;
  featureValues: Record<string, JsonValue>;
}): Record<string, JsonValue> {
  const edgeBucket =
    input.market == null
      ? null
      : bucketizeEdge(input.market.jkb_vs_market_edge, PLAYER_EDGE_MARKET[input.predictionType]);
  return {
    week_band: weekBand(input.context.week),
    home_away: input.context.home_away,
    neutral_site: input.context.neutral_site,
    position: input.context.position,
    division_game: input.context.division_game,
    role_status: input.context.status,
    projected_volume_bucket: volumeBucket(input.projectedVolume, PLAYER_VOLUME_WIDTH[input.predictionType]),
    market_input_available: input.market != null,
    edge_bucket: edgeBucket ?? null,
    edge_direction:
      input.market == null
        ? null
        : input.market.jkb_vs_market_edge > 0
          ? "jkb_over"
          : input.market.jkb_vs_market_edge < 0
            ? "jkb_under"
            : "aligned",
    ...conditionalCandidateCohorts(input.featureValues),
  };
}
