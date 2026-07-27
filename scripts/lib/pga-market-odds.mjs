/**
 * Canonical PGA betting-market vocabulary and per-market price lookup.
 *
 * THIS IS THE ONLY PLACE A MARKET RESOLVES TO A PRICE. The generator and the
 * Best Bets page previously each had their own lookup, and the page's copy
 * fell back to the outright price for unpriced placement markets -- so a Top-20
 * card could render an outright number as though it were a Top-20 number.
 *
 * Three spellings for the same market exist in the codebase and are all
 * accepted here rather than migrated, which would be a schema change:
 *   - section / pick-array keys: outrights, top5, top10, top20
 *   - odds-payload keys:         outright,  top5, top10, top20
 *   - selectPublishedPicks arg:  outright
 */

/** Pick-array/section keys, in display order. */
export const PGA_MARKET_KEYS = Object.freeze(["outrights", "top5", "top10", "top20"]);

/** Human labels for reader-facing copy. */
export const PGA_MARKET_LABELS = Object.freeze({
  outrights: "Outright",
  top5: "Top 5",
  top10: "Top 10",
  top20: "Top 20",
});

const ODDS_KEY_BY_MARKET = Object.freeze({
  outrights: "outright",
  outright: "outright",
  top5: "top5",
  top10: "top10",
  top20: "top20",
});

/**
 * The odds-payload key for a market, in any of its accepted spellings.
 * Returns null for an unrecognized market so callers fail closed (no price)
 * rather than falling through to some other market's number.
 */
export function oddsKeyForMarket(market) {
  return ODDS_KEY_BY_MARKET[String(market ?? "")] ?? null;
}

/**
 * Price for one pick in ONE specific market. No cross-market fallback, ever.
 *
 * An outright price is not a Top-5/Top-10/Top-20 price. Substituting it would
 * publish a number that does not exist for the market shown next to it, and
 * would let value filtering retain a placement pick that has no placement
 * price at all.
 */
export function marketOddsFor(pick, market) {
  const odds = pick?.odds;
  if (!odds) return null;

  const key = oddsKeyForMarket(market);
  if (!key) return null;

  return odds[key] ?? null;
}

/** True when this pick has a real price in this specific market. */
export function hasMarketOdds(pick, market) {
  return marketOddsFor(pick, market) != null;
}
