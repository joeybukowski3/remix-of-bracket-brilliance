import { americanOddsToDecimal, americanOddsToImpliedProbability, computeEv, devigProportional } from "./oddsMath";
import type { MarketModelJoinRow, MoneylineEdgeRow } from "./types";

/** Section 9/10: de-vigged moneyline probability + model probability edge + true EV against the actual offered price. */
export function computeMoneylineEdgeRows(rows: readonly MarketModelJoinRow[]): MoneylineEdgeRow[] {
  const result: MoneylineEdgeRow[] = [];
  for (const row of rows) {
    if (row.homeMoneyline === null || row.awayMoneyline === null) continue;

    const homeRaw = americanOddsToImpliedProbability(row.homeMoneyline);
    const awayRaw = americanOddsToImpliedProbability(row.awayMoneyline);
    const { homeFair, awayFair, overround } = devigProportional(homeRaw, awayRaw);

    result.push({
      gameId: row.gameId,
      season: row.season,
      week: row.week,
      provider: row.provider,
      homeMoneyline: row.homeMoneyline,
      awayMoneyline: row.awayMoneyline,
      homeImpliedProbRaw: homeRaw,
      awayImpliedProbRaw: awayRaw,
      overround,
      homeImpliedProbFair: homeFair,
      awayImpliedProbFair: awayFair,
      modelPHomeWin: row.modelPHomeWin,
      homeProbabilityEdge: row.modelPHomeWin - homeFair,
      homeEv: computeEv(row.modelPHomeWin, americanOddsToDecimal(row.homeMoneyline)),
      awayEv: computeEv(1 - row.modelPHomeWin, americanOddsToDecimal(row.awayMoneyline)),
      homeWon: row.actualHomePoints > row.actualAwayPoints,
    });
  }
  return result;
}
