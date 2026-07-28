/**
 * Provider-neutral PGA odds adapter: exact event matching, exact-market
 * isolation, best-price selection, sportsbook attribution, freshness, and
 * diagnostics.
 *
 * The concrete network provider implemented here is The Odds API, but every
 * function below that the selection layer consumes (matchTournamentEvent,
 * normalizeMarketOutcomes, selectBestPrice, computeMarketCompleteness) is a
 * pure transform over a plain-object shape any provider could produce. The
 * selection layer never touches a raw provider response.
 *
 * Fail-closed contract: this module NEVER falls back to the first event, an
 * "active" golf sport key, a major championship, or a partial/substring name
 * match. Any ambiguity or absence of a genuine match returns event: null with
 * a human-readable reason in `errors` -- callers must treat that as
 * "unavailable", never guess.
 */

import { americanToDecimal, overround, rawImpliedProbability } from "./pga-odds-math.mjs";
import {
  CANONICAL_MARKETS,
  EVENT_DATE_TOLERANCE_DAYS,
  MARKET_COMPLETENESS,
  ODDS_FRESHNESS_MAX_MINUTES,
} from "../config/pga-best-bets-config.mjs";

const PROVIDER_MARKET_KEY = Object.freeze({
  outright: "outrights",
  top5: "player_top_5_finisher",
  top10: "player_top_10_finisher",
  top20: "player_top_20_finisher",
});

/** Normalize a player or tournament name for exact-match comparison. Shared by the provider and the selection layer. */
export function normalizePlayerName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, "")
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeEventName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ /g, " ")
    .replace(/\[.*?\]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isGolfSport(sport) {
  const group = String(sport?.group ?? "").toLowerCase();
  const key = String(sport?.key ?? "").toLowerCase();
  return group.includes("golf") || key.includes("golf");
}

/** True when `commenceTime` falls within `toleranceDays` of `startDate` (both parseable dates). */
export function withinDateTolerance(commenceTime, startDate, toleranceDays = EVENT_DATE_TOLERANCE_DAYS) {
  if (!commenceTime || !startDate) return false;
  const commence = new Date(commenceTime);
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(commence.getTime()) || Number.isNaN(start.getTime())) return false;
  const diffDays = Math.abs(commence.getTime() - start.getTime()) / 86_400_000;
  return diffDays <= toleranceDays;
}

/**
 * Match exactly one provider event to the requested tournament.
 *
 * Validates, in order: (1) an explicitly known provider event id, (2)
 * normalized tournament-name identity, (3) explicitly configured aliases,
 * (4) start-date tolerance to break a name/alias tie, (5) provider event
 * identity is otherwise ambiguous -> fail closed.
 *
 * `events` must already be the full candidate set the caller wants
 * considered (e.g. every event returned across every golf sport key) --
 * this function never itself decides which sport key is "active".
 *
 * `config.knownProviderEventId` MUST be an ID in THIS PROVIDER's own
 * namespace (i.e. a value previously observed in one of `events[].id` from
 * this exact provider) -- never an internal schedule/tournament identity
 * (e.g. a PGA Tour schedule ID). The two ID spaces are unrelated; passing
 * the wrong one never matches, so it silently no-ops rather than erroring,
 * which can look like a stronger match tier is wired up when it isn't.
 */
