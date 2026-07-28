/**
 * Application-side access to the canonical PGA market/odds vocabulary.
 *
 * A thin re-export holding no logic of its own, so the Best Bets page and the
 * generator resolve a market to a price through the exact same function. The
 * page previously had its own copy that fell back to the outright price.
 */
export {
  PGA_MARKET_KEYS,
  PGA_MARKET_LABELS,
  hasMarketOdds,
  marketOddsFor,
  oddsKeyForMarket,
} from "../../../scripts/lib/pga-market-odds.mjs";

export type { PgaMarketKey, PgaOddsPayload } from "../../../scripts/lib/pga-market-odds.mjs";
