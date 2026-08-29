import { createHash } from "node:crypto";
import {
  BETTING_SPLITS_SCHEMA_VERSION,
  type BettingSplitSnapshot,
} from "./bettingSplitsTypes";

/**
 * WU4 content identity for betting split market state.
 *
 * The hash is a deterministic fingerprint of the *user-visible market state* of a
 * {@link BettingSplitSnapshot}: the canonical game/provider/sportsbook identity plus
 * every spread / total / moneyline number a reader would see.
 *
 * It deliberately excludes observation metadata (`capturedAt`, `providerCreatedAt`,
 * `providerLastSeenAt`, `firstObservedAt`, `lastObservedAt`) so that an hourly poll
 * that re-observes an unchanged market does not create a duplicate historical row.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Recursively sort object keys so that the serialized form depends only on the
 * data, never on the order in which the caller happened to construct the object.
 */
function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<{ [key: string]: JsonValue }>((accumulator, key) => {
        accumulator[key] = canonicalize(value[key]);
        return accumulator;
      }, {});
  }
  return value;
}

/**
 * Null sportsbook must hash deterministically and must never collide with a
 * provider that literally reports the string "null".
 */
function sportsbookIdentity(sportsbook: string | null): JsonValue {
  return sportsbook === null ? { kind: "provider-consensus" } : { kind: "book", id: sportsbook };
}

function marketState(snapshot: BettingSplitSnapshot): JsonValue {
  return {
    // Representation version — bump the schema and every hash intentionally changes.
    v: BETTING_SPLITS_SCHEMA_VERSION,
    // Identity that partitions one market series from another.
    league: snapshot.league,
    jkbGameId: snapshot.jkbGameId,
    provider: snapshot.provider,
    sportsbook: sportsbookIdentity(snapshot.sportsbook),
    // Market numbers a reader sees.
    spread: snapshot.spread === null
      ? null
      : {
          openingHomeLine: snapshot.spread.openingHomeLine,
          openingAwayLine: snapshot.spread.openingAwayLine,
          currentHomeLine: snapshot.spread.currentHomeLine,
          currentAwayLine: snapshot.spread.currentAwayLine,
          homeBetPct: snapshot.spread.homeBetPct,
          awayBetPct: snapshot.spread.awayBetPct,
          homeMoneyPct: snapshot.spread.homeMoneyPct,
          awayMoneyPct: snapshot.spread.awayMoneyPct,
        },
    total: snapshot.total === null
      ? null
      : {
          openingLine: snapshot.total.openingLine,
          currentLine: snapshot.total.currentLine,
          overBetPct: snapshot.total.overBetPct,
          underBetPct: snapshot.total.underBetPct,
          overMoneyPct: snapshot.total.overMoneyPct,
          underMoneyPct: snapshot.total.underMoneyPct,
        },
    moneyline: snapshot.moneyline === null
      ? null
      : {
          openingHomePrice: snapshot.moneyline.openingHomePrice,
          openingAwayPrice: snapshot.moneyline.openingAwayPrice,
          currentHomePrice: snapshot.moneyline.currentHomePrice,
          currentAwayPrice: snapshot.moneyline.currentAwayPrice,
          homeBetPct: snapshot.moneyline.homeBetPct,
          awayBetPct: snapshot.moneyline.awayBetPct,
          homeMoneyPct: snapshot.moneyline.homeMoneyPct,
          awayMoneyPct: snapshot.moneyline.awayMoneyPct,
        },
  };
}

/**
 * Deterministic, key-order-independent serialization of the market state.
 * Exported for tests and for callers that want to diff two states directly.
 */
export function serializeBettingSplitMarketState(snapshot: BettingSplitSnapshot): string {
  return JSON.stringify(canonicalize(marketState(snapshot)));
}

/** SHA-256 hex digest of {@link serializeBettingSplitMarketState}. */
export function buildBettingSplitContentHash(snapshot: BettingSplitSnapshot): string {
  return createHash("sha256")
    .update(serializeBettingSplitMarketState(snapshot))
    .digest("hex");
}
