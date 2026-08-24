import { RATING_VOLATILITY_BUCKETS, MIN_BUCKET_SAMPLE_SIZE } from "./config";
import { correlation, mae, mean } from "./statsUtils";
import type { BucketAccuracyRow, MissDatasetRow } from "./types";

export type RatingVolatilityAnalysisResult = {
  byMaxRatingVolatilityBucket: BucketAccuracyRow[];
  correlationVolatilityVsModelError: number | null;
  correlationVolatilityVsDisagreement: number | null;
  marketLineMovementByVolatilityBucket: { bucketLabel: string; n: number; meanAbsMovement: number | null }[];
};

/**
 * Section 11 — does the model overreact (large week-over-week rating
 * changes precede worse predictions AND larger model-vs-market
 * disagreement)? `homeRatingVolatility`/`awayRatingVolatility` already
 * measure the rating change entering THIS week's prediction (see
 * contextSnapshot.ts), so correlating them against this row's own error is
 * exactly the "precede" test the spec asks for.
 */
export function buildRatingVolatilityAnalysis(rows: readonly MissDatasetRow[]): RatingVolatilityAnalysisResult {
  const withVolatility = rows.filter(
    (r): r is MissDatasetRow & { homeRatingVolatility: number; awayRatingVolatility: number } =>
      r.homeRatingVolatility !== null && r.awayRatingVolatility !== null,
  );
  const maxVol = withVolatility.map((r) => Math.max(r.homeRatingVolatility, r.awayRatingVolatility));

  const byMaxRatingVolatilityBucket: BucketAccuracyRow[] = RATING_VOLATILITY_BUCKETS.map((b) => {
    const bucketRows = withVolatility.filter((r, i) => maxVol[i] >= b.min && maxVol[i] < b.max);
    const modelMaeVal = mae(bucketRows.map((r) => r.modelMarginError));
    const marketMaeVal = mae(bucketRows.filter((r) => r.marketMarginError !== null).map((r) => r.marketMarginError as number));
    return {
      bucketLabel: b.label,
      n: bucketRows.length,
      modelMae: bucketRows.length >= MIN_BUCKET_SAMPLE_SIZE ? modelMaeVal : null,
      marketMae: bucketRows.length >= MIN_BUCKET_SAMPLE_SIZE ? marketMaeVal : null,
      modelMinusMarketMae:
        modelMaeVal !== null && marketMaeVal !== null && bucketRows.length >= MIN_BUCKET_SAMPLE_SIZE
          ? modelMaeVal - marketMaeVal
          : null,
    };
  });

  const correlationVolatilityVsModelError = correlation(maxVol, withVolatility.map((r) => r.modelMarginError));
  const withDisagreement = withVolatility.filter((r) => r.modelVsMarketDisagreement !== null);
  const correlationVolatilityVsDisagreement = correlation(
    withDisagreement.map((r) => Math.max(r.homeRatingVolatility, r.awayRatingVolatility)),
    withDisagreement.map((r) => r.modelVsMarketDisagreement as number),
  );

  const withMovement = withVolatility.filter((r) => r.marketMarginOpen !== null);
  const movementByBucket = RATING_VOLATILITY_BUCKETS.map((b) => {
    const bucketRows = withMovement.filter((r) => {
      const v = Math.max(r.homeRatingVolatility, r.awayRatingVolatility);
      return v >= b.min && v < b.max;
    });
    const movements = bucketRows.map((r) => Math.abs((r.marketMarginLatestObserved as number) - (r.marketMarginOpen as number)));
    return { bucketLabel: b.label, n: bucketRows.length, meanAbsMovement: bucketRows.length >= MIN_BUCKET_SAMPLE_SIZE ? mean(movements) : null };
  });

  return {
    byMaxRatingVolatilityBucket,
    correlationVolatilityVsModelError,
    correlationVolatilityVsDisagreement,
    marketLineMovementByVolatilityBucket: movementByBucket,
  };
}
