import { describe, expect, test, vi } from "vitest";
import {
  computeMarketCompleteness,
  extractQuotaDiagnostics,
  fetchProviderOdds,
  matchTournamentEvent,
  normalizeEventName,
  normalizeMarketOutcomes,
  normalizePlayerName,
  selectBestPrice,
  withinDateTolerance,
} from "./pga-odds-provider.mjs";

const rocketClassic = {
  id: "evt-rocket-classic",
  sport_title: "Rocket Classic",
  commence_time: "2026-07-30T13:00:00Z",
  bookmakers: [
    {
      key: "draftkings",
      title: "DraftKings",
      last_update: "2026-07-28T09:00:00Z",
      markets: [
        {
          key: "outrights",
          last_update: "2026-07-28T09:00:00Z",
          outcomes: [
            { name: "Cameron Young", price: 900 },
            { name: "Ben Griffin", price: -110 },
          ],
        },
      ],
    },
  ],
};

const scottishOpen = {
  id: "evt-scottish-open",
  sport_title: "Scottish Open",
  commence_time: "2026-07-09T13:00:00Z",
  bookmakers: [],
};

describe("normalizeEventName / normalizePlayerName", () => {
  test("normalizes punctuation and diacritics", () => {
    expect(normalizeEventName("The 3M Open [2026]")).toBe("the 3m open");
    expect(normalizePlayerName("José María Olazábal Jr.")).toBe("jose maria olazabal");
  });
});

describe("withinDateTolerance", () => {
  test("true within tolerance", () => {
    expect(withinDateTolerance("2026-07-30T13:00:00Z", "2026-07-30", 2)).toBe(true);
    expect(withinDateTolerance("2026-08-01T00:00:00Z", "2026-07-30", 2)).toBe(true);
  });

  test("false outside tolerance", () => {
    expect(withinDateTolerance("2026-08-05T13:00:00Z", "2026-07-30", 2)).toBe(false);
  });

  test("false for missing/invalid input", () => {
    expect(withinDateTolerance(null, "2026-07-30", 2)).toBe(false);
    expect(withinDateTolerance("2026-07-30T13:00:00Z", null, 2)).toBe(false);
    expect(withinDateTolerance("not a date", "2026-07-30", 2)).toBe(false);
  });
});

