import { correlation, mean } from "./statsUtils";
import { buildTeamSeries, lag1Pairs } from "./teamSeriesUtils";
import type { MissDatasetRow } from "./types";

export type MarketDisagreementPersistenceResult = {
  lag1CorrelationPooled: number | null;
  nPairs: number;
  meanAbsDisagreementWhenModelCloser: number | null;
  meanAbsDisagreementWhenMarketCloser: number | null;
};

/**
 * Section 18 — does IPR's disagreement with the market for a given team
 * persist across consecutive appearances (signed: modelMargin - marketMargin
 * from that team's perspective, positive = model likes the team more than
 * the market does)? And when disagreement is large, which side was
 * generally correct that week (proxy for "does market converge toward IPR
 * or vice versa" — a full multi-week convergence trace is out of scope
 * here; this reports the closer-side split conditional on disagreement size).
 */
export function buildMarketDisagreementPersistenceAnalysis(rows: readonly MissDatasetRow[]): MarketDisagreementPersistenceResult {
  const byTeam = buildTeamSeries(
    rows,
    (r) => r.homeTeamExternalId,
    (r) => r.awayTeamExternalId,
    (r, isHome) => {
      if (r.marketMarginLatestObserved === null) return null;
      const diff = r.modelMargin - r.marketMarginLatestObserved;
      return isHome ? diff : -diff;
    },
  );

  const { current, next } = lag1Pairs(byTeam);
  const lag1CorrelationPooled = correlation(current, next);

  const withBoth = rows.filter((r) => r.marketMarginError !== null);
  const modelCloser = withBoth.filter((r) => r.modelMarginError < (r.marketMarginError as number));
  const marketCloser = withBoth.filter((r) => r.modelMarginError > (r.marketMarginError as number));

  return {
    lag1CorrelationPooled,
    nPairs: current.length,
    meanAbsDisagreementWhenModelCloser: mean(modelCloser.filter((r) => r.modelVsMarketDisagreement !== null).map((r) => r.modelVsMarketDisagreement as number)),
    meanAbsDisagreementWhenMarketCloser: mean(marketCloser.filter((r) => r.modelVsMarketDisagreement !== null).map((r) => r.modelVsMarketDisagreement as number)),
  };
}
