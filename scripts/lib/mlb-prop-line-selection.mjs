/**
 * Canonical MLB player-prop line selection.
 *
 * The provider (ParlayAPI) returns *every* rung of a prop ladder under the
 * same `market_key`. A single `player_strikeouts` payload for one pitcher can
 * contain the real two-sided line (e.g. 5.5 Over -120 / Under -110) alongside
 * one-sided "N+ strikeouts" milestone rungs (6, 7, 8 ... 11) priced at long
 * odds. The same is true of `player_home_runs`, where the canonical
 * "to hit a home run" market (0.5) shares a market key with the 2+/3+/4+ HR
 * ladder.
 *
 * Selecting a prop therefore has to happen in two distinct stages:
 *
 *   1. Decide the primary *threshold* (point) using market structure only.
 *   2. Only then choose a price, and only from quotes at that exact threshold.
 *
 * Comparing prices before the threshold is settled is what produced lines such
 * as "11.0 Ks +1540" -- that is a real market, just not the pitcher's actual
 * strikeout prop. Nothing here inspects player identity, and no threshold
 * ceiling is hard-coded; selection is driven entirely by how many sportsbooks
 * offer each threshold and whether the threshold is a genuine two-sided market.
 */
import { formatAmerican, parseAmericanOdds } from "./mlb-moneyline-providers.mjs";
import { normalizeMlbPropName } from "./mlb-prop-name-normalizer.mjs";

export const HR_MARKET = "player_home_runs";
export const K_MARKET = "player_strikeouts";

/** Provider market keys that map onto a canonical market we publish. */
const PROVIDER_MARKET_ALIASES = new Map([
  ["player_home_runs", HR_MARKET],
  ["batter_home_runs", HR_MARKET],
  ["player_strikeouts", K_MARKET],
  ["pitcher_strikeouts", K_MARKET],
]);

/**
 * Provider market keys that self-identify as an alternate/ladder market.
 * These are excluded up front, but a quote also carries `isAlternate` so the
 * primary/alternate distinction survives ingestion instead of being discarded.
 */
const ALTERNATE_MARKET_PATTERN = /(^|_)(alt|alternate|alternates|milestone|milestones|ladder)(_|$)/;

/** Explicit boolean fields some feeds use to flag an alternate market. */
const ALTERNATE_FLAG_FIELDS = ["is_alternate", "isAlternate", "alternate"];

export function canonicalPropMarket(value) {
  const market = String(value ?? "").trim().toLowerCase();
  return PROVIDER_MARKET_ALIASES.get(market) ?? market;
}

export function isAlternateProviderMarket(value) {
  return ALTERNATE_MARKET_PATTERN.test(String(value ?? "").trim().toLowerCase());
}

function readAlternateFlag(row) {
  for (const field of ALTERNATE_FLAG_FIELDS) {
    const value = row?.[field];
    if (typeof value === "boolean") return value;
  }
  return null;
}

/**
 * Reject provider rows whose `player` field is not a person's name (the feed
 * occasionally emits header/enum artifacts such as "1", "2", "OptionTypeAbbr").
 * Structural check only -- no player is named or excluded by identity.
 */
function isPlausiblePlayerName(normalized) {
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  return tokens.every((token) => /[a-z]/.test(token));
}

function toPoint(value) {
  const point = Number(value);
  return Number.isFinite(point) && point > 0 ? point : null;
}

/**
 * Normalize one provider row into a quote that preserves the full market
 * identity: event + player + canonical market + provider market + threshold +
 * bookmaker, with both sides kept together so an Over can never be paired with
 * an Under from a different threshold.
 */
export function buildPropQuote(row) {
  const providerMarket = String(row?.market_key ?? "").trim().toLowerCase();
  const canonicalMarket = canonicalPropMarket(providerMarket);
  if (canonicalMarket !== HR_MARKET && canonicalMarket !== K_MARKET) return null;

  const player = normalizeMlbPropName(row?.player);
  if (!isPlausiblePlayerName(player)) return null;

  const bookmaker = String(row?.bookmaker ?? row?.source ?? "").trim().toLowerCase();
  if (!bookmaker) return null;

  const defaultPoint = canonicalMarket === HR_MARKET ? 0.5 : null;
  const point = toPoint(row?.line ?? defaultPoint);
  if (point == null) return null;

  const overPrice = parseAmericanOdds(row?.over_price);
  const underPrice = parseAmericanOdds(row?.under_price);
  if (overPrice == null && underPrice == null) return null;

  const flagged = readAlternateFlag(row);
  return {
    eventId: row?.event_id ?? row?.game_id ?? row?.eventId ?? null,
    bookmaker,
    player,
    providerPlayerName: row?.player ?? null,
    canonicalMarket,
    providerMarket,
    isAlternate: flagged ?? isAlternateProviderMarket(providerMarket),
    point,
    overPrice,
    underPrice,
    twoSided: overPrice != null && underPrice != null,
    providerOutcomeId: row?.outcome_id ?? row?.outcomeId ?? null,
    providerMarketId: row?.market_id ?? row?.marketId ?? null,
    lastUpdate: row?.last_update ?? row?.lastUpdate ?? null,
  };
}