describe("matchTournamentEvent", () => {
  test("exact normalized tournament match", () => {
    const result = matchTournamentEvent([rocketClassic, scottishOpen], { tournamentName: "Rocket Classic" });
    expect(result.event.id).toBe("evt-rocket-classic");
    expect(result.matchMethod).toBe("normalized-identity");
    expect(result.errors).toEqual([]);
  });

  test("explicit alias match", () => {
    const result = matchTournamentEvent([rocketClassic], { tournamentName: "The Detroit Golf Classic", aliases: ["Rocket Classic"] });
    expect(result.event.id).toBe("evt-rocket-classic");
    expect(result.matchMethod).toBe("alias");
  });

  test("normalized punctuation match", () => {
    const punctuated = { ...rocketClassic, sport_title: "Rocket  Classic!!" };
    const result = matchTournamentEvent([punctuated], { tournamentName: "Rocket Classic" });
    expect(result.event).toBeTruthy();
  });

  test("date-tolerance match confirms a name match", () => {
    const result = matchTournamentEvent([rocketClassic], { tournamentName: "Rocket Classic", startDate: "2026-07-30", toleranceDays: 2 });
    expect(result.event.id).toBe("evt-rocket-classic");
    expect(result.matchMethod).toBe("normalized-identity+date-tolerance");
  });

  test("date mismatch fails closed even with a name match", () => {
    const result = matchTournamentEvent([rocketClassic], { tournamentName: "Rocket Classic", startDate: "2026-09-01", toleranceDays: 2 });
    expect(result.event).toBeNull();
    expect(result.errors[0]).toMatch(/outside the/);
  });

  test("unrelated event is rejected, never substituted", () => {
    const result = matchTournamentEvent([scottishOpen], { tournamentName: "Rocket Classic" });
    expect(result.event).toBeNull();
    expect(result.errors[0]).toMatch(/no event matched/);
  });

  test("no first-event fallback: empty match set never returns events[0]", () => {
    const result = matchTournamentEvent([scottishOpen, rocketClassic], { tournamentName: "Something Else Entirely" });
    expect(result.event).toBeNull();
  });

  test("no active-golf fallback: matching never depends on an 'active' flag", () => {
    const inactiveMatch = { ...rocketClassic, active: false };
    const result = matchTournamentEvent([inactiveMatch], { tournamentName: "Rocket Classic" });
    expect(result.event).toBeTruthy();
  });

  test("provider event id match takes precedence", () => {
    const result = matchTournamentEvent([rocketClassic, scottishOpen], {
      tournamentName: "irrelevant name",
      knownProviderEventId: "evt-scottish-open",
    });
    expect(result.event.id).toBe("evt-scottish-open");
    expect(result.matchMethod).toBe("provider-event-id");
  });

  test("a PGA Tour schedule ID is not treated as a provider event ID: it never matches by id, and falls through to name matching instead of failing or mismatching", () => {
    // "R2026524" is a real-shaped PGA Tour schedule identity (see
    // public/data/pga/current-field.json's tournamentId), not anything The
    // Odds API would ever assign as event.id.
    const result = matchTournamentEvent([rocketClassic, scottishOpen], {
      tournamentName: "Rocket Classic",
      knownProviderEventId: "R2026524",
    });
    expect(result.event.id).toBe("evt-rocket-classic");
    expect(result.matchMethod).not.toBe("provider-event-id");
    expect(result.matchMethod).toBe("normalized-identity");
  });

  test("a schedule ID that happens to collide with no event still fails closed when no name matches either", () => {
    const result = matchTournamentEvent([scottishOpen], {
      tournamentName: "Rocket Classic",
      knownProviderEventId: "R2026524",
    });
    expect(result.event).toBeNull();
    expect(result.errors[0]).toMatch(/no event matched/);
  });

  test("ambiguous duplicate names fail closed", () => {
    const duplicate = { ...rocketClassic, id: "evt-rocket-classic-2" };
    const result = matchTournamentEvent([rocketClassic, duplicate], { tournamentName: "Rocket Classic" });
    expect(result.event).toBeNull();
    expect(result.errors[0]).toMatch(/ambiguous/);
  });

  test("no events returned", () => {
    const result = matchTournamentEvent([], { tournamentName: "Rocket Classic" });
    expect(result.event).toBeNull();
    expect(result.errors[0]).toMatch(/no events returned/);
  });
});

describe("normalizeMarketOutcomes", () => {
  test("normalizes valid outcomes and drops invalid ones", () => {
    const result = normalizeMarketOutcomes(
      [
        { name: "Cameron Young", price: 900 },
        { name: "", price: 500 },
        { name: "Bad Odds", price: 0 },
      ],
      {
        canonicalMarket: "outright",
        providerMarketKey: "outrights",
        sportsbookKey: "draftkings",
        sportsbookName: "DraftKings",
        providerEventId: "evt-1",
        eventName: "Rocket Classic",
        eventStartTime: "2026-07-30T13:00:00Z",
        marketTimestamp: "2026-07-28T09:00:00Z",
      },
    );
    expect(result).toHaveLength(1);
    expect(result[0].normalizedPlayerName).toBe("cameron young");
    expect(result[0].decimalOdds).toBeCloseTo(10, 5);
  });

  test("empty/non-array input yields empty output", () => {
    expect(normalizeMarketOutcomes(null, {})).toEqual([]);
    expect(normalizeMarketOutcomes(undefined, {})).toEqual([]);
  });

  test("outcome-order invariance: same inputs in different order normalize identically per-entry", () => {
    const context = {
      canonicalMarket: "outright",
      providerMarketKey: "outrights",
      sportsbookKey: "dk",
      sportsbookName: "DraftKings",
      providerEventId: "evt-1",
      eventName: "Rocket Classic",
      eventStartTime: null,
      marketTimestamp: "2026-07-28T09:00:00Z",
    };
    const a = normalizeMarketOutcomes([{ name: "A", price: 100 }, { name: "B", price: 200 }], context);
    const b = normalizeMarketOutcomes([{ name: "B", price: 200 }, { name: "A", price: 100 }], context);
    const byName = (arr) => Object.fromEntries(arr.map((o) => [o.normalizedPlayerName, o.decimalOdds]));
    expect(byName(a)).toEqual(byName(b));
  });
});

