/** American odds -> raw implied probability (no vig removal). */
export function americanOddsToImpliedProbability(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

/** American odds -> decimal odds (payout multiple including stake). */
export function americanOddsToDecimal(odds: number): number {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds;
}

/** Section 9 — proportional (multiplicative) de-vig: the standard simplest method. */
export function devigProportional(homeRaw: number, awayRaw: number): { homeFair: number; awayFair: number; overround: number } {
  const sum = homeRaw + awayRaw;
  return { homeFair: homeRaw / sum, awayFair: awayRaw / sum, overround: sum - 1 };
}

/** EV of a 1-unit stake at `decimalOdds` given true win probability `p`. */
export function computeEv(p: number, decimalOdds: number): number {
  return p * decimalOdds - 1;
}
