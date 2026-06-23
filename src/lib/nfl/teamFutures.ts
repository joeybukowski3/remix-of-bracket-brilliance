import {
  getMarketTitle,
  matchNflTeam,
  parseYesPrice,
  type PolymarketEvent,
} from "./superBowlMarkets.js";

export type NflFutureQuote = {
  key: "superBowl" | "conference" | "division";
  label: string;
  price: number | null;
  probability: number | null;
  americanOdds: number | null;
  eventId: string | null;
  eventTitle: string | null;
  marketId: string | null;
  marketSlug: string | null;
};

export type NflTeamFuturesResponse = {
  source: "polymarket";
  team: string;
  updatedAt: string;
  stale?: boolean;
  quotes: NflFutureQuote[];
};

export function probabilityToAmericanOdds(probability: number | null): number | null {
  if (probability == null || !Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;
  if (probability >= 0.5) return -Math.round((probability / (1 - probability)) * 100);
  return Math.round(((1 - probability) / probability) * 100);
}

export function formatAmericanOdds(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : String(value);
}

export function extractNflFutureQuote(
  event: PolymarketEvent,
  teamAbbr: string,
  key: NflFutureQuote["key"],
  label: string,
): NflFutureQuote | null {
  for (const market of event.markets ?? []) {
    const matchedTeam = matchNflTeam(getMarketTitle(market));
    if (!matchedTeam || matchedTeam.abbr !== teamAbbr) continue;

    const price = parseYesPrice(market.outcomes, market.outcomePrices);
    if (price == null) continue;

    return {
      key,
      label,
      price,
      probability: price * 100,
      americanOdds: probabilityToAmericanOdds(price),
      eventId: event.id == null ? null : String(event.id),
      eventTitle: event.title ?? null,
      marketId: market.id == null ? null : String(market.id),
      marketSlug: market.slug ?? null,
    };
  }
  return null;
}

export function unavailableNflFutureQuote(
  key: NflFutureQuote["key"],
  label: string,
): NflFutureQuote {
  return {
    key,
    label,
    price: null,
    probability: null,
    americanOdds: null,
    eventId: null,
    eventTitle: null,
    marketId: null,
    marketSlug: null,
  };
}
