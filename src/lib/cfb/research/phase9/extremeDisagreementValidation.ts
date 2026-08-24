import { EXTREME_DISAGREEMENT_MARGIN_BINS, MIN_BUCKET_SAMPLE_SIZE } from "./config";
import type { MarketModelJoinRow } from "../phase6/types";

export type DisagreementBinResult = {
  binLabel: string;
  n: number;
  modelCloserRate: number | null;
  marketCloserRate: number | null;
  meanModelError: number | null;
  meanMarketError: number | null;
};

/**
 * Section 19 — Phase 7-style extreme-disagreement re-audit: for each
 * disagreement threshold, does the connectivity-aware finalist reduce
 * catastrophic misses relative to the frozen baseline?
 */
export function buildExtremeDisagreementValidation(joinRows: readonly MarketModelJoinRow[]): DisagreementBinResult[] {
  const withMarket = joinRows
    .filter((r) => r.spreadLatestObserved !== null)
    .map((r) => {
      const marketMargin = -(r.spreadLatestObserved as number);
      return {
        disagreement: Math.abs(r.modelProjectedMargin - marketMargin),
        modelError: Math.abs(r.modelProjectedMargin - r.actualMargin),
        marketError: Math.abs(marketMargin - r.actualMargin),
      };
    });

  return EXTREME_DISAGREEMENT_MARGIN_BINS.map((threshold) => {
    const inBin = withMarket.filter((r) => r.disagreement >= threshold);
    if (inBin.length < MIN_BUCKET_SAMPLE_SIZE) {
      return { binLabel: `>=${threshold}`, n: inBin.length, modelCloserRate: null, marketCloserRate: null, meanModelError: null, meanMarketError: null };
    }
    const modelCloser = inBin.filter((r) => r.modelError < r.marketError).length;
    const marketCloser = inBin.filter((r) => r.marketError < r.modelError).length;
    return {
      binLabel: `>=${threshold}`,
      n: inBin.length,
      modelCloserRate: modelCloser / inBin.length,
      marketCloserRate: marketCloser / inBin.length,
      meanModelError: inBin.reduce((s, r) => s + r.modelError, 0) / inBin.length,
      meanMarketError: inBin.reduce((s, r) => s + r.marketError, 0) / inBin.length,
    };
  });
}
