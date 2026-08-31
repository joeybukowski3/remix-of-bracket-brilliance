import { createHash } from "node:crypto";
import {
  BETTING_LINE_SCHEMA_VERSION,
  type BettingLineSnapshot,
} from "./bettingLineTypes";

/**
 * WU8 content identity for a single sportsbook's line state.
 *
 * The hash is a deterministic fingerprint of the *market state* a reader would
 * see: the series identity (league / game / provider / sportsbook) plus every
 * spread, total and moneyline number.
 *
 * It deliberately excludes observation metadata (`capturedAt`,
 * `providerUpdatedAt`, `firstObservedAt`, `lastObservedAt`) so that a daily
 * snapshot that re-observes an unchanged line does not create a duplicate
 * history row. This is a distinct contract from the betting-splits hash — the
 * fields differ — and is intentionally not shared code.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
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

function marketState(snapshot: BettingLineSnapshot): JsonValue {
  return {
    v: BETTING_LINE_SCHEMA_VERSION,
    league: snapshot.league,
    jkbGameId: snapshot.jkbGameId,
    provider: snapshot.provider,
    sportsbook: snapshot.sportsbook,
    spread: snapshot.spread === null
      ? null
      : {
          homeLine: snapshot.spread.homeLine,
          awayLine: snapshot.spread.awayLine,
          homePrice: snapshot.spread.homePrice,
          awayPrice: snapshot.spread.awayPrice,
        },
    total: snapshot.total === null
      ? null
      : {
          line: snapshot.total.line,
          overPrice: snapshot.total.overPrice,
          underPrice: snapshot.total.underPrice,
        },
    moneyline: snapshot.moneyline === null
      ? null
      : {
          homePrice: snapshot.moneyline.homePrice,
          awayPrice: snapshot.moneyline.awayPrice,
        },
  };
}

export function serializeBettingLineMarketState(
  snapshot: BettingLineSnapshot,
): string {
  return JSON.stringify(canonicalize(marketState(snapshot)));
}

export function buildBettingLineContentHash(snapshot: BettingLineSnapshot): string {
  return createHash("sha256")
    .update(serializeBettingLineMarketState(snapshot))
    .digest("hex");
}
