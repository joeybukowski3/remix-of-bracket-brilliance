import { GAMES_PLAYED_BUCKETS, MIN_BUCKET_SAMPLE_SIZE, RATING_VOLATILITY_BUCKETS } from "./config";
import { mae } from "./statsUtils";
import type { BucketAccuracyRow, MissDatasetRow } from "./types";

function toAccuracyRow(label: string, rows: readonly MissDatasetRow[]): BucketAccuracyRow {
  const modelMae = mae(rows.map((r) => r.modelMarginError));
  const marketMae = mae(rows.filter((r) => r.marketMarginError !== null).map((r) => r.marketMarginError as number));
  return {
    bucketLabel: label,
    n: rows.length,
    modelMae: rows.length >= MIN_BUCKET_SAMPLE_SIZE ? modelMae : null,
    marketMae: rows.length >= MIN_BUCKET_SAMPLE_SIZE ? marketMae : null,
    modelMinusMarketMae: modelMae !== null && marketMae !== null && rows.length >= MIN_BUCKET_SAMPLE_SIZE ? modelMae - marketMae : null,
  };
}

export type SparsityAnalysisResult = {
  byMinGamesPlayed: BucketAccuracyRow[];
  byTransitionTeamInvolved: BucketAccuracyRow[];
  byFallbackPriorTierDowngraded: BucketAccuracyRow[];
  byMaxRatingVolatility: BucketAccuracyRow[];
};

/**
 * Section 5 — data-sparsity hypothesis, tested quantitatively (not assumed).
 * Each bucket compares model MAE vs. market MAE; modelMinusMarketMae > 0
 * means the model underperforms the market MORE in that bucket than
 * elsewhere, which is the actual test of "does sparsity explain the gap".
 */
export function buildSparsityAnalysis(rows: readonly MissDatasetRow[]): SparsityAnalysisResult {
  const byMinGamesPlayed: BucketAccuracyRow[] = GAMES_PLAYED_BUCKETS.map((b) => {
    const bucketRows = rows.filter((r) => {
      const minGames = Math.min(r.homeGamesPlayedEnteringWeek, r.awayGamesPlayedEnteringWeek);
      return minGames >= b.min && minGames < b.max;
    });
    return toAccuracyRow(b.label, bucketRows);
  });

  const transitionRows = rows.filter((r) => r.homeTransitionTeam || r.awayTransitionTeam);
  const nonTransitionRows = rows.filter((r) => !r.homeTransitionTeam && !r.awayTransitionTeam);
  const byTransitionTeamInvolved: BucketAccuracyRow[] = [
    toAccuracyRow("transition_team_involved", transitionRows),
    toAccuracyRow("no_transition_team", nonTransitionRows),
  ];

  const isDowngraded = (r: MissDatasetRow) =>
    r.homePriorOffenseTier !== "PRIOR_D" ||
    r.homePriorDefenseTier !== "PRIOR_D" ||
    r.awayPriorOffenseTier !== "PRIOR_D" ||
    r.awayPriorDefenseTier !== "PRIOR_D";
  const byFallbackPriorTierDowngraded: BucketAccuracyRow[] = [
    toAccuracyRow("fallback_tier_downgraded", rows.filter(isDowngraded)),
    toAccuracyRow("full_prior_d_tier", rows.filter((r) => !isDowngraded(r))),
  ];

  const byMaxRatingVolatility: BucketAccuracyRow[] = RATING_VOLATILITY_BUCKETS.map((b) => {
    const bucketRows = rows.filter((r) => {
      if (r.homeRatingVolatility === null || r.awayRatingVolatility === null) return false;
      const maxVol = Math.max(r.homeRatingVolatility, r.awayRatingVolatility);
      return maxVol >= b.min && maxVol < b.max;
    });
    return toAccuracyRow(b.label, bucketRows);
  });

  return { byMinGamesPlayed, byTransitionTeamInvolved, byFallbackPriorTierDowngraded, byMaxRatingVolatility };
}
