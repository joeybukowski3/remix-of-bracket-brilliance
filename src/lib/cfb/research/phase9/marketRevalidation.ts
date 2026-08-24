import { computeSpreadEdgeRows } from "../phase6/spreadEdge";
import { computeTotalEdgeRows } from "../phase6/totalEdge";
import { computeMoneylineEdgeRows } from "../phase6/moneylineEdge";
import { compareMarginAccuracy, compareTotalAccuracy, compareWinnerProbabilityAccuracy } from "../phase6/modelVsMarketAccuracy";
import { fitIncrementalInformationRegression } from "../phase6/incrementalInformation";
import type { MarketModelJoinRow } from "../phase6/types";

/**
 * Section 14 — the frozen Phase 6 market comparison, rerun against Phase
 * 9's own (baseline or finalist) pipeline output. Every function here is
 * imported from Phase 6 unmodified; Section 24 says NOT to retune edge
 * thresholds, so nothing here does.
 */
export function buildMarketRevalidation(joinRows: readonly MarketModelJoinRow[]) {
  const spreadRows = computeSpreadEdgeRows(joinRows, "LATEST_OBSERVED");
  const totalRows = computeTotalEdgeRows(joinRows, "LATEST_OBSERVED");
  const moneylineRows = computeMoneylineEdgeRows(joinRows);
  const joinByGame = new Map(joinRows.map((r) => [r.gameId, r]));

  const marginComparison = compareMarginAccuracy(spreadRows, joinByGame);
  const totalComparison = compareTotalAccuracy(totalRows, joinByGame);
  const winnerComparison = compareWinnerProbabilityAccuracy(moneylineRows);

  const incrementalRows = spreadRows
    .map((r) => {
      const join = joinByGame.get(r.gameId);
      if (!join) return null;
      return { modelMargin: join.modelProjectedMargin, marketMargin: r.marketImpliedHomeMargin, actualMargin: join.actualMargin };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const incrementalRegression = fitIncrementalInformationRegression(incrementalRows);

  return {
    margin: marginComparison,
    total: totalComparison,
    winner: winnerComparison,
    incrementalInformation: {
      n: incrementalRegression.n,
      marketOnlyR2: incrementalRegression.marketOnlyR2,
      combinedR2: incrementalRegression.combinedR2,
      incrementalR2: incrementalRegression.combinedR2 - incrementalRegression.marketOnlyR2,
    },
  };
}
