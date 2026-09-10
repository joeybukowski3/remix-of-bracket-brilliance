/**
 * Kalshi NFL yardage-market normalization (secondary/fallback source).
 *
 * Kalshi lists single-game passing/rushing/receiving-yards contracts as a
 * one-sided "N+" threshold LADDER per player (series KXNFLPASSYDS /
 * KXNFLRUSHYDS / KXNFLRECYDS). Each market is a binary contract "player
 * records >= floor_strike yards", priced 0..1 in dollars. There is no
 * native two-sided line and no sportsbook-style juice.
 *
 * This module is pure (no network, no fs). It:
 *   1. parses a raw Kalshi market row into a typed ladder rung,
 *   2. groups rungs into per-player ladders,
 *   3. derives ONE market-implied reference yardage line per ladder by
 *      price-interpolating the YES=0.50 crossing point (documented rule --
 *      see `deriveReferenceLine`), preserving every real rung and raw price,
 *   4. distinguishes the raw exchange price from a convenience
 *      American-odds DISPLAY conversion.
 *
 * The reference line is a DERIVED value, never a tradable contract. Nothing
 * here fabricates Over/Under sportsbook odds. Identity resolution (player ->
 * gsis id + scheduled game) is done by the caller via the shared
 * scripts/lib/nfl-roster-identity.mjs engine; this module only extracts the
 * team/player/date hints Kalshi provides.
 */

export const KALSHI_YARDAGE_SERIES = Object.freeze({
  passingYards: "KXNFLPASSYDS",
  rushingYards: "KXNFLRSHYDS",
  receivingYards: "KXNFLRECYDS",
});

/** Reverse map: series ticker -> canonical market key. */
export const KALSHI_SERIES_TO_MARKET = Object.freeze(
  Object.fromEntries(Object.entries(KALSHI_YARDAGE_SERIES).map(([market, series]) => [series, market])),
);

/** A ladder needs at least this many valid rungs to derive a reference line. */
export const MIN_LADDER_RUNGS = 2;

/**
 * Monotonicity tolerance. YES probability must not INCREASE as the yardage
 * threshold increases; a tiny wobble (crossed bid/ask, thin book) up to this
 * amount is tolerated, anything larger rejects the whole ladder as
 * non-monotonic / malformed.
 */
export const MONOTONICITY_TOLERANCE = 0.03;

