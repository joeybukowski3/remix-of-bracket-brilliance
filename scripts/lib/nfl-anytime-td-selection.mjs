/**
 * Canonical NFL Anytime Touchdown market selection.
 *
 * Live ParlayAPI characterization (read-only probes, see conversation
 * record) established that `markets=player_anytime_td` returns THREE
 * distinct market_key families, not one:
 *
 *   - player_anytime_touchdown_scorer  -- the real approved-book market.
 *     One-sided "price to score a TD anytime" quote per player/book, no
 *     two-sided line, `line` is a non-meaningful placeholder (0 or absent).
 *     draftkings, fanduel, caesars, and bovada were observed here live.
 *   - anytime_touchdown_scorer         -- a Bovada-only duplicate alias of
 *     the row above. Never treated as an independent book -- see
 *     `dedupeBovadaAliasQuotes`.
 *   - player_anytime_td                -- a Novig-only two-sided EXCHANGE
 *     line market (0.5 = anytime TD, 1.5 = 2+ TDs, 2.5 = 3+ TDs). No
 *     approved book was observed here. Deliberately excluded: this module
 *     never builds a quote from it.
 *
 * Only the first two families -- collectively "the scorer markets" -- are
 * ever turned into a quote here. betmgm and pinnacle currently return zero
 * rows for this market in the live feed; that is a real, expected empty
 * state (see `selectAnytimeTdBestPrices` rejections), not a bug.
 */
import { APPROVED_SPORTSBOOKS, classifyBook, isApprovedSportsbook } from "./nfl-book-classification.mjs";
import { formatAmerican } from "./nfl-prop-line-selection.mjs";
import { normalizeNflPropName } from "./nfl-prop-name-normalizer.mjs";

export const ANYTIME_TD_MARKET = "anytimeTd";
export const ANYTIME_TD_PRIMARY_MARKET_KEY = "player_anytime_touchdown_scorer";
export const ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY = "anytime_touchdown_scorer";
export const ANYTIME_TD_EXCHANGE_MARKET_KEY = "player_anytime_td";

/** Plausible roster positions for the anytime-TD market -- passing TDs are irrelevant to the JKB scorer model, but a QB can score rushing/receiving TDs. */
export const ANYTIME_TD_PLAUSIBLE_POSITIONS = Object.freeze(["QB", "RB", "WR", "TE"]);
export { APPROVED_SPORTSBOOKS };

/**
 * Segment/period suffix patterns observed live in the ParlayAPI `player`
 * field for sub-game props, e.g. "A.J. Brown (NE) - 1Q", "... - 2H". Also
 * defends against spelled-out equivalents ("1st Half") no live row used but
 * a future provider revision plausibly would.
 */
const SEGMENT_SUFFIX_PATTERN = /-\s*(1H|2H|1Q|2Q|3Q|4Q)\s*$|\b(1st|2nd|first|second)\s+(half|quarter)\b/i;

export function isSegmentedProviderPlayerName(rawName) {
  return SEGMENT_SUFFIX_PATTERN.test(String(rawName ?? ""));
}

/**
 * Strips provider-appended " (TEAM)" and " - <segment>" decoration so the
 * remainder is a bare player name suitable for roster-identity
 * normalization. Only removes exact bracket/suffix decoration -- never
 * guesses at or rewrites the underlying name text.
 */