export function buildPropQuotes(rows) {
  const quotes = [];
  let rejected = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const quote = buildPropQuote(row);
    if (quote) quotes.push(quote);
    else rejected += 1;
  }
  return { quotes, rejected };
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** Distinct-bookmaker tally per threshold. Input order never affects output. */
function tallyPoints(quotes) {
  const byPoint = new Map();
  for (const quote of quotes) {
    let entry = byPoint.get(quote.point);
    if (!entry) {
      entry = { point: quote.point, books: new Set(), twoSidedBooks: new Set(), quotes: [] };
      byPoint.set(quote.point, entry);
    }
    entry.books.add(quote.bookmaker);
    if (quote.twoSided) entry.twoSidedBooks.add(quote.bookmaker);
    entry.quotes.push(quote);
  }
  return [...byPoint.values()].sort((a, b) => a.point - b.point);
}

/**
 * Consensus threshold = the one offered by the most distinct sportsbooks.
 * Ties resolve to the lower threshold, which is deterministic and conservative:
 * ladder rungs extend away from the primary line, so the lower of two equally
 * supported thresholds is never the long-shot rung. Thresholds are never
 * averaged, and prices are not consulted here.
 */
function pickConsensusPoint(entries) {
  return entries
    .slice()
    .sort((a, b) => b.books.size - a.books.size || a.point - b.point)[0];
}

function bookRank(bookmaker, ranking) {
  const index = ranking.indexOf(bookmaker);
  return index === -1 ? ranking.length : index;
}

/**
 * Choose the quote to publish from among quotes at the already-selected
 * threshold. Two-sided quotes win, then book preference, then a price/name
 * tie-break so the result is a total order and cannot depend on array order.
 */
function pickQuoteAtPoint(quotes, ranking) {
  return quotes
    .slice()
    .sort(
      (a, b) =>
        Number(b.twoSided) - Number(a.twoSided) ||
        bookRank(a.bookmaker, ranking) - bookRank(b.bookmaker, ranking) ||
        (a.bookmaker < b.bookmaker ? -1 : a.bookmaker > b.bookmaker ? 1 : 0) ||
        (b.overPrice ?? 0) - (a.overPrice ?? 0) ||
        (b.underPrice ?? 0) - (a.underPrice ?? 0),
    )[0];
}

function sideQuotes(quotes, side) {
  const field = side === "over" ? "overPrice" : "underPrice";
  return quotes
    .filter((quote) => quote[field] != null)
    .map((quote) => ({ bookmaker: quote.bookmaker, price: formatAmerican(quote[field]) }))
    .sort((a, b) => (a.bookmaker < b.bookmaker ? -1 : a.bookmaker > b.bookmaker ? 1 : 0));
}

/**
 * Resolve the primary line for one player + canonical market.
 *
 * @returns {{ selection: object|null, diagnostics: object }}
 */