function toNumber(value) {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Mid YES probability for one rung from its best bid/ask (dollars 0..1).
 * Falls back to last trade price when the book is one-sided or empty.
 * Returns null when there is no usable price at all.
 */
export function rungYesProbability(row) {
  const bid = toNumber(row.yes_bid_dollars);
  const ask = toNumber(row.yes_ask_dollars);
  const last = toNumber(row.last_price_dollars);
  const inRange = (p) => p != null && p > 0 && p < 1;
  if (inRange(bid) && inRange(ask)) {
    if (ask < bid) return inRange(last) ? last : null; // crossed book -> untrustworthy
    return (bid + ask) / 2;
  }
  if (inRange(bid) && inRange(last)) return (bid + last) / 2;
  if (inRange(ask) && inRange(last)) return (ask + last) / 2;
  if (inRange(last)) return last;
  return null;
}

/** True when the raw market is an open, tradeable, non-expired yardage contract. */
export function isLiveYardageMarket(row, now = new Date()) {
  if (String(row.status ?? "").toLowerCase() !== "active") return false;
  const close = Date.parse(row.close_time ?? "");
  if (Number.isFinite(close) && close <= now.getTime()) return false;
  const strike = toNumber(row.floor_strike);
  if (strike == null || strike < 0) return false;
  return true;
}

/**
 * Team names + kickoff date parsed out of a Kalshi yardage market. Kalshi
 * gives the matchup only as free text ("... in the New Orleans vs Detroit
 * Pro Football game originally scheduled for Sep 13, 2026") plus an event
 * ticker date code (`26SEP13`). Returns raw strings for the shared identity
 * engine to resolve -- never guesses an abbreviation here.
 *
 * @returns {{ teamAName:string|null, teamBName:string|null, kickoffDate:string|null, playerName:string|null }}
 */
export function parseKalshiMarketContext(row) {
  const rules = String(row.rules_primary ?? "");
  const vsMatch = rules.match(/\bin the\s+(.+?)\s+vs\.?\s+(.+?)\s+(?:pro football|professional football|nfl)\s+game\b/i);
  const teamAName = vsMatch ? vsMatch[1].trim() : null;
  const teamBName = vsMatch ? vsMatch[2].trim() : null;

  const dateMatch = rules.match(/scheduled for\s+([A-Za-z]{3,}\.?\s+\d{1,2},\s+\d{4})/);
  let kickoffDate = null;
  if (dateMatch) {
    const parsed = Date.parse(dateMatch[1].replace(".", ""));
    if (Number.isFinite(parsed)) kickoffDate = new Date(parsed).toISOString().slice(0, 10);
  }
  if (!kickoffDate) {
    // Fall back to the event-ticker date code: <SERIES>-<YY><MMM><DD><TEAMS>
    const code = String(row.event_ticker ?? "").match(/-(\d{2})([A-Z]{3})(\d{2})/);
    if (code) {
      const months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
      const month = months[code[2]];
      if (month != null) {
        const d = new Date(Date.UTC(2000 + Number(code[1]), month, Number(code[3])));
        if (!Number.isNaN(d.getTime())) kickoffDate = d.toISOString().slice(0, 10);
      }
    }
  }

  const sub = String(row.yes_sub_title ?? row.title ?? "");
  const playerName = sub.includes(":") ? sub.split(":")[0].trim() : null;

  return { teamAName, teamBName, kickoffDate, playerName };
}

/**
 * Resolve a Kalshi free-text team name ("New Orleans", "New York G",
 * "LA Rams") to a games.json abbreviation, scoped to a set of scheduled
 * games. Prefix/containment match on the normalized full name -- returns
 * null on zero or ambiguous (>1 distinct abbr) matches, never a guess.
 *
 * @param {string} kalshiName
 * @param {readonly {homeTeam:string,awayTeam:string,homeAbbr:string,awayAbbr:string}[]} games
 */
/** City-form aliases so a Kalshi name and a schedule name meet in the middle. */
function normalizeTeamText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\blos angeles\b/g, "la")
    .replace(/\bnew york\b/g, "ny")
    .replace(/\bfootball team\b/g, "commanders");
}

