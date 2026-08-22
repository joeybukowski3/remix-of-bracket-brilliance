import { MIN_BUCKET_SAMPLE_SIZE } from "./config";
import { assignDeciles, mae } from "./statsUtils";
import type { MissDatasetRow } from "./types";

export type SegmentRow = { segment: string; n: number; modelMae: number | null; marketMae: number | null; modelMinusMarketMae: number | null };

function toSegmentRow(label: string, rows: readonly MissDatasetRow[]): SegmentRow {
  const modelMaeVal = mae(rows.map((r) => r.modelMarginError));
  const marketMaeVal = mae(rows.filter((r) => r.marketMarginError !== null).map((r) => r.marketMarginError as number));
  const enough = rows.length >= MIN_BUCKET_SAMPLE_SIZE;
  return {
    segment: label,
    n: rows.length,
    modelMae: enough ? modelMaeVal : null,
    marketMae: enough ? marketMaeVal : null,
    modelMinusMarketMae: enough && modelMaeVal !== null && marketMaeVal !== null ? modelMaeVal - marketMaeVal : null,
  };
}

function decileSegments(label: string, values: readonly (number | null)[], rows: readonly MissDatasetRow[]): SegmentRow[] {
  const deciles = assignDeciles(values);
  return Array.from({ length: 10 }, (_, d) => toSegmentRow(`${label}_decile_${d}`, rows.filter((_, i) => deciles[i] === d)));
}

export type TeamProfileSegmentationResult = {
  byTalentGapDecile: SegmentRow[]; // |homeTalent - awayTalent|
  byPrevSeasonRatingGapDecile: SegmentRow[];
  byCurrentRatingGapDecile: SegmentRow[]; // |modelMargin| as a proxy for current-rating gap magnitude
  byReturningProductionGapDecile: SegmentRow[];
  byGamesPlayedBucket: SegmentRow[];
  byFavoriteUnderdog: SegmentRow[];
  byProjectedMarginBucket: SegmentRow[];
  byProjectedTotalBucket: SegmentRow[];
};

/** Section 16 — structural segmentation. Every cell reported (never cherry-picked). */
export function buildTeamProfileSegmentation(rows: readonly MissDatasetRow[]): TeamProfileSegmentationResult {
  const talentGap = rows.map((r) => (r.homeTalent !== null && r.awayTalent !== null ? Math.abs(r.homeTalent - r.awayTalent) : null));
  const prevRatingGap = rows.map((r) =>
    r.homePrevSeasonRating !== null && r.awayPrevSeasonRating !== null ? Math.abs(r.homePrevSeasonRating - r.awayPrevSeasonRating) : null,
  );
  const currentRatingGap = rows.map((r) => Math.abs(r.modelMargin));
  const returningGap = rows.map((r) =>
    r.homeReturningProductionOffense !== null && r.awayReturningProductionOffense !== null
      ? Math.abs(r.homeReturningProductionOffense - r.awayReturningProductionOffense)
      : null,
  );

  const gamesPlayedBuckets = [
    { label: "0-2", min: 0, max: 3 },
    { label: "3-6", min: 3, max: 7 },
    { label: "7+", min: 7, max: Infinity },
  ];
  const byGamesPlayedBucket = gamesPlayedBuckets.map((b) => {
    const group = rows.filter((r) => {
      const minGames = Math.min(r.homeGamesPlayedEnteringWeek, r.awayGamesPlayedEnteringWeek);
      return minGames >= b.min && minGames < b.max;
    });
    return toSegmentRow(b.label, group);
  });

  const favorites = rows.filter((r) => r.modelMargin > 0);
  const underdogs = rows.filter((r) => r.modelMargin <= 0);
  const byFavoriteUnderdog = [toSegmentRow("home_favorite_by_model", favorites), toSegmentRow("home_underdog_by_model", underdogs)];

  const marginBuckets = [
    { label: "0-3", min: 0, max: 3 },
    { label: "3-7", min: 3, max: 7 },
    { label: "7-14", min: 7, max: 14 },
    { label: "14-21", min: 14, max: 21 },
    { label: "21+", min: 21, max: Infinity },
  ];
  const byProjectedMarginBucket = marginBuckets.map((b) => {
    const group = rows.filter((r) => Math.abs(r.modelMargin) >= b.min && Math.abs(r.modelMargin) < b.max);
    return toSegmentRow(b.label, group);
  });

  const totalBuckets = [
    { label: "<45", min: 0, max: 45 },
    { label: "45-55", min: 45, max: 55 },
    { label: "55-65", min: 55, max: 65 },
    { label: "65+", min: 65, max: Infinity },
  ];
  const byProjectedTotalBucket = totalBuckets.map((b) => {
    const group = rows.filter((r) => r.modelTotal >= b.min && r.modelTotal < b.max);
    return toSegmentRow(b.label, group);
  });

  return {
    byTalentGapDecile: decileSegments("talent_gap", talentGap, rows),
    byPrevSeasonRatingGapDecile: decileSegments("prev_rating_gap", prevRatingGap, rows),
    byCurrentRatingGapDecile: decileSegments("current_rating_gap", currentRatingGap, rows),
    byReturningProductionGapDecile: decileSegments("returning_production_gap", returningGap, rows),
    byGamesPlayedBucket,
    byFavoriteUnderdog,
    byProjectedMarginBucket,
    byProjectedTotalBucket,
  };
}
