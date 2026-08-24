import { MIN_BUCKET_SAMPLE_SIZE } from "./config";
import { correlation, mae } from "./statsUtils";
import type { BucketAccuracyRow, MissDatasetRow } from "./types";

export type TalentRosterAnalysisResult = {
  correlationTalentGapVsDisagreement: number | null;
  correlationTalentPriorConflictVsDisagreement: number | null;
  byReturningProductionExtreme: BucketAccuracyRow[];
};

function toRow(label: string, rows: readonly MissDatasetRow[]): BucketAccuracyRow {
  const modelMaeVal = mae(rows.map((r) => r.modelMarginError));
  const marketMaeVal = mae(rows.filter((r) => r.marketMarginError !== null).map((r) => r.marketMarginError as number));
  const enough = rows.length >= MIN_BUCKET_SAMPLE_SIZE;
  return {
    bucketLabel: label,
    n: rows.length,
    modelMae: enough ? modelMaeVal : null,
    marketMae: enough ? marketMaeVal : null,
    modelMinusMarketMae: enough && modelMaeVal !== null && marketMaeVal !== null ? modelMaeVal - marketMaeVal : null,
  };
}

/**
 * Section 6 — talent/roster hypothesis, tested (not assumed). "Talent vs
 * prior-year-performance conflict" = |talentDifferential - prevYearRatingDifferential|
 * (both signed home-minus-away; large gap means recruiting talent and
 * actual prior-year results disagreed about which team is better).
 */
export function buildTalentRosterAnalysis(rows: readonly MissDatasetRow[]): TalentRosterAnalysisResult {
  const withTalent = rows.filter(
    (r): r is MissDatasetRow & { modelVsMarketDisagreement: number } =>
      r.homeTalent !== null && r.awayTalent !== null && r.modelVsMarketDisagreement !== null,
  );
  const talentGap = withTalent.map((r) => Math.abs((r.homeTalent as number) - (r.awayTalent as number)));
  const correlationTalentGapVsDisagreement = correlation(talentGap, withTalent.map((r) => r.modelVsMarketDisagreement));

  const withConflict = withTalent.filter((r) => r.homePrevSeasonRating !== null && r.awayPrevSeasonRating !== null);
  const conflictMagnitude = withConflict.map((r) => {
    const talentDiff = (r.homeTalent as number) - (r.awayTalent as number);
    // Prior-year rating differential is on a standardized rating scale, talent is a raw composite; use RANK-free relative
    // magnitude by z-scoring each series' own conflict set — approximated here with sign disagreement weighted by talent gap size.
    const prevDiff = (r.homePrevSeasonRating as number) - (r.awayPrevSeasonRating as number);
    const talentSaysHome = talentDiff > 0;
    const priorSaysHome = prevDiff > 0;
    return talentSaysHome === priorSaysHome ? 0 : Math.abs(talentDiff);
  });
  const correlationTalentPriorConflictVsDisagreement = correlation(
    conflictMagnitude,
    withConflict.map((r) => r.modelVsMarketDisagreement as number),
  );

  const returningValues = rows
    .flatMap((r) => [r.homeReturningProductionOffense, r.awayReturningProductionOffense])
    .filter((v): v is number => v !== null);
  const sorted = [...returningValues].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(0.25 * (sorted.length - 1))] ?? 0;
  const p75 = sorted[Math.floor(0.75 * (sorted.length - 1))] ?? 1;

  const lowReturning = rows.filter(
    (r) =>
      (r.homeReturningProductionOffense !== null && r.homeReturningProductionOffense <= p25) ||
      (r.awayReturningProductionOffense !== null && r.awayReturningProductionOffense <= p25),
  );
  const highReturning = rows.filter(
    (r) =>
      (r.homeReturningProductionOffense !== null && r.homeReturningProductionOffense >= p75) ||
      (r.awayReturningProductionOffense !== null && r.awayReturningProductionOffense >= p75),
  );

  return {
    correlationTalentGapVsDisagreement,
    correlationTalentPriorConflictVsDisagreement,
    byReturningProductionExtreme: [toRow("low_returning_production (<=p25)", lowReturning), toRow("high_returning_production (>=p75)", highReturning)],
  };
}