export function resolveKalshiTeamAbbr(kalshiName, games) {
  const needle = normalizeTeamText(kalshiName);
  if (!needle) return null;
  const hits = new Set();
  for (const game of Array.isArray(games) ? games : []) {
    for (const [full, abbr] of [
      [game.homeTeam, game.homeAbbr],
      [game.awayTeam, game.awayAbbr],
    ]) {
      const hay = normalizeTeamText(full);
      if (!hay || !abbr) continue;
      if (hay === needle || hay.startsWith(`${needle} `) || needle.startsWith(`${hay} `) || hay.includes(needle) || needle.includes(hay)) {
        hits.add(String(abbr).toLowerCase());
      }
    }
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/**
 * Derive one market-implied reference yardage line from a player's ladder.
 *
 * Rungs: [{ threshold, yesProbability }], any order. Rule:
 *   - Sort ascending by threshold. Require >= MIN_LADDER_RUNGS priced rungs.
 *   - Reject if YES probability rises by more than MONOTONICITY_TOLERANCE
 *     between consecutive ascending thresholds (malformed / stale book).
 *   - If a rung sits exactly at YES = 0.50, that threshold IS the reference
 *     (mode "exact_rung").
 *   - If two consecutive rungs bracket 0.50 (p_lo >= 0.5 > p_hi), linearly
 *     interpolate the threshold at p = 0.50 (mode "interpolated").
 *   - Otherwise (ladder entirely above or entirely below 0.50) fall back to
 *     the rung whose YES probability is closest to 0.50 (mode
 *     "nearest_rung"), recording which real rung was used.
 *
 * @returns {
 *   | { ok: true, referenceLine: number, mode: "interpolated"|"exact_rung"|"nearest_rung",
 *       bracket: null | { lowThreshold:number, lowYesProbability:number, highThreshold:number, highYesProbability:number },
 *       rungUsed: null | { threshold:number, yesProbability:number } }
 *   | { ok: false, reason: string }
 * }
 */
export function deriveReferenceLine(rungs) {
  const priced = (Array.isArray(rungs) ? rungs : [])
    .filter((r) => Number.isFinite(r?.threshold) && Number.isFinite(r?.yesProbability) && r.yesProbability > 0 && r.yesProbability < 1)
    .slice()
    .sort((a, b) => a.threshold - b.threshold);

  // Collapse duplicate thresholds (keep the one with the tighter/first price).
  const deduped = [];
  for (const rung of priced) {
    if (deduped.length > 0 && deduped[deduped.length - 1].threshold === rung.threshold) continue;
    deduped.push(rung);
  }
  if (deduped.length < MIN_LADDER_RUNGS) return { ok: false, reason: "insufficient_ladder" };

  for (let i = 1; i < deduped.length; i += 1) {
    if (deduped[i].yesProbability - deduped[i - 1].yesProbability > MONOTONICITY_TOLERANCE) {
      return { ok: false, reason: "non_monotonic_ladder" };
    }
  }

  const exact = deduped.find((r) => Math.abs(r.yesProbability - 0.5) < 1e-9);
  if (exact) {
    return { ok: true, referenceLine: exact.threshold, mode: "exact_rung", bracket: null, rungUsed: { ...exact } };
  }

  for (let i = 1; i < deduped.length; i += 1) {
    const lo = deduped[i - 1];
    const hi = deduped[i];
    if (lo.yesProbability >= 0.5 && hi.yesProbability < 0.5) {
      const span = lo.yesProbability - hi.yesProbability;
      const frac = span === 0 ? 0 : (lo.yesProbability - 0.5) / span;
      const referenceLine = lo.threshold + frac * (hi.threshold - lo.threshold);
      return {
        ok: true,
        referenceLine: Math.round(referenceLine * 10) / 10,
        mode: "interpolated",
        bracket: {
          lowThreshold: lo.threshold,
          lowYesProbability: lo.yesProbability,
          highThreshold: hi.threshold,
          highYesProbability: hi.yesProbability,
        },
        rungUsed: null,
      };
    }
  }

  // No 0.50 crossing -- ladder is entirely rich or entirely cheap.
  let nearest = deduped[0];
  for (const rung of deduped) {
    if (Math.abs(rung.yesProbability - 0.5) < Math.abs(nearest.yesProbability - 0.5)) nearest = rung;
  }
  return { ok: true, referenceLine: nearest.threshold, mode: "nearest_rung", bracket: null, rungUsed: { ...nearest } };
}

/**
 * YES probability -> American odds, for DISPLAY ONLY. This is a
 * presentation convenience so an exchange price can be eyeballed next to a
 * sportsbook row; it is NOT sportsbook juice and the raw cent price is
 * always kept alongside it. Returns null for degenerate probabilities.
 */
export function yesProbabilityToAmericanDisplay(probability) {
  const p = toNumber(probability);
  if (p == null || p <= 0 || p >= 1) return null;
  const american = p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100;
  return Math.round(american);
}

/** Cents (integer 0..100) from a dollars string/number, or null. */
export function toCents(value) {
  const n = toNumber(value);
  if (n == null || n < 0 || n > 1) return null;
  return Math.round(n * 100);
}

/**
 * Build one normalized ladder record from raw Kalshi market rows for a
 * single player (already grouped + identity-resolved by the caller).
 *
 * @param {{
 *   canonicalMarket: "passingYards"|"rushingYards"|"receivingYards",
 *   identity: { playerId:string, playerName:string, position:string, team:string, opponent:string, gameId:string, week:number },
 *   rawRows: readonly object[],
 *   now?: Date,
 * }} input
 * @returns {{ ok: true, record: object } | { ok: false, reason: string }}
 */
export function buildKalshiLadderRecord({ canonicalMarket, identity, rawRows, now = new Date() }) {
  const live = (Array.isArray(rawRows) ? rawRows : []).filter((row) => isLiveYardageMarket(row, now));
  if (live.length === 0) return { ok: false, reason: "closed_or_stale" };

  const rungs = [];
  for (const row of live) {
    const threshold = toNumber(row.floor_strike);
    const yesProbability = rungYesProbability(row);
    if (threshold == null || yesProbability == null) continue;
    rungs.push({
      threshold,
      yesProbability,
      ticker: String(row.ticker ?? ""),
      yesBidCents: toCents(row.yes_bid_dollars),
      yesAskCents: toCents(row.yes_ask_dollars),
      lastPriceCents: toCents(row.last_price_dollars),
    });
  }
  if (rungs.length < MIN_LADDER_RUNGS) return { ok: false, reason: "insufficient_priced_rungs" };

  const derived = deriveReferenceLine(rungs.map((r) => ({ threshold: r.threshold, yesProbability: r.yesProbability })));
  if (!derived.ok) return { ok: false, reason: derived.reason };

  const sortedRungs = rungs.slice().sort((a, b) => a.threshold - b.threshold);

  // Nearest ACTUAL tradable contract to the reference line -- this is the
  // one whose price we surface, so users see a real, bettable number.
  let nearestContract = sortedRungs[0];
  for (const rung of sortedRungs) {
    if (Math.abs(rung.threshold - derived.referenceLine) < Math.abs(nearestContract.threshold - derived.referenceLine)) {
      nearestContract = rung;
    }
  }
  const nearestYesMidCents =
    nearestContract.yesBidCents != null && nearestContract.yesAskCents != null
      ? Math.round((nearestContract.yesBidCents + nearestContract.yesAskCents) / 2)
      : nearestContract.lastPriceCents;

  const updatedAts = live
    .map((row) => Date.parse(row.updated_time ?? row.close_time ?? ""))
    .filter((ms) => Number.isFinite(ms));
  const updatedAt = updatedAts.length > 0 ? new Date(Math.max(...updatedAts)).toISOString() : now.toISOString();

  const record = {
    playerId: identity.playerId,
    playerName: identity.playerName,
    position: identity.position,
    team: identity.team,
    opponent: identity.opponent,
    gameId: identity.gameId,
    week: identity.week,
    canonicalMarket,
    source: "kalshi",
    /** DERIVED market-implied median yardage -- not a tradable contract. */
    referenceLine: derived.referenceLine,
    referenceLineMode: derived.mode,
    interpolationBracket: derived.bracket,
    referenceRungUsed: derived.rungUsed,
    /** Nearest real Kalshi contract, with its raw + display-converted price. */
    nearestContract: {
      ticker: nearestContract.ticker,
      threshold: nearestContract.threshold,
      yesBidCents: nearestContract.yesBidCents,
      yesAskCents: nearestContract.yesAskCents,
      yesMidCents: nearestYesMidCents,
      noMidCents: nearestYesMidCents == null ? null : 100 - nearestYesMidCents,
      americanFromYesMid: nearestYesMidCents == null ? null : yesProbabilityToAmericanDisplay(nearestYesMidCents / 100),
    },
    /** Every real rung + raw price, preserved for later distribution work. */
    ladder: sortedRungs.map((r) => ({
      ticker: r.ticker,
      threshold: r.threshold,
      yesBidCents: r.yesBidCents,
      yesAskCents: r.yesAskCents,
      lastPriceCents: r.lastPriceCents,
    })),
    externalEventTicker: String(live[0].event_ticker ?? ""),
    externalMarketId: nearestContract.ticker,
    closeTime: live[0].close_time ?? null,
    updatedAt,
    matchingConfidence: 1,
  };

  return { ok: true, record };
}
