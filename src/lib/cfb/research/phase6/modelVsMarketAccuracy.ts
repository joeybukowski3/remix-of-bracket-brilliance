import { computeBrierScore, computeLogLoss } from "../phase5/probabilityEvaluation";
import type { MarketModelJoinRow, MoneylineEdgeRow, SpreadEdgeRow, TotalEdgeRow } from "./types";

export type MaeComparison = { n: number; modelMae: number; marketMae: number };

/** Section 12: margin — model projected margin vs market-implied margin, both against the SAME actual outcome. */
export function compareMarginAccuracy(rows: readonly SpreadEdgeRow[], joinRowsByGame: Map<string, MarketModelJoinRow>): MaeComparison | null {
  const pairs = rows
    .map((r) => {
      const join = joinRowsByGame.get(r.gameId);
      if (!join) return null;
      return { model: join.modelProjectedMargin, market: r.marketImpliedHomeMargin, actual: join.actualMargin };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (pairs.length === 0) return null;
  return {
    n: pairs.length,
    modelMae: pairs.reduce((s, p) => s + Math.abs(p.model - p.actual), 0) / pairs.length,
    marketMae: pairs.reduce((s, p) => s + Math.abs(p.market - p.actual), 0) / pairs.length,
  };
}

export function compareTotalAccuracy(rows: readonly TotalEdgeRow[], joinRowsByGame: Map<string, MarketModelJoinRow>): MaeComparison | null {
  const pairs = rows
    .map((r) => {
      const join = joinRowsByGame.get(r.gameId);
      if (!join) return null;
      return { model: join.modelProjectedTotal, market: r.marketTotal, actual: join.actualTotal };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (pairs.length === 0) return null;
  return {
    n: pairs.length,
    modelMae: pairs.reduce((s, p) => s + Math.abs(p.model - p.actual), 0) / pairs.length,
    marketMae: pairs.reduce((s, p) => s + Math.abs(p.market - p.actual), 0) / pairs.length,
  };
}

export type WinnerAccuracyComparison = { n: number; modelBrier: number | null; marketBrier: number | null; modelLogLoss: number | null; marketLogLoss: number | null };

export function compareWinnerProbabilityAccuracy(rows: readonly MoneylineEdgeRow[]): WinnerAccuracyComparison {
  const modelRows = rows.map((r) => ({ pHomeWin: r.modelPHomeWin, homeWon: r.homeWon }));
  const marketRows = rows.map((r) => ({ pHomeWin: r.homeImpliedProbFair, homeWon: r.homeWon }));
  return {
    n: rows.length,
    modelBrier: computeBrierScore(modelRows),
    marketBrier: computeBrierScore(marketRows),
    modelLogLoss: computeLogLoss(modelRows),
    marketLogLoss: computeLogLoss(marketRows),
  };
}
