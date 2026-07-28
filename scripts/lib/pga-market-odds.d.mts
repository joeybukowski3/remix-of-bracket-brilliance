/**
 * Type surface for the canonical PGA market/odds vocabulary.
 * Declarations only -- values live solely in pga-market-odds.mjs.
 */

export type PgaMarketKey = "outrights" | "top5" | "top10" | "top20";

export type PgaOddsPayload = {
  outright?: string | null;
  top5?: string | null;
  top10?: string | null;
  top20?: string | null;
} | null | undefined;

export declare const PGA_MARKET_KEYS: readonly PgaMarketKey[];

export declare const PGA_MARKET_LABELS: Readonly<Record<PgaMarketKey, string>>;

export declare function oddsKeyForMarket(market: unknown): string | null;

export declare function marketOddsFor(
  pick: { odds?: PgaOddsPayload } | null | undefined,
  market: unknown,
): string | null;

export declare function hasMarketOdds(
  pick: { odds?: PgaOddsPayload } | null | undefined,
  market: unknown,
): boolean;