export function matchTournamentEvent(events, config = {}) {
  const {
    tournamentName,
    aliases = [],
    startDate = null,
    toleranceDays = EVENT_DATE_TOLERANCE_DAYS,
    knownProviderEventId = null,
  } = config;

  if (!Array.isArray(events) || events.length === 0) {
    return { event: null, matchMethod: null, errors: ["no events returned by provider"] };
  }

  if (knownProviderEventId) {
    const byId = events.find((event) => String(event?.id ?? "") === String(knownProviderEventId));
    if (byId) return { event: byId, matchMethod: "provider-event-id", errors: [] };
  }

  const targetName = normalizeEventName(tournamentName);
  const aliasSet = new Set(aliases.map(normalizeEventName));
  if (!targetName && aliasSet.size === 0) {
    return { event: null, matchMethod: null, errors: ["no tournament name or alias configured to match against"] };
  }

  const eventDisplayName = (event) => event?.sport_title ?? event?.title ?? event?.home_team ?? "";

  const nameCandidates = events.filter((event) => {
    const normalized = normalizeEventName(eventDisplayName(event));
    return (targetName && normalized === targetName) || aliasSet.has(normalized);
  });

  if (nameCandidates.length === 0) {
    return {
      event: null,
      matchMethod: null,
      errors: [
        `no event matched tournament "${tournamentName}" by normalized name or configured alias -- refusing to fall back to an unrelated event, an "active" sport key, or a major championship`,
      ],
    };
  }

  if (nameCandidates.length === 1) {
    const [event] = nameCandidates;
    const normalized = normalizeEventName(eventDisplayName(event));
    const method = targetName && normalized === targetName ? "normalized-identity" : "alias";
    if (startDate) {
      if (!withinDateTolerance(event.commence_time, startDate, toleranceDays)) {
        return {
          event: null,
          matchMethod: null,
          errors: [
            `event name matched (${method}) but start time ${event.commence_time ?? "unknown"} is outside the ${toleranceDays}-day tolerance of expected start ${startDate}`,
          ],
        };
      }
      return { event, matchMethod: `${method}+date-tolerance`, errors: [] };
    }
    return { event, matchMethod: method, errors: [] };
  }

  // Multiple events shared a name/alias match -- date tolerance must resolve
  // this to exactly one, or the match fails closed as ambiguous.
  if (startDate) {
    const dated = nameCandidates.filter((event) => withinDateTolerance(event.commence_time, startDate, toleranceDays));
    if (dated.length === 1) return { event: dated[0], matchMethod: "date-tolerance", errors: [] };
  }
  return {
    event: null,
    matchMethod: null,
    errors: [
      `ambiguous event match: ${nameCandidates.length} provider events matched tournament name/alias and start-date tolerance did not resolve to exactly one`,
    ],
  };
}

/**
 * Normalize one bookmaker+market's raw outcomes into the provider-neutral
 * sportsbook-market outcome shape the selection layer consumes.
 */
export function normalizeMarketOutcomes(rawOutcomes, context) {
  const {
    canonicalMarket,
    providerMarketKey,
    sportsbookKey,
    sportsbookName,
    providerEventId,
    eventName,
    eventStartTime,
    marketTimestamp,
  } = context;

  if (!Array.isArray(rawOutcomes)) return [];

  return rawOutcomes
    .map((outcome) => {
      const americanOdds = Number(outcome?.price);
      const decimalOdds = americanToDecimal(americanOdds);
      const playerNameRaw = typeof outcome?.name === "string" ? outcome.name : "";
      if (!playerNameRaw || decimalOdds == null) return null;
      return {
        canonicalMarket,
        providerMarketKey,
        sportsbookKey,
        sportsbookName,
        providerEventId,
        eventName,
        eventStartTime,
        marketTimestamp,
        playerId: outcome?.player_id ?? outcome?.id ?? null,
        playerNameRaw,
        normalizedPlayerName: normalizePlayerName(playerNameRaw),
        americanOdds,
        decimalOdds,
      };
    })
    .filter(Boolean);
}

function isFresh(marketTimestamp, now, maxMinutes) {
  if (!marketTimestamp) return false;
  const ts = new Date(marketTimestamp).getTime();
  if (!Number.isFinite(ts)) return false;
  const ageMinutes = (now.getTime() - ts) / 60_000;
  return ageMinutes >= 0 && ageMinutes <= maxMinutes;
}

/**
 * Best valid decimal price for one player in one canonical market across all
 * normalized outcomes supplied (any sportsbook, any event -- callers should
 * already have filtered to one matched event before calling this). Returns
 * `{ price: null, rejectionReasons: [...] }` when no eligible price exists;
 * never falls back across markets or events.
 */
