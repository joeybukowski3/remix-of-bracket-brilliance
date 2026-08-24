import { MIN_BUCKET_SAMPLE_SIZE } from "./config";
import { mae } from "./statsUtils";
import type { MissDatasetRow } from "./types";

type TeamSideObservation = {
  gap: number; // currentSeasonPower - prevSeasonRating; positive = performing better than prior said, negative = prior was too optimistic (stale-high)
  modelMarginError: number;
  marketMarginError: number | null;
  modelCloser: boolean | null;
};

export type PriorStalenessBucketRow = {
  bucketLabel: string;
  n: number;
  meanGap: number | null;
  modelMae: number | null;
  marketMae: number | null;
  modelMinusMarketMae: number | null;
  modelCloserRate: number | null;
};

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Section 12 — stale-prior hypothesis. Builds one team-side observation per
 * (game, side) with `gap = currentSeasonPower - prevSeasonRating` (uses
 * this row's own week cutoff, so a team observed in week 10 has 9 games of
 * "current-season evidence" pushing against its preseason prior). Bottom
 * and top deciles of `gap` are the two stale-prior extremes; the middle is
 * the stable-prior baseline.
 */
export function buildPriorStalenessAnalysis(rows: readonly MissDatasetRow[]): PriorStalenessBucketRow[] {
  const observations: TeamSideObservation[] = [];
  for (const row of rows) {
    const modelCloser =
      row.marketMarginError === null ? null : row.modelMarginError < row.marketMarginError;
    const homePower =
      row.homeOffenseRating !== null && row.homeDefenseRating !== null ? 0.5 * (row.homeOffenseRating + row.homeDefenseRating) : null;
    const awayPower =
      row.awayOffenseRating !== null && row.awayDefenseRating !== null ? 0.5 * (row.awayOffenseRating + row.awayDefenseRating) : null;
    if (homePower !== null && row.homePrevSeasonRating !== null) {
      observations.push({
        gap: homePower - row.homePrevSeasonRating,
        modelMarginError: row.modelMarginError,
        marketMarginError: row.marketMarginError,
        modelCloser,
      });
    }
    if (awayPower !== null && row.awayPrevSeasonRating !== null) {
      observations.push({
        gap: awayPower - row.awayPrevSeasonRating,
        modelMarginError: row.modelMarginError,
        marketMarginError: row.marketMarginError,
        modelCloser,
      });
    }
  }

  const sortedGaps = [...observations.map((o) => o.gap)].sort((a, b) => a - b);
  const p10 = quantile(sortedGaps, 0.1);
  const p90 = quantile(sortedGaps, 0.9);

  const bucketed = {
    preseason_high_current_low: observations.filter((o) => o.gap <= p10),
    preseason_low_current_high: observations.filter((o) => o.gap >= p90),
    stable: observations.filter((o) => o.gap > p10 && o.gap < p90),
  };

  function toRow(label: string, obs: readonly TeamSideObservation[]): PriorStalenessBucketRow {
    const modelMaeVal = mae(obs.map((o) => o.modelMarginError));
    const marketMaeVal = mae(obs.filter((o) => o.marketMarginError !== null).map((o) => o.marketMarginError as number));
    const closerRates = obs.filter((o) => o.modelCloser !== null).map((o) => (o.modelCloser ? 1 : 0));
    const enough = obs.length >= MIN_BUCKET_SAMPLE_SIZE;
    return {
      bucketLabel: label,
      n: obs.length,
      meanGap: obs.length === 0 ? null : obs.reduce((s, o) => s + o.gap, 0) / obs.length,
      modelMae: enough ? modelMaeVal : null,
      marketMae: enough ? marketMaeVal : null,
      modelMinusMarketMae: enough && modelMaeVal !== null && marketMaeVal !== null ? modelMaeVal - marketMaeVal : null,
      modelCloserRate: enough && closerRates.length > 0 ? closerRates.reduce((s, v) => s + v, 0) / closerRates.length : null,
    };
  }

  return [
    toRow("preseason_high_current_low", bucketed.preseason_high_current_low),
    toRow("preseason_low_current_high", bucketed.preseason_low_current_high),
    toRow("stable", bucketed.stable),
  ];
}
