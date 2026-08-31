import { z } from "zod";
import { THE_ODDS_API_PROVIDER } from "./theOddsApiClient";
import type {
  BettingLineMoneyline,
  BettingLineSpread,
  BettingLineTotal,
} from "../lines/bettingLineTypes";

/**
 * Wire decoder for The Odds API v4 league-wide `/odds` payload.
 *
 * Produces one {@link NormalizedTheOddsApiBookLine} per (event, bookmaker). No
 * consensus is fabricated at ingest — each book's raw state is preserved. A
 * bookmaker that is missing a market simply yields `null` for that market.
 */

const outcomeSchema = z
  .object({
    name: z.string(),
    price: z.number(),
    point: z.number().optional(),
  })
  .passthrough();

const marketSchema = z
  .object({
    key: z.string(),
    last_update: z.string().optional(),
    outcomes: z.array(outcomeSchema).default([]),
  })
  .passthrough();

const bookmakerSchema = z
  .object({
    key: z.string(),
    title: z.string().optional(),
    last_update: z.string().optional(),
    markets: z.array(marketSchema).default([]),
  })
  .passthrough();

const eventSchema = z
  .object({
    id: z.string(),
    sport_key: z.string(),
    sport_title: z.string().optional(),
    commence_time: z.string(),
    home_team: z.string(),
    away_team: z.string(),
    bookmakers: z.array(bookmakerSchema).default([]),
  })
  .passthrough();

const payloadSchema = z.array(eventSchema);

export type NormalizedTheOddsApiBookLine = {
  provider: typeof THE_ODDS_API_PROVIDER;
  providerEventId: string;
  sportKey: string;
  commenceTimeUtc: string;
  homeTeamName: string;
  awayTeamName: string;
  sportsbook: string;
  sportsbookTitle: string | null;
  providerUpdatedAt: string | null;
  spread: BettingLineSpread | null;
  total: BettingLineTotal | null;
  moneyline: BettingLineMoneyline | null;
};

export class TheOddsApiWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TheOddsApiWireError";
  }
}

function toIso(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new TheOddsApiWireError(`Unparseable timestamp from provider: ${value}`);
  }
  return new Date(parsed).toISOString();
}

function priceFor(
  outcomes: readonly z.infer<typeof outcomeSchema>[],
  name: string,
): number | null {
  const match = outcomes.find((outcome) => outcome.name === name);
  return match ? match.price : null;
}

function pointFor(
  outcomes: readonly z.infer<typeof outcomeSchema>[],
  name: string,
): number | null {
  const match = outcomes.find((outcome) => outcome.name === name);
  return match && typeof match.point === "number" ? match.point : null;
}

function decodeSpread(
  outcomes: readonly z.infer<typeof outcomeSchema>[],
  homeTeam: string,
  awayTeam: string,
): BettingLineSpread | null {
  if (outcomes.length === 0) return null;
  return {
    homeLine: pointFor(outcomes, homeTeam),
    awayLine: pointFor(outcomes, awayTeam),
    homePrice: priceFor(outcomes, homeTeam),
    awayPrice: priceFor(outcomes, awayTeam),
  };
}

function decodeTotal(
  outcomes: readonly z.infer<typeof outcomeSchema>[],
): BettingLineTotal | null {
  if (outcomes.length === 0) return null;
  const over = outcomes.find((outcome) => outcome.name === "Over");
  const under = outcomes.find((outcome) => outcome.name === "Under");
  const line =
    (over && typeof over.point === "number" ? over.point : null) ??
    (under && typeof under.point === "number" ? under.point : null);
  return {
    line,
    overPrice: over ? over.price : null,
    underPrice: under ? under.price : null,
  };
}

function decodeMoneyline(
  outcomes: readonly z.infer<typeof outcomeSchema>[],
  homeTeam: string,
  awayTeam: string,
): BettingLineMoneyline | null {
  if (outcomes.length === 0) return null;
  return {
    homePrice: priceFor(outcomes, homeTeam),
    awayPrice: priceFor(outcomes, awayTeam),
  };
}

export function decodeTheOddsApiOdds(
  payload: unknown,
): NormalizedTheOddsApiBookLine[] {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TheOddsApiWireError(
      `The Odds API payload did not match the expected Event[] shape: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  const rows: NormalizedTheOddsApiBookLine[] = [];
  for (const event of parsed.data) {
    for (const bookmaker of event.bookmakers) {
      const byKey = new Map(bookmaker.markets.map((market) => [market.key, market]));
      const spreadMarket = byKey.get("spreads");
      const totalMarket = byKey.get("totals");
      const h2hMarket = byKey.get("h2h");

      rows.push({
        provider: THE_ODDS_API_PROVIDER,
        providerEventId: event.id,
        sportKey: event.sport_key,
        commenceTimeUtc: toIso(event.commence_time),
        homeTeamName: event.home_team,
        awayTeamName: event.away_team,
        sportsbook: bookmaker.key,
        sportsbookTitle: bookmaker.title ?? null,
        providerUpdatedAt: bookmaker.last_update
          ? toIso(bookmaker.last_update)
          : null,
        spread: spreadMarket
          ? decodeSpread(spreadMarket.outcomes, event.home_team, event.away_team)
          : null,
        total: totalMarket ? decodeTotal(totalMarket.outcomes) : null,
        moneyline: h2hMarket
          ? decodeMoneyline(h2hMarket.outcomes, event.home_team, event.away_team)
          : null,
      });
    }
  }
  return rows;
}
