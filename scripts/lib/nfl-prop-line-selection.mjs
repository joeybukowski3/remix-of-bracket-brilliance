/**
 * Canonical NFL yardage-prop line selection (Phase 10B).
 *
 * ParlayAPI keeps standard and alternate/ladder NFL yardage props under
 * *separate* market-key families (unlike MLB, where both share one key):
 * `player_{passing,rushing,receiving}_yards` (also seen abbreviated as
 * `player_{pass,rush,reception}_yds`) is the standard two-sided market;
 * `player_{passing,rushing,receiving}_yards_milestones` is a one-sided
 * ladder. That separation is the PRIMARY exclusion mechanism here -- the
 * milestone family is simply never in `PROVIDER_MARKET_ALIASES`, so it never
 * becomes a quote. `isAlternate`/regex detection below is a defensive
 * fallback only, for any future provider key this alias map hasn't
 * catalogued yet. The live payload carries no `is_alternate` boolean.
 *
 * Even within the standard-market family, some players carry more than one
 * priced threshold (e.g. a secondary alt line sharing the standard key), so
 * a consensus-threshold step is still required before a price is chosen.
 *
 * A canonical v1 line may ONLY be sourced from an approved sportsbook (see
 * `nfl-book-classification.mjs`) and MUST be two-sided. There is no
 * fallback to a non-approved book or a one-sided price -- if no approved
 * book has a valid two-sided market for a player, the canonical market is
 * unavailable for that player, full stop. Non-approved observations
 * (exchange/DFS) are preserved separately for QA only.
 */
import { classifyBook, isApprovedSportsbook } from "./nfl-book-classification.mjs";
import { normalizeNflPropName } from "./nfl-prop-name-normalizer.mjs";

export const PASSING_YARDS_MARKET = "passingYards";
export const RUSHING_YARDS_MARKET = "rushingYards";
export const RECEIVING_YARDS_MARKET = "receivingYards";

export const CANONICAL_MARKETS = Object.freeze([
  PASSING_YARDS_MARKET,
  RUSHING_YARDS_MARKET,
  RECEIVING_YARDS_MARKET,
]);

/** Standard-family provider market keys observed live, mapped to the canonical name. Milestone/ladder keys are deliberately absent. */
const PROVIDER_MARKET_ALIASES = new Map([
  ["player_passing_yards", PASSING_YARDS_MARKET],
  ["player_pass_yds", PASSING_YARDS_MARKET],
  ["player_rushing_yards", RUSHING_YARDS_MARKET],
  ["player_rush_yds", RUSHING_YARDS_MARKET],
  ["player_receiving_yards", RECEIVING_YARDS_MARKET],
  ["player_reception_yds", RECEIVING_YARDS_MARKET],
]);

/** Provider market keys that self-identify as an alternate/ladder market. Defensive fallback only -- see module header. */
const ALTERNATE_MARKET_PATTERN = /(^|_)(alt|alternate|alternates|milestone|milestones|ladder)(_|$)/;

/** Plausible roster positions per market -- used by identity resolution, not here, but published for shared reuse. */
export const MARKET_PLAUSIBLE_POSITIONS = Object.freeze({
  [PASSING_YARDS_MARKET]: Object.freeze(["QB"]),
  [RUSHING_YARDS_MARKET]: Object.freeze(["QB", "RB", "WR"]),
  [RECEIVING_YARDS_MARKET]: Object.freeze(["WR", "TE", "RB"]),
});

export function canonicalPropMarket(providerMarketKey) {
  const key = String(providerMarketKey ?? "").trim().toLowerCase();
  if (ALTERNATE_MARKET_PATTERN.test(key)) return null;
  return PROVIDER_MARKET_ALIASES.get(key) ?? null;
}

export function isMilestoneProviderMarket(providerMarketKey) {
  return ALTERNATE_MARKET_PATTERN.test(String(providerMarketKey ?? "").trim().toLowerCase());
}

