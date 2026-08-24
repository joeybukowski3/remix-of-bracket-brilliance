import { americanOddsToDecimal } from "./oddsMath";
import type { MoneylineEdgeRow } from "./types";

export type RoiResult = { bets: number; wins: number; losses: number; units: number; roi: number | null; averageExpectedEv: number | null };

/**
 * Section 18: fixed 1-unit stake per qualifying wager, no Kelly/bankroll
 * compounding/variable sizing. Bets the side (home or away) whose
 * probability edge is >= the threshold; only rows with an actual price
 * for that side are used.
 */
export function computeMoneylineRoi(rows: readonly MoneylineEdgeRow[], edgeThreshold: number): RoiResult {
  let units = 0;
  let wins = 0;
  let losses = 0;
  let bets = 0;
  let evSum = 0;

  for (const row of rows) {
    const awayProbabilityEdge = 1 - row.modelPHomeWin - row.awayImpliedProbFair;
    const takeHome = row.homeProbabilityEdge >= edgeThreshold;
    const takeAway = awayProbabilityEdge >= edgeThreshold;
    if (!takeHome && !takeAway) continue;
    // If both sides somehow qualify (shouldn't happen with a well-formed devig), take the larger edge.
    const side = takeHome && (!takeAway || row.homeProbabilityEdge >= awayProbabilityEdge) ? "home" : "away";

    bets += 1;
    const odds = side === "home" ? row.homeMoneyline : row.awayMoneyline;
    const decimal = americanOddsToDecimal(odds);
    const won = side === "home" ? row.homeWon : !row.homeWon;
    evSum += side === "home" ? row.homeEv : row.awayEv;
    if (won) {
      wins += 1;
      units += decimal - 1;
    } else {
      losses += 1;
      units -= 1;
    }
  }

  return { bets, wins, losses, units, roi: bets === 0 ? null : units / bets, averageExpectedEv: bets === 0 ? null : evSum / bets };
}