export function selectPrimaryLine(quotes, { bookRanking = [], requireTwoSided = false } = {}) {
  const warnings = [];
  const allPoints = tallyPoints(quotes);

  // 1. Provider-declared primary markets always beat declared alternates.
  const declaredPrimary = quotes.filter((quote) => !quote.isAlternate);
  const hasDeclaredAlternate = quotes.some((quote) => quote.isAlternate);
  const pool = declaredPrimary.length > 0 ? declaredPrimary : quotes;
  if (declaredPrimary.length === 0 && hasDeclaredAlternate) warnings.push("only_alternate_markets_offered");

  // 2. A standard prop is two-sided. Prefer thresholds that are actually
  //    priced on both sides before falling back to one-sided offerings.
  const twoSided = pool.filter((quote) => quote.twoSided);
  const usedTwoSided = twoSided.length > 0;
  const selectionPool = usedTwoSided ? twoSided : pool;
  let reason = declaredPrimary.length > 0 && hasDeclaredAlternate
    ? "provider_primary_metadata"
    : usedTwoSided
      ? "two_sided_consensus"
      : "one_sided_consensus";

  if (!usedTwoSided) warnings.push("no_two_sided_market");

  // 3. Consensus threshold across books, then price within that threshold.
  const entries = tallyPoints(selectionPool);
  const consensus = pickConsensusPoint(entries);
  if (!consensus) return { selection: null, diagnostics: { rejected: "no_quotes", warnings, points: [] } };

  const chosen = pickQuoteAtPoint(consensus.quotes, bookRanking);
  const atPoint = allPoints.find((entry) => entry.point === consensus.point) ?? consensus;

  if (chosen.isAlternate) warnings.push("alternate_market_selected");
  if (allPoints.length > 1 && consensus.point > Math.min(...allPoints.map((entry) => entry.point))) {
    // The canonical rung of a ladder is its lowest threshold. Selecting a
    // higher one is legitimate for strikeouts (lines differ by pitcher) but is
    // worth surfacing when the market is otherwise thin.
    if (consensus.books.size <= 1) warnings.push("thin_support_above_lowest_threshold");
  }

  const diagnostics = {
    player: chosen.player,
    providerPlayerName: chosen.providerPlayerName,
    canonicalMarket: chosen.canonicalMarket,
    providerMarket: chosen.providerMarket,
    selectedPoint: consensus.point,
    isAlternate: chosen.isAlternate,
    twoSided: chosen.twoSided,
    selectedBook: chosen.bookmaker,
    booksAtPoint: [...atPoint.books].sort(),
    overQuotes: sideQuotes(atPoint.quotes, "over"),
    underQuotes: sideQuotes(atPoint.quotes, "under"),
    pointsOffered: allPoints.map((entry) => ({
      point: entry.point,
      books: entry.books.size,
      twoSidedBooks: entry.twoSidedBooks.size,
    })),
    reason,
    warnings,
  };

  // 4. Defensive rejection: a strikeout prop with no two-sided market anywhere
  //    is a ladder rung, not a posted line. Publishing nothing is correct;
  //    publishing "11.0 Ks +1540" as a primary line is not.
  if (requireTwoSided && !chosen.twoSided) {
    return { selection: null, diagnostics: { ...diagnostics, rejected: "requires_two_sided_market" } };
  }

  return {
    selection: {
      player: chosen.player,
      providerPlayerName: chosen.providerPlayerName,
      canonicalMarket: chosen.canonicalMarket,
      providerMarket: chosen.providerMarket,
      eventId: chosen.eventId,
      bookmaker: chosen.bookmaker,
      isAlternate: chosen.isAlternate,
      point: consensus.point,
      over: formatAmerican(chosen.overPrice),
      under: formatAmerican(chosen.underPrice),
      overPrice: chosen.overPrice,
      underPrice: chosen.underPrice,
      twoSided: chosen.twoSided,
      booksAtPoint: atPoint.books.size,
      lastUpdate: chosen.lastUpdate,
      reason,
    },
    diagnostics,
  };
}

/**
 * Resolve primary lines for every player in one canonical market.
 *
 * @param {object[]} quotes  Quotes already limited to a single canonical market.
 * @param {object} options
 * @param {string[]} options.bookRanking     Preferred books, most preferred first.
 * @param {Set<string>} options.disallowedBooks Books excluded from sourcing a line.
 * @param {boolean} options.requireTwoSided  Reject one-sided selections.
 */
export function selectPrimaryLines(quotes, { bookRanking = [], disallowedBooks = new Set(), requireTwoSided = false } = {}) {
  const eligible = quotes.filter((quote) => !disallowedBooks.has(quote.bookmaker));
  const selections = new Map();
  const diagnostics = [];
  const rejections = [];

  for (const [player, playerQuotes] of groupBy(eligible, (quote) => quote.player)) {
    const { selection, diagnostics: detail } = selectPrimaryLine(playerQuotes, { bookRanking, requireTwoSided });
    if (selection) {
      selections.set(player, selection);
      diagnostics.push(detail);
    } else {
      rejections.push({ player, ...detail });
    }
  }

  return { selections, diagnostics, rejections };
}
