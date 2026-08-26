/**
 * Phase 11A: odds-math primitives for the JKB-vs-sportsbook research
 * framework. Pure functions only -- no production/model code depends on
 * this module.
 */

/** American odds -> implied probability (0-1), vig-inclusive. */
export function americanToImplied(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return price > 0 ? 100 / (price + 100) : -price / (-price + 100);
}

/**
 * Two-sided no-vig probabilities: implied probabilities always sum to
 * >1 (the vig); dividing each by the sum removes it proportionally. Null
 * whenever either side is missing -- no-vig is undefined for a one-sided
 * market.
 */
export function noVigProbabilities(overPrice, underPrice) {
  const overImplied = americanToImplied(overPrice);
  const underImplied = americanToImplied(underPrice);
  if (overImplied == null || underImplied == null) return { overProb: null, underProb: null };
  const total = overImplied + underImplied;
  if (!(total > 0)) return { overProb: null, underProb: null };
  return { overProb: overImplied / total, underProb: underImplied / total };
}

/**
 * Flat $100-stake profit for one graded bet at the given American price.
 * Win: +price if price>0, else +100*100/|price|. Loss: -100. Push: 0.
 * Returns null for an ungradeable price.
 */
export function americanRoi(price, result) {
  if (price == null || !Number.isFinite(price)) return null;
  if (result === "push") return 0;
  if (result !== "win" && result !== "loss") return null;
  if (result === "loss") return -100;
  return price > 0 ? price : (100 * 100) / -price;
}