const NOW = new Date("2026-07-28T10:00:00Z");

function outcome(overrides = {}) {
  return {
    canonicalMarket: "outright",
    providerMarketKey: "outrights",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    providerEventId: "evt-1",
    eventName: "Rocket Classic",
    eventStartTime: "2026-07-30T13:00:00Z",
    marketTimestamp: "2026-07-28T09:00:00Z",
    playerNameRaw: "Cameron Young",
    normalizedPlayerName: "cameron young",
    americanOdds: 900,
    decimalOdds: 10,
    ...overrides,
  };
}

describe("selectBestPrice", () => {
  test("best price across multiple sportsbooks", () => {
    const outcomes = [
      outcome({ sportsbookKey: "draftkings", decimalOdds: 9 }),
      outcome({ sportsbookKey: "fanduel", sportsbookName: "FanDuel", decimalOdds: 11, americanOdds: 1000 }),
    ];
    const { price } = selectBestPrice(outcomes, { canonicalMarket: "outright", normalizedPlayerName: "cameron young", providerEventId: "evt-1", now: NOW });
    expect(price.sportsbookKey).toBe("fanduel");
    expect(price.decimal).toBe(11);
  });

  test("sportsbook attribution and timestamp populate the normalized price", () => {
    const { price } = selectBestPrice([outcome()], { canonicalMarket: "outright", normalizedPlayerName: "cameron young", providerEventId: "evt-1", now: NOW });
    expect(price.sportsbookName).toBe("DraftKings");
    expect(price.fetchedAt).toBe("2026-07-28T09:00:00Z");
    expect(price.eventId).toBe("evt-1");
    expect(price.market).toBe("outright");
  });

  test("stale price rejected", () => {
    const stale = outcome({ marketTimestamp: "2026-07-20T09:00:00Z" });
    const { price, rejectionReasons } = selectBestPrice([stale], { canonicalMarket: "outright", normalizedPlayerName: "cameron young", providerEventId: "evt-1", now: NOW });
    expect(price).toBeNull();
    expect(rejectionReasons).toContain("stale price");
  });

  test("missing timestamp rejected", () => {
    const { price, rejectionReasons } = selectBestPrice([outcome({ marketTimestamp: null })], { canonicalMarket: "outright", normalizedPlayerName: "cameron young", providerEventId: "evt-1", now: NOW });
    expect(price).toBeNull();
    expect(rejectionReasons).toContain("missing market timestamp");
  });

  test("invalid price rejected", () => {
    const { price, rejectionReasons } = selectBestPrice([outcome({ americanOdds: NaN, decimalOdds: NaN })], { canonicalMarket: "outright", normalizedPlayerName: "cameron young", providerEventId: "evt-1", now: NOW });
    expect(price).toBeNull();
    expect(rejectionReasons.length).toBeGreaterThan(0);
  });

  test("event mismatch rejected (no cross-event leakage)", () => {
    const { price } = selectBestPrice([outcome({ providerEventId: "evt-other" })], { canonicalMarket: "outright", normalizedPlayerName: "cameron young", providerEventId: "evt-1", now: NOW });
    expect(price).toBeNull();
  });

  test("wrong market rejected (exact-market isolation, no cross-market fallback)", () => {
    const { price } = selectBestPrice([outcome({ canonicalMarket: "top10" })], { canonicalMarket: "outright", normalizedPlayerName: "cameron young", providerEventId: "evt-1", now: NOW });
    expect(price).toBeNull();
  });

  test("ambiguous player match rejected: two different raw names collide", () => {
    const a = outcome({ playerNameRaw: "Sam Kim", normalizedPlayerName: "sam kim" });
    const b = outcome({ playerNameRaw: "Samuel Kim", normalizedPlayerName: "sam kim" });
    const { price, rejectionReasons } = selectBestPrice([a, b], { canonicalMarket: "outright", normalizedPlayerName: "sam kim", providerEventId: "evt-1", now: NOW });
    expect(price).toBeNull();
    expect(rejectionReasons.some((r) => r.includes("ambiguous player match"))).toBe(true);
  });

  test("bookmaker-order invariance: best price is order-independent", () => {
    const outcomes1 = [
      outcome({ sportsbookKey: "dk", decimalOdds: 9 }),
      outcome({ sportsbookKey: "fd", decimalOdds: 11 }),
    ];
    const outcomes2 = [...outcomes1].reverse();
    const r1 = selectBestPrice(outcomes1, { canonicalMarket: "outright", normalizedPlayerName: "cameron young", providerEventId: "evt-1", now: NOW });
    const r2 = selectBestPrice(outcomes2, { canonicalMarket: "outright", normalizedPlayerName: "cameron young", providerEventId: "evt-1", now: NOW });
    expect(r1.price.decimal).toBe(r2.price.decimal);
    expect(r1.price.sportsbookKey).toBe(r2.price.sportsbookKey);
  });

  test("no matching outcome at all", () => {
    const { price, rejectionReasons } = selectBestPrice([], { canonicalMarket: "outright", normalizedPlayerName: "nobody", providerEventId: "evt-1", now: NOW });
    expect(price).toBeNull();
    expect(rejectionReasons).toContain("no matching outcome for player/market/event");
  });
});

