import type { CfbLineSemantic, MarketModelJoinRow, SpreadEdgeRow } from "./types";

/**
 * Section 6/7: marketImpliedHomeMargin = -marketSpread (verified sign
 * convention — marketSignConventionQa.ts). homeSpreadEdgePoints =
 * modelProjectedMargin - marketImpliedHomeMargin: positive means the
 * model likes the home side MORE than the market does. Cover
 * probabilities are computed by exact enumeration over the paired
 * (home, away) residual pool from Phase 5's own bootstrap population —
 * deterministic, no RNG needed since it's a finite pool walked exactly.
 */
export function computeSpreadEdgeRows(rows: readonly MarketModelJoinRow[], semantic: CfbLineSemantic): SpreadEdgeRow[] {
  const result: SpreadEdgeRow[] = [];
  for (const row of rows) {
    const marketSpread = semantic === "OPEN" ? row.spreadOpen : row.spreadLatestObserved;
    if (marketSpread === null) continue; // never manufacture a missing open value (Section 2)
    const marketImpliedHomeMargin = -marketSpread;

    const n = Math.min(row.homeResidualPool.length, row.awayResidualPool.length);
    let coverCount = 0;
    let againstCount = 0;
    for (let i = 0; i < n; i += 1) {
      const simulatedMargin = row.modelProjectedMargin + (row.homeResidualPool[i] - row.awayResidualPool[i]);
      if (simulatedMargin > marketImpliedHomeMargin) coverCount += 1;
      else if (simulatedMargin < marketImpliedHomeMargin) againstCount += 1;
    }
    const pHomeCover = n === 0 ? 0.5 : coverCount / n;
    const pAwayCover = n === 0 ? 0.5 : againstCount / n;
    const pPush = Math.max(0, 1 - pHomeCover - pAwayCover); // near-zero with continuous residuals — documented limitation (Section 7)

    const homeCovered = row.actualMargin > marketImpliedHomeMargin ? true : row.actualMargin < marketImpliedHomeMargin ? false : null;

    result.push({
      gameId: row.gameId,
      season: row.season,
      week: row.week,
      provider: row.provider,
      semantic,
      marketSpread,
      marketImpliedHomeMargin,
      homeSpreadEdgePoints: row.modelProjectedMargin - marketImpliedHomeMargin,
      pHomeCover,
      pAwayCover,
      pPush,
      homeCovered,
      modelPHomeWin: row.modelPHomeWin,
    });
  }
  return result;
}
