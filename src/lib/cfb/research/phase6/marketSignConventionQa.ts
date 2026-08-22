import { pearsonCorrelation } from "../phase5/residualStats";
import type { MarketModelJoinRow } from "./types";

export type SignConventionQaReport = {
  n: number;
  correlationSpreadVsActualMargin: number | null;
  /** Fraction of rows where sign(spread) disagrees with sign(actual margin) in the "obviously wrong" direction (large spread, opposite large result) — a loud-failure smoke check, not a strict per-row rule (upsets are expected). */
  grossSignMismatchRate: number | null;
  interpretation: string;
};

const GROSS_MISMATCH_SPREAD_THRESHOLD = 14; // a "obviously should win" spread
const GROSS_MISMATCH_MARGIN_THRESHOLD = 14; // an "obviously lost badly" actual result

/**
 * Section 5: verifies the market spread sign convention EMPIRICALLY
 * against real historical results before any edge is computed elsewhere
 * in Phase 6 — home-team-spread, negative = home favored, confirmed by a
 * strong negative correlation with actual home margin. Fails loudly
 * (throws) if the correlation comes out positive or near zero, which
 * would mean the assumed convention is wrong or ambiguous.
 */
export function verifyMarketSignConvention(rows: readonly MarketModelJoinRow[]): SignConventionQaReport {
  const withSpread = rows.filter((r) => r.spreadLatestObserved !== null);
  const correlation = pearsonCorrelation(
    withSpread.map((r) => r.spreadLatestObserved as number),
    withSpread.map((r) => r.actualMargin),
  );

  if (correlation === null || correlation > -0.3) {
    throw new Error(
      `Market spread sign convention could not be verified: correlation(spread, actualHomeMargin) = ${correlation}. ` +
        "Expected a strong negative correlation (home-team spread, negative = home favored). Refusing to compute spread edges on an unverified sign convention.",
    );
  }

  const grossMismatches = withSpread.filter(
    (r) =>
      (r.spreadLatestObserved as number) <= -GROSS_MISMATCH_SPREAD_THRESHOLD && r.actualMargin <= -GROSS_MISMATCH_MARGIN_THRESHOLD,
  );
  const grossFavoriteRows = withSpread.filter((r) => (r.spreadLatestObserved as number) <= -GROSS_MISMATCH_SPREAD_THRESHOLD);

  return {
    n: withSpread.length,
    correlationSpreadVsActualMargin: correlation,
    grossSignMismatchRate: grossFavoriteRows.length === 0 ? null : grossMismatches.length / grossFavoriteRows.length,
    interpretation:
      "spreadLatestObserved/spreadOpen are home-team spreads: negative = home favored by that many points. " +
      "marketImpliedHomeMargin = -spread. Verified via correlation(spread, actualHomeMargin) below.",
  };
}