describe("computeMarketCompleteness", () => {
  test("complete market accepted", () => {
    // 60 outcomes at decimal ~54.5 sums to an overround of ~1.1 -- a realistic,
    // mostly-complete golf outright board, not an artificially thin one.
    const outcomes = Array.from({ length: 60 }, (_, i) => outcome({ normalizedPlayerName: `player ${i}`, decimalOdds: 54.5 }));
    const result = computeMarketCompleteness(outcomes, { officialFieldSize: 70, modeledFieldSize: 65 });
    expect(result.completenessPassed).toBe(true);
    expect(result.outcomeCount).toBe(60);
  });

  test("incomplete market rejected: too few outcomes", () => {
    const outcomes = [outcome(), outcome({ normalizedPlayerName: "b" })];
    const result = computeMarketCompleteness(outcomes, { officialFieldSize: 70, modeledFieldSize: 65 });
    expect(result.completenessPassed).toBe(false);
  });

  test("official-field coverage below threshold rejected", () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => outcome({ normalizedPlayerName: `p${i}`, decimalOdds: 20 }));
    const result = computeMarketCompleteness(outcomes, { officialFieldSize: 100, modeledFieldSize: 12 });
    expect(result.officialFieldCoverage).toBeLessThan(0.5);
    expect(result.completenessPassed).toBe(false);
  });

  test("modeled-field coverage below threshold rejected", () => {
    const outcomes = Array.from({ length: 40 }, (_, i) => outcome({ normalizedPlayerName: `p${i}`, decimalOdds: 20 }));
    const result = computeMarketCompleteness(outcomes, { officialFieldSize: 45, modeledFieldSize: 100 });
    expect(result.modeledPlayerCoverage).toBeLessThan(0.6);
    expect(result.completenessPassed).toBe(false);
  });

  test("no-vig uses the entire supplied market, not a subset", () => {
    const full = Array.from({ length: 60 }, (_, i) => outcome({ normalizedPlayerName: `p${i}`, decimalOdds: 60 }));
    const result = computeMarketCompleteness(full, { officialFieldSize: 60, modeledFieldSize: 60 });
    expect(result.overround).toBeCloseTo(1, 5);
  });
});