export function selectBestPrice(normalizedOutcomes, options) {
  const {
    canonicalMarket,
    normalizedPlayerName,
    providerEventId,
    freshnessMaxMinutes = ODDS_FRESHNESS_MAX_MINUTES,
    now = new Date(),
  } = options;

  const rejectionReasons = [];
  const candidates = (normalizedOutcomes ?? []).filter((outcome) => {
    if (outcome.canonicalMarket !== canonicalMarket) return false;
    if (providerEventId != null && String(outcome.providerEventId) !== String(providerEventId)) return false;
    if (outcome.normalizedPlayerName !== normalizedPlayerName) return false;
    return true;
  });

  if (candidates.length === 0) {
    return { price: null, rejectionReasons: ["no matching outcome for player/market/event"] };
  }

  const valid = [];
  for (const outcome of candidates) {
    if (!outcome.sportsbookKey) { rejectionReasons.push("missing sportsbook attribution"); continue; }
    if (!outcome.marketTimestamp) { rejectionReasons.push("missing market timestamp"); continue; }
    if (!Number.isFinite(outcome.americanOdds) || outcome.americanOdds === 0) { rejectionReasons.push("invalid American odds"); continue; }
    if (!Number.isFinite(outcome.decimalOdds) || outcome.decimalOdds <= 1) { rejectionReasons.push("invalid decimal odds"); continue; }
    if (!isFresh(outcome.marketTimestamp, now, freshnessMaxMinutes)) { rejectionReasons.push("stale price"); continue; }
    valid.push(outcome);
  }

  // Ambiguous player collision within the SAME sportsbook+market+event: two
  // distinct raw names normalized to the same key. Reject rather than guess.
  const byBook = new Map();
  for (const outcome of valid) {
    const bookKey = `${outcome.sportsbookKey}::${outcome.providerEventId}::${outcome.canonicalMarket}`;
    const existing = byBook.get(bookKey);
    if (existing && existing.playerNameRaw !== outcome.playerNameRaw) {
      rejectionReasons.push(`ambiguous player match within ${outcome.sportsbookName ?? outcome.sportsbookKey}: "${existing.playerNameRaw}" vs "${outcome.playerNameRaw}"`);
      byBook.set(bookKey, { ...existing, _ambiguous: true });
      continue;
    }
    byBook.set(bookKey, outcome);
  }
  const clean = [...byBook.values()].filter((outcome) => !outcome._ambiguous);

  if (clean.length === 0) {
    return { price: null, rejectionReasons: rejectionReasons.length ? rejectionReasons : ["no valid price survived validation"] };
  }

  const best = clean.reduce((a, b) => (b.decimalOdds > a.decimalOdds ? b : a));
  return {
    price: {
      american: best.americanOdds,
      decimal: best.decimalOdds,
      sportsbookKey: best.sportsbookKey,
      sportsbookName: best.sportsbookName,
      fetchedAt: best.marketTimestamp,
      eventId: best.providerEventId,
      eventName: best.eventName,
      market: best.canonicalMarket,
      providerMarketKey: best.providerMarketKey,
    },
    rejectionReasons: [],
  };
}

/**
 * Completeness metadata for ONE sportsbook's full market snapshot (every
 * listed outcome, not just recommended players). `completenessPassed` gates
 * whether a no-vig calculation from this snapshot may be trusted.
 */