function parseAmericanOdds(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  const text = String(value).trim();
  if (!/^[+-]?\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatAmerican(price) {
  if (price == null || !Number.isFinite(price)) return null;
  return price > 0 ? `+${price}` : `${price}`;
}

function toPoint(value) {
  const point = Number(value);
  return Number.isFinite(point) && point > 0 ? point : null;
}

/**
 * Normalize one ParlayAPI row into a quote. Returns null for anything that
 * is not a standard-family yardage row (milestone rows, unparseable rows,
 * rows with neither price).
 */
export function buildYardageQuote(row) {
  const providerMarket = String(row?.market_key ?? "").trim().toLowerCase();
  const canonicalMarket = canonicalPropMarket(providerMarket);
  if (!canonicalMarket) return null;

  const player = normalizeNflPropName(row?.player);
  if (!player) return null;

  const bookmaker = String(row?.bookmaker ?? "").trim().toLowerCase();
  if (!bookmaker) return null;

  const point = toPoint(row?.line);
  if (point == null) return null;

  const overPrice = parseAmericanOdds(row?.over_price);
  const underPrice = parseAmericanOdds(row?.under_price);
  if (overPrice == null && underPrice == null) return null;

  return {
    eventId: row?.event_id ?? null,
    homeTeam: row?.home_team ?? null,
    awayTeam: row?.away_team ?? null,
    bookmaker,
    bookClass: classifyBook(bookmaker),
    player,
    providerPlayerName: row?.player ?? null,
    canonicalMarket,
    providerMarket,
    point,
    overPrice,
    underPrice,
    twoSided: overPrice != null && underPrice != null,
    lastUpdate: row?.last_update ?? null,
  };
}

export function buildYardageQuotes(rows) {
  const quotes = [];
  let rejected = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const quote = buildYardageQuote(row);
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

function tallyPoints(quotes) {
  const byPoint = new Map();
  for (const quote of quotes) {
    let entry = byPoint.get(quote.point);
    if (!entry) {
      entry = { point: quote.point, books: new Set(), quotes: [] };
      byPoint.set(quote.point, entry);
    }
    entry.books.add(quote.bookmaker);
    entry.quotes.push(quote);
  }
  return [...byPoint.values()].sort((a, b) => a.point - b.point);
}

/** Ties resolve to the lower threshold -- deterministic, and never the long-shot side of a secondary alt line. */
function pickConsensusPoint(entries) {
  return entries.slice().sort((a, b) => b.books.size - a.books.size || a.point - b.point)[0];
}

function bookRank(bookmaker, ranking) {
  const index = ranking.indexOf(bookmaker);
  return index === -1 ? ranking.length : index;
}

function pickQuoteAtPoint(quotes, ranking) {
  return quotes
    .slice()
    .sort(
      (a, b) =>
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
 * Resolve the canonical line for one player + one canonical market from
 * quotes already restricted to that player. Approved-sportsbook and
 * two-sided are both hard requirements -- there is no fallback tier.
 *
 * @param {object[]} quotes  All quotes for one player (any book/threshold).
 * @param {{ approvedBookRanking?: string[] }} options
 */
export function selectCanonicalLine(quotes, { approvedBookRanking = [] } = {}) {
  const approvedTwoSided = quotes.filter((quote) => isApprovedSportsbook(quote.bookmaker) && quote.twoSided);

  const rawDiagnostics = {
    totalQuotes: quotes.length,
    approvedBooksObserved: [...new Set(quotes.filter((q) => isApprovedSportsbook(q.bookmaker)).map((q) => q.bookmaker))].sort(),
    nonApprovedBooksObserved: [...new Set(quotes.filter((q) => !isApprovedSportsbook(q.bookmaker)).map((q) => q.bookmaker))].sort(),
  };

  if (approvedTwoSided.length === 0) {
    return {
      selection: null,
      diagnostics: {
        ...rawDiagnostics,
        rejected: quotes.some((q) => isApprovedSportsbook(q.bookmaker))
          ? "approved_book_present_but_one_sided_only"
          : "no_approved_sportsbook_quote",
      },
    };
  }

  const entries = tallyPoints(approvedTwoSided);
  const consensus = pickConsensusPoint(entries);
  const chosen = pickQuoteAtPoint(consensus.quotes, approvedBookRanking);
  const allPoints = tallyPoints(approvedTwoSided);

  const diagnostics = {
    ...rawDiagnostics,
    player: chosen.player,
    providerPlayerName: chosen.providerPlayerName,
    canonicalMarket: chosen.canonicalMarket,
    providerMarket: chosen.providerMarket,
    selectedPoint: consensus.point,
    selectedBook: chosen.bookmaker,
    booksAtPoint: [...consensus.books].sort(),
    overQuotes: sideQuotes(consensus.quotes, "over"),
    underQuotes: sideQuotes(consensus.quotes, "under"),
    pointsOffered: allPoints.map((entry) => ({ point: entry.point, books: entry.books.size })),
    reason: "two_sided_approved_book_consensus",
  };

  return {
    selection: {
      player: chosen.player,
      providerPlayerName: chosen.providerPlayerName,
      canonicalMarket: chosen.canonicalMarket,
      providerMarket: chosen.providerMarket,
      eventId: chosen.eventId,
      homeTeam: chosen.homeTeam,
      awayTeam: chosen.awayTeam,
      bookmaker: chosen.bookmaker,
      point: consensus.point,
      over: formatAmerican(chosen.overPrice),
      under: formatAmerican(chosen.underPrice),
      overPrice: chosen.overPrice,
      underPrice: chosen.underPrice,
      booksAtPoint: consensus.books.size,
      lastUpdate: chosen.lastUpdate,
      reason: "two_sided_approved_book_consensus",
    },
    diagnostics,
  };
}

/**
 * Resolve canonical lines for every player in one canonical market.
 * Grouping key is (player, eventId) rather than player alone -- a normalized
 * name collision across two different games must never merge two real
 * players' quotes into one selection.
 */
export function selectCanonicalLines(quotes, { approvedBookRanking = [] } = {}) {
  const selections = [];
  const diagnostics = [];
  const rejections = [];

  for (const [, playerQuotes] of groupBy(quotes, (q) => `${q.player}|${q.eventId}`)) {
    const { selection, diagnostics: detail } = selectCanonicalLine(playerQuotes, { approvedBookRanking });
    if (selection) {
      selections.push(selection);
      diagnostics.push(detail);
    } else {
      rejections.push({ player: playerQuotes[0]?.player, eventId: playerQuotes[0]?.eventId, ...detail });
    }
  }

  return { selections, diagnostics, rejections };
}