export function stripProviderPlayerDecoration(rawName) {
  return String(rawName ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/-\s*(1H|2H|1Q|2Q|3Q|4Q)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmericanOdds(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  const text = String(value).trim();
  if (!/^[+-]?\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestampMs(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function bookRank(bookmaker, ranking) {
  const index = ranking.indexOf(bookmaker);
  return index === -1 ? ranking.length : index;
}

/**
 * Normalize ParlayAPI rows into anytime-TD quotes. Rejects (does not
 * quote): rows outside the two scorer market_key aliases (including the
 * novig exchange market and any unrecognized key), segmented/sub-period
 * rows, and rows missing a usable bookmaker/player/over_price. Returns
 * per-reason counts plus a full market_key tally for QA.
 */
export function buildAnytimeTdQuotes(rows) {
  const quotes = [];
  const rejections = { segmented: 0, nonScorerMarket: 0, malformed: 0 };
  const marketKeyCounts = {};

  for (const row of Array.isArray(rows) ? rows : []) {
    const providerMarket = String(row?.market_key ?? "").trim().toLowerCase();
    marketKeyCounts[providerMarket] = (marketKeyCounts[providerMarket] ?? 0) + 1;

    if (providerMarket !== ANYTIME_TD_PRIMARY_MARKET_KEY && providerMarket !== ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY) {
      rejections.nonScorerMarket += 1;
      continue;
    }

    const rawPlayerName = row?.player;
    if (isSegmentedProviderPlayerName(rawPlayerName)) {
      rejections.segmented += 1;
      continue;
    }

    const bookmaker = String(row?.bookmaker ?? "").trim().toLowerCase();
    const decoratedName = stripProviderPlayerDecoration(rawPlayerName);
    const player = normalizeNflPropName(decoratedName);
    const overPrice = parseAmericanOdds(row?.over_price);
    if (!bookmaker || !player || overPrice == null) {
      rejections.malformed += 1;
      continue;
    }

    quotes.push({
      eventId: row?.event_id ?? null,
      homeTeam: row?.home_team ?? null,
      awayTeam: row?.away_team ?? null,
      bookmaker,
      bookClass: classifyBook(bookmaker),
      providerPlayerName: rawPlayerName ?? null,
      // Decoration-stripped but NOT identity-normalized -- this is the shape
      // `resolvePlayerIdentity` (nfl-roster-identity.mjs) expects, since it
      // normalizes internally. `player` below is the already-normalized
      // grouping/dedupe key and must never be re-normalized or fed back in.
      decoratedName,
      player,
      providerMarket,
      overPrice,
      lastUpdate: row?.last_update ?? null,
    });
  }

  return { quotes, rejections, marketKeyCounts };
}

/**
 * Collapses Bovada's two duplicate scorer-market aliases (see module
 * header) into one row per player+event before any cross-book comparison
 * happens. Non-Bovada quotes pass through untouched -- no other book was
 * observed posting the same scorer prop under two market_key values.
 *
 * Rule: keep the most recently updated row; if `last_update` ties (or
 * neither timestamp parses), prefer `player_anytime_touchdown_scorer`.
 */
export function dedupeBovadaAliasQuotes(quotes) {
  const bovada = quotes.filter((quote) => quote.bookmaker === "bovada");
  const others = quotes.filter((quote) => quote.bookmaker !== "bovada");

  const groups = new Map();
  for (const quote of bovada) {
    const key = `${quote.player}|${quote.eventId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(quote);
    else groups.set(key, [quote]);
  }

  const deduped = [];
  let collapsedCount = 0;
  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }
    collapsedCount += group.length - 1;
    const winner = group.slice().sort((a, b) => {
      const timeA = parseTimestampMs(a.lastUpdate);
      const timeB = parseTimestampMs(b.lastUpdate);
      if (timeA != null && timeB != null && timeA !== timeB) return timeB - timeA;
      if (timeA != null && timeB == null) return -1;
      if (timeA == null && timeB != null) return 1;
      const aPrimary = a.providerMarket === ANYTIME_TD_PRIMARY_MARKET_KEY;
      const bPrimary = b.providerMarket === ANYTIME_TD_PRIMARY_MARKET_KEY;
      if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
      return 0;
    })[0];
    deduped.push(winner);
  }

  return { quotes: [...others, ...deduped], collapsedCount };
}

/**
 * Selects the single best (highest signed American odds) approved-book
 * anytime-TD price from a set of quotes already restricted to one
 * player+event. Returns null when no approved book has a usable price --
 * there is no fallback to an unapproved book.
 *
 * Tie-break order: approved-book rank order (`approvedBookRanking`), then
 * most recent `last_update`, then bookmaker name (deterministic, stable).
 */
export function selectBestAnytimeTdPrice(quotes, { approvedBookRanking = APPROVED_SPORTSBOOKS } = {}) {
  const approved = quotes.filter((quote) => isApprovedSportsbook(quote.bookmaker) && Number.isFinite(quote.overPrice));
  if (approved.length === 0) return null;

  const sorted = approved.slice().sort((a, b) => {
    if (b.overPrice !== a.overPrice) return b.overPrice - a.overPrice;
    const rankDiff = bookRank(a.bookmaker, approvedBookRanking) - bookRank(b.bookmaker, approvedBookRanking);
    if (rankDiff !== 0) return rankDiff;
    const timeA = parseTimestampMs(a.lastUpdate);
    const timeB = parseTimestampMs(b.lastUpdate);
    if (timeA != null && timeB != null && timeA !== timeB) return timeB - timeA;
    if (timeA != null && timeB == null) return -1;
    if (timeA == null && timeB != null) return 1;
    return a.bookmaker < b.bookmaker ? -1 : a.bookmaker > b.bookmaker ? 1 : 0;
  });

  return sorted[0];
}

/**
 * Resolves the best approved-book anytime-TD price for every distinct
 * player+event in `quotes`. Grouping by (player, eventId) rather than
 * player alone prevents a normalized-name collision across two different
 * games from merging two real players' quotes into one selection.
 */
export function selectAnytimeTdBestPrices(quotes, { approvedBookRanking = APPROVED_SPORTSBOOKS } = {}) {
  const groups = new Map();
  for (const quote of quotes) {
    const key = `${quote.player}|${quote.eventId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(quote);
    else groups.set(key, [quote]);
  }

  const selections = [];
  const rejections = [];
  for (const group of groups.values()) {
    const best = selectBestAnytimeTdPrice(group, { approvedBookRanking });
    if (!best) {
      rejections.push({ player: group[0]?.player, eventId: group[0]?.eventId, reason: "no_approved_sportsbook_quote" });
      continue;
    }
    selections.push(best);
  }

  return { selections, rejections };
}

/**
 * American odds -> vig-inclusive market-implied probability (0-1), rounded
 * to 4 decimal places. This is descriptive sportsbook context only -- it is
 * NOT devigged and must never be labeled a "fair" or "true" probability.
 */
export function computeMarketImpliedProbability(americanOdds) {
  if (americanOdds == null || !Number.isFinite(americanOdds)) return null;
  const probability = americanOdds > 0 ? 100 / (americanOdds + 100) : -americanOdds / (-americanOdds + 100);
  return Number(probability.toFixed(4));
}

export { formatAmerican };

/**
 * Resolves the anytime-TD fields for one touchdown-preview candidate by
 * joining on canonical gsis playerId against the market artifact's
 * `canonical` map. Also requires the candidate's `gameId` to match the
 * market entry's `gameId` -- joining on playerId alone risks attaching a
 * stale prior-week quote to this week's candidate row if the market
 * artifact has not refreshed since a bye or schedule change. `now` is
 * injectable for deterministic testing; defaults to the real clock.
 *
 * Odds are presentation/market context only -- a missing or suspended
 * market entry always resolves to nulls here and must never affect JKB TD
 * Score, which is computed independently upstream.
 */
export function resolveAnytimeTdForCandidate({ playerId, gameId, kickoff }, canonicalMarket, now = Date.now()) {
  const entry = canonicalMarket?.[playerId];
  const matched = entry && entry.gameId === gameId ? entry : null;

  if (!matched) {
    return { anytimeTdOdds: null, anytimeTdBook: null, marketImpliedProbability: null, oddsUpdatedAt: null, oddsSourceState: "unavailable" };
  }

  const kickoffMs = kickoff ? Date.parse(kickoff) : null;
  const gameStarted = Number.isFinite(kickoffMs) && now >= kickoffMs;

  return {
    anytimeTdOdds: matched.anytimeTdOdds ?? null,
    anytimeTdBook: matched.anytimeTdBook ?? null,
    marketImpliedProbability: matched.marketImpliedProbability ?? null,
    oddsUpdatedAt: matched.oddsUpdatedAt ?? null,
    oddsSourceState: gameStarted ? "suspended" : "available",
  };
}