export function computeMarketCompleteness(normalizedOutcomes, { officialFieldSize, modeledFieldSize } = {}) {
  const outcomeCount = (normalizedOutcomes ?? []).length;
  const decimalOddsList = (normalizedOutcomes ?? []).map((o) => o.decimalOdds);
  const marketOverround = overround(decimalOddsList);
  const officialFieldCoverage = officialFieldSize > 0 ? outcomeCount / officialFieldSize : 0;
  const modeledPlayerCoverage = modeledFieldSize > 0 ? outcomeCount / modeledFieldSize : 0;

  const completenessPassed =
    outcomeCount >= MARKET_COMPLETENESS.minOutcomeCount
    && officialFieldCoverage >= MARKET_COMPLETENESS.minOfficialFieldCoverage
    && modeledPlayerCoverage >= MARKET_COMPLETENESS.minModeledFieldCoverage
    && marketOverround != null
    && marketOverround <= MARKET_COMPLETENESS.maxOverround;

  return {
    outcomeCount,
    modeledPlayerCoverage,
    officialFieldCoverage,
    overround: marketOverround,
    completenessPassed,
  };
}

export function extractQuotaDiagnostics(response) {
  if (!response?.headers) return {};
  const get = (name) => {
    const raw = typeof response.headers.get === "function" ? response.headers.get(name) : response.headers[name];
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const requestsRemaining = get("x-requests-remaining");
  const requestsUsed = get("x-requests-used");
  const diagnostics = {};
  if (requestsRemaining != null) diagnostics.requestsRemaining = requestsRemaining;
  if (requestsUsed != null) diagnostics.requestsUsed = requestsUsed;
  return diagnostics;
}

function buildUnavailableResult({ providerKey, providerName, requestedTournament, fetchedAt, errors, quotaDiagnostics = {} }) {
  return {
    providerKey,
    providerName,
    requestedTournament,
    matchedEventName: null,
    providerEventId: null,
    eventStartTime: null,
    eventMatchStatus: "unmatched",
    marketsRequested: [...CANONICAL_MARKETS],
    marketsAvailable: [],
    fetchedAt,
    quotaDiagnostics,
    errors,
    sportsbookMarkets: [],
  };
}

/**
 * Fetch and normalize odds for one tournament across all four canonical
 * markets, using The Odds API. `fetchImpl` defaults to the global `fetch`
 * but MUST be injected with a fixture-backed stub in tests -- this function
 * must never be exercised against the live network in a test run.
 *
 * `knownProviderEventId` (see matchTournamentEvent) must be a genuine
 * previously-observed The-Odds-API event id, not our own schedule/
 * tournament identity -- pass null unless the caller actually has one.
 */
export async function fetchProviderOdds({
  apiKey,
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  baseUrl = "https://api.the-odds-api.com/v4",
  tournamentName,
  aliases = [],
  startDate = null,
  toleranceDays = EVENT_DATE_TOLERANCE_DAYS,
  knownProviderEventId = null,
  regions = "us",
  now = () => new Date(),
}) {
  const providerKey = "the-odds-api";
  const providerName = "The Odds API";
  const fetchedAt = now().toISOString();
  const quotaDiagnostics = {};

  if (!apiKey) {
    return buildUnavailableResult({ providerKey, providerName, requestedTournament: tournamentName, fetchedAt, errors: ["no odds API key configured"] });
  }
  if (typeof fetchImpl !== "function") {
    return buildUnavailableResult({ providerKey, providerName, requestedTournament: tournamentName, fetchedAt, errors: ["no fetch implementation available"] });
  }

  let sportsRes;
  try {
    sportsRes = await fetchImpl(`${baseUrl}/sports/?apiKey=${apiKey}`);
  } catch (error) {
    return buildUnavailableResult({ providerKey, providerName, requestedTournament: tournamentName, fetchedAt, errors: [`sports request failed: ${error instanceof Error ? error.message : error}`] });
  }
  Object.assign(quotaDiagnostics, extractQuotaDiagnostics(sportsRes));
  if (!sportsRes.ok) {
    return buildUnavailableResult({ providerKey, providerName, requestedTournament: tournamentName, fetchedAt, errors: [`sports request returned HTTP ${sportsRes.status}`], quotaDiagnostics });
  }
  const sports = await sportsRes.json();
  const golfSportKeys = (Array.isArray(sports) ? sports : []).filter(isGolfSport).map((s) => s.key);
  if (!golfSportKeys.length) {
    return buildUnavailableResult({ providerKey, providerName, requestedTournament: tournamentName, fetchedAt, errors: ["no golf sport keys available from provider"], quotaDiagnostics });
  }

  // Gather every candidate event across every golf sport key. Matching is
  // decided entirely by name/alias/date identity below -- never by which
  // sport key happens to be "active".
  const allEvents = [];
  for (const sportKey of golfSportKeys) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=${regions}&markets=outrights&oddsFormat=american`);
    } catch {
      continue;
    }
    Object.assign(quotaDiagnostics, extractQuotaDiagnostics(res));
    if (!res.ok) continue;
    const data = await res.json();
    if (Array.isArray(data)) {
      for (const event of data) allEvents.push({ ...event, _sportKey: sportKey });
    }
  }

  const { event, matchMethod, errors: matchErrors } = matchTournamentEvent(allEvents, {
    tournamentName,
    aliases,
    startDate,
    toleranceDays,
    knownProviderEventId,
  });

  if (!event) {
    return buildUnavailableResult({ providerKey, providerName, requestedTournament: tournamentName, fetchedAt, errors: matchErrors, quotaDiagnostics });
  }

  const eventName = event.sport_title ?? event.title ?? tournamentName;
  const sportKey = event._sportKey;
  const providerEventId = event.id;
  const sportsbookMarkets = [];

  const outrightBookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
  for (const bookmaker of outrightBookmakers) {
    const market = (bookmaker.markets ?? []).find((m) => m.key === "outrights") ?? bookmaker.markets?.[0];
    if (!market) continue;
    sportsbookMarkets.push(
      ...normalizeMarketOutcomes(market.outcomes, {
        canonicalMarket: "outright",
        providerMarketKey: PROVIDER_MARKET_KEY.outright,
        sportsbookKey: bookmaker.key,
        sportsbookName: bookmaker.title,
        providerEventId,
        eventName,
        eventStartTime: event.commence_time ?? null,
        marketTimestamp: market.last_update ?? bookmaker.last_update ?? null,
      }),
    );
  }

  const marketsAvailable = new Set(sportsbookMarkets.length ? ["outright"] : []);

  for (const canonicalMarket of ["top5", "top10", "top20"]) {
    const providerMarketKey = PROVIDER_MARKET_KEY[canonicalMarket];
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/sports/${sportKey}/events/${providerEventId}/odds?apiKey=${apiKey}&regions=${regions}&markets=${providerMarketKey}&oddsFormat=american`);
    } catch {
      continue;
    }
    Object.assign(quotaDiagnostics, extractQuotaDiagnostics(res));
    if (!res.ok) continue;
    const data = await res.json();
    const bookmakers = Array.isArray(data?.bookmakers) ? data.bookmakers : [];
    let found = false;
    for (const bookmaker of bookmakers) {
      const market = (bookmaker.markets ?? []).find((m) => m.key === providerMarketKey) ?? bookmaker.markets?.[0];
      if (!market) continue;
      const normalized = normalizeMarketOutcomes(market.outcomes, {
        canonicalMarket,
        providerMarketKey,
        sportsbookKey: bookmaker.key,
        sportsbookName: bookmaker.title,
        providerEventId,
        eventName,
        eventStartTime: event.commence_time ?? null,
        marketTimestamp: market.last_update ?? bookmaker.last_update ?? null,
      });
      if (normalized.length) found = true;
      sportsbookMarkets.push(...normalized);
    }
    if (found) marketsAvailable.add(canonicalMarket);
  }

  return {
    providerKey,
    providerName,
    requestedTournament: tournamentName,
    matchedEventName: eventName,
    providerEventId,
    eventStartTime: event.commence_time ?? null,
    eventMatchStatus: matchMethod,
    marketsRequested: [...CANONICAL_MARKETS],
    marketsAvailable: [...marketsAvailable],
    fetchedAt,
    quotaDiagnostics,
    errors: [],
    sportsbookMarkets,
  };
}
