import type { CfbLineSemantic, MarketModelJoinRow, TotalEdgeRow } from "./types";

/** Section 8: totalEdgePoints = calibrated projectedTotal - marketTotal. Same exact-enumeration approach as spreadEdge.ts. */
export function computeTotalEdgeRows(rows: readonly MarketModelJoinRow[], semantic: CfbLineSemantic): TotalEdgeRow[] {
  const result: TotalEdgeRow[] = [];
  for (const row of rows) {
    const marketTotal = semantic === "OPEN" ? row.totalOpen : row.totalLatestObserved;
    if (marketTotal === null) continue;

    const n = Math.min(row.homeResidualPool.length, row.awayResidualPool.length);
    let overCount = 0;
    let underCount = 0;
    for (let i = 0; i < n; i += 1) {
      const simulatedTotal = row.modelProjectedTotal + (row.homeResidualPool[i] + row.awayResidualPool[i]);
      if (simulatedTotal > marketTotal) overCount += 1;
      else if (simulatedTotal < marketTotal) underCount += 1;
    }
    const pOver = n === 0 ? 0.5 : overCount / n;
    const pUnder = n === 0 ? 0.5 : underCount / n;

    const wentOver = row.actualTotal > marketTotal ? true : row.actualTotal < marketTotal ? false : null;

    result.push({
      gameId: row.gameId,
      season: row.season,
      week: row.week,
      provider: row.provider,
      semantic,
      marketTotal,
      totalEdgePoints: row.modelProjectedTotal - marketTotal,
      pOver,
      pUnder,
      wentOver,
    });
  }
  return result;
}