describe("extractQuotaDiagnostics", () => {
  test("extracts numeric quota headers", () => {
    const response = { headers: { get: (name) => (name === "x-requests-remaining" ? "42" : name === "x-requests-used" ? "8" : null) } };
    expect(extractQuotaDiagnostics(response)).toEqual({ requestsRemaining: 42, requestsUsed: 8 });
  });

  test("returns empty object with no headers", () => {
    expect(extractQuotaDiagnostics({})).toEqual({});
  });
});

function jsonResponse(body, { ok = true, status = 200, headers = {} } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => headers[name] ?? null },
    json: async () => body,
  };
}

describe("fetchProviderOdds (fixture-backed, no live network)", () => {
  test("no API key returns unavailable with diagnostic error", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchProviderOdds({ apiKey: null, fetchImpl, tournamentName: "Rocket Classic" });
    expect(result.errors[0]).toMatch(/no odds API key/);
    expect(result.sportsbookMarkets).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("matches event and normalizes outright + placement markets from fixtures", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes("/sports/?")) {
        return jsonResponse([{ key: "golf_pga_championship_winner", group: "Golf", active: true }]);
      }
      if (url.includes("/odds/?")) {
        return jsonResponse([rocketClassic]);
      }
      if (url.includes("player_top_5_finisher")) {
        return jsonResponse({
          bookmakers: [{ key: "draftkings", title: "DraftKings", last_update: "2026-07-28T09:00:00Z", markets: [{ key: "player_top_5_finisher", last_update: "2026-07-28T09:00:00Z", outcomes: [{ name: "Cameron Young", price: 400 }] }] }],
        });
      }
      return jsonResponse({ bookmakers: [] });
    });

    const result = await fetchProviderOdds({
      apiKey: "test-key",
      fetchImpl,
      tournamentName: "Rocket Classic",
      startDate: "2026-07-30",
      now: () => new Date("2026-07-28T10:00:00Z"),
    });

    expect(result.errors).toEqual([]);
    expect(result.matchedEventName).toBe("Rocket Classic");
    expect(result.marketsAvailable).toEqual(expect.arrayContaining(["outright", "top5"]));
    expect(result.sportsbookMarkets.some((o) => o.canonicalMarket === "outright" && o.normalizedPlayerName === "cameron young")).toBe(true);
  });

  test("no matching event -> unavailable with diagnostics, never a fallback event", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes("/sports/?")) return jsonResponse([{ key: "golf_x", group: "Golf" }]);
      if (url.includes("/odds/?")) return jsonResponse([scottishOpen]);
      return jsonResponse({ bookmakers: [] });
    });

    const result = await fetchProviderOdds({ apiKey: "test-key", fetchImpl, tournamentName: "Rocket Classic" });
    expect(result.matchedEventName).toBeNull();
    expect(result.sportsbookMarkets).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("no golf sports available -> unavailable", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ key: "basketball_nba", group: "Basketball" }]));
    const result = await fetchProviderOdds({ apiKey: "test-key", fetchImpl, tournamentName: "Rocket Classic" });
    expect(result.errors[0]).toMatch(/no golf sport keys/);
  });

  test("quota diagnostics captured from responses", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes("/sports/?")) return jsonResponse([{ key: "golf_x", group: "Golf" }], { headers: { "x-requests-remaining": "500" } });
      if (url.includes("/odds/?")) return jsonResponse([rocketClassic], { headers: { "x-requests-remaining": "499" } });
      return jsonResponse({ bookmakers: [] });
    });
    const result = await fetchProviderOdds({ apiKey: "test-key", fetchImpl, tournamentName: "Rocket Classic" });
    expect(result.quotaDiagnostics.requestsRemaining).toBe(499);
  });
});
