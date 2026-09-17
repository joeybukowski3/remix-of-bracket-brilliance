import { describe, expect, it } from "vitest";
import {
  ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY,
  ANYTIME_TD_EXCHANGE_MARKET_KEY,
  ANYTIME_TD_PRIMARY_MARKET_KEY,
  buildAnytimeTdQuotes,
  computeMarketImpliedProbability,
  dedupeBovadaAliasQuotes,
  isSegmentedProviderPlayerName,
  resolveAnytimeTdForCandidate,
  selectAnytimeTdBestPrices,
  selectBestAnytimeTdPrice,
  stripProviderPlayerDecoration,
} from "./nfl-anytime-td-selection.mjs";

function row(overrides = {}) {
  return {
    event_id: "evt1",
    home_team: "Cincinnati Bengals",
    away_team: "Cleveland Browns",
    bookmaker: "draftkings",
    player: "Ja'Marr Chase",
    market_key: ANYTIME_TD_PRIMARY_MARKET_KEY,
    line: 0,
    over_price: 160,
    under_price: null,
    last_update: "2026-09-09T16:13:25Z",
    ...overrides,
  };
}

describe("isSegmentedProviderPlayerName / stripProviderPlayerDecoration", () => {
  it("flags compact quarter/half suffixes", () => {
    expect(isSegmentedProviderPlayerName("A.J. Brown (NE) - 1Q")).toBe(true);
    expect(isSegmentedProviderPlayerName("A.J. Brown (NE) - 2H")).toBe(true);
    expect(isSegmentedProviderPlayerName("A.J. Brown (NE) - 4Q")).toBe(true);
  });

  it("does not flag a full-game row", () => {
    expect(isSegmentedProviderPlayerName("A.J. Brown (NE)")).toBe(false);
    expect(isSegmentedProviderPlayerName("Ja'Marr Chase")).toBe(false);
  });

  it("strips team-parenthetical decoration for identity resolution", () => {
    expect(stripProviderPlayerDecoration("A.J. Brown (NE)")).toBe("A.J. Brown");
  });
});

describe("buildAnytimeTdQuotes", () => {
  it("accepts the primary scorer market", () => {
    const { quotes, rejections } = buildAnytimeTdQuotes([row()]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].providerMarket).toBe(ANYTIME_TD_PRIMARY_MARKET_KEY);
    expect(quotes[0].overPrice).toBe(160);
    expect(rejections).toEqual({ segmented: 0, nonScorerMarket: 0, malformed: 0 });
  });

  it("accepts the Bovada duplicate alias market", () => {
    const { quotes } = buildAnytimeTdQuotes([row({ market_key: ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY, bookmaker: "bovada" })]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].providerMarket).toBe(ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY);
  });

  it("excludes the novig exchange market entirely", () => {
    const { quotes, rejections } = buildAnytimeTdQuotes([
      row({ market_key: ANYTIME_TD_EXCHANGE_MARKET_KEY, bookmaker: "novig", line: 0.5, over_price: 199, under_price: -250 }),
    ]);
    expect(quotes).toHaveLength(0);
    expect(rejections.nonScorerMarket).toBe(1);
  });

  it("excludes 1H/2H/1Q/2Q/3Q/4Q segmented rows", () => {
    const rows = ["1H", "2H", "1Q", "2Q", "3Q", "4Q"].map((segment) => row({ player: `Ja'Marr Chase - ${segment}` }));
    const { quotes, rejections } = buildAnytimeTdQuotes(rows);
    expect(quotes).toHaveLength(0);
    expect(rejections.segmented).toBe(6);
  });

  it("rejects a row with no usable over_price", () => {
    const { quotes, rejections } = buildAnytimeTdQuotes([row({ over_price: null })]);
    expect(quotes).toHaveLength(0);
    expect(rejections.malformed).toBe(1);
  });

  it("tallies every observed market_key, including rejected ones", () => {
    const { marketKeyCounts } = buildAnytimeTdQuotes([
      row(),
      row({ market_key: ANYTIME_TD_EXCHANGE_MARKET_KEY, bookmaker: "novig" }),
    ]);
    expect(marketKeyCounts).toEqual({ [ANYTIME_TD_PRIMARY_MARKET_KEY]: 1, [ANYTIME_TD_EXCHANGE_MARKET_KEY]: 1 });
  });
});

describe("dedupeBovadaAliasQuotes", () => {
  function bovadaQuote(overrides = {}) {
    const { quotes } = buildAnytimeTdQuotes([row({ bookmaker: "bovada", market_key: ANYTIME_TD_PRIMARY_MARKET_KEY, ...overrides })]);
    return quotes[0];
  }

  it("collapses identical-price duplicates into one row", () => {
    const a = bovadaQuote({ over_price: 160, last_update: "2026-09-09T16:00:00Z" });
    const b = bovadaQuote({ market_key: ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY, over_price: 160, last_update: "2026-09-09T16:05:00Z" });
    const { quotes, collapsedCount } = dedupeBovadaAliasQuotes([a, b]);
    expect(quotes).toHaveLength(1);
    expect(collapsedCount).toBe(1);
  });

  it("collapses differing-price duplicates, keeping only one row", () => {
    const a = bovadaQuote({ over_price: 150, last_update: "2026-09-09T16:00:00Z" });
    const b = bovadaQuote({ market_key: ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY, over_price: 160, last_update: "2026-09-09T16:05:00Z" });
    const { quotes, collapsedCount } = dedupeBovadaAliasQuotes([a, b]);
    expect(quotes).toHaveLength(1);
    expect(collapsedCount).toBe(1);
  });

  it("the newer alias wins by last_update, regardless of market_key", () => {
    const older = bovadaQuote({ market_key: ANYTIME_TD_PRIMARY_MARKET_KEY, over_price: 150, last_update: "2026-09-09T15:00:00Z" });
    const newer = bovadaQuote({ market_key: ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY, over_price: 165, last_update: "2026-09-09T16:00:00Z" });
    const { quotes } = dedupeBovadaAliasQuotes([older, newer]);
    expect(quotes[0].overPrice).toBe(165);
    expect(quotes[0].providerMarket).toBe(ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY);
  });

  it("on a last_update tie, prefers player_anytime_touchdown_scorer deterministically", () => {
    const alias = bovadaQuote({ market_key: ANYTIME_TD_BOVADA_ALIAS_MARKET_KEY, over_price: 150, last_update: "2026-09-09T16:00:00Z" });
    const primary = bovadaQuote({ market_key: ANYTIME_TD_PRIMARY_MARKET_KEY, over_price: 160, last_update: "2026-09-09T16:00:00Z" });
    const { quotes } = dedupeBovadaAliasQuotes([alias, primary]);
    expect(quotes[0].providerMarket).toBe(ANYTIME_TD_PRIMARY_MARKET_KEY);
    expect(quotes[0].overPrice).toBe(160);
  });

  it("leaves a single, non-duplicated Bovada row untouched", () => {
    const only = bovadaQuote({ over_price: 160 });
    const { quotes, collapsedCount } = dedupeBovadaAliasQuotes([only]);
    expect(quotes).toHaveLength(1);
    expect(collapsedCount).toBe(0);
  });

  it("never touches non-Bovada rows, even with duplicate-shaped market_keys", () => {
    const { quotes: dkQuotes } = buildAnytimeTdQuotes([row({ bookmaker: "draftkings" })]);
    const { quotes, collapsedCount } = dedupeBovadaAliasQuotes(dkQuotes);
    expect(quotes).toHaveLength(1);
    expect(collapsedCount).toBe(0);
  });
});

describe("selectBestAnytimeTdPrice", () => {
  function quoteFor(bookmaker, overPrice, extra = {}) {
    const { quotes } = buildAnytimeTdQuotes([row({ bookmaker, over_price: overPrice, ...extra })]);
    return quotes[0];
  }

  it("accepts approved books", () => {
    const best = selectBestAnytimeTdPrice([quoteFor("draftkings", 160)]);
    expect(best.bookmaker).toBe("draftkings");
  });

  it("excludes unknown/exchange books from best-price selection", () => {
    const best = selectBestAnytimeTdPrice([quoteFor("novig", 500), quoteFor("prizepicks", 500)]);
    expect(best).toBeNull();
  });

  it("selects the best positive odds (+160 beats +155)", () => {
    const best = selectBestAnytimeTdPrice([quoteFor("draftkings", 160), quoteFor("fanduel", 155)]);
    expect(best.bookmaker).toBe("draftkings");
    expect(best.overPrice).toBe(160);
  });

  it("selects the best negative odds (-105 beats -120)", () => {
    const best = selectBestAnytimeTdPrice([quoteFor("draftkings", -120), quoteFor("fanduel", -105)]);
    expect(best.bookmaker).toBe("fanduel");
    expect(best.overPrice).toBe(-105);
  });

  it("selects correctly across mixed positive/negative prices (+120 beats -105)", () => {
    const best = selectBestAnytimeTdPrice([quoteFor("draftkings", -105), quoteFor("fanduel", 120)]);
    expect(best.bookmaker).toBe("fanduel");
    expect(best.overPrice).toBe(120);
  });

  it("rejects a quote with a missing over_price before it reaches selection", () => {
    const { quotes } = buildAnytimeTdQuotes([row({ bookmaker: "draftkings", over_price: null })]);
    expect(quotes).toHaveLength(0);
  });

  it("breaks an exact-price tie using the approved-book rank order", () => {
    const best = selectBestAnytimeTdPrice([quoteFor("bovada", 150), quoteFor("draftkings", 150)]);
    expect(best.bookmaker).toBe("draftkings");
  });
});

describe("selectAnytimeTdBestPrices", () => {
  it("groups by player+event and resolves one best price per group", () => {
    const rows = [
      row({ event_id: "evt1", player: "Ja'Marr Chase", bookmaker: "draftkings", over_price: 160 }),
      row({ event_id: "evt1", player: "Ja'Marr Chase", bookmaker: "fanduel", over_price: 150 }),
      row({ event_id: "evt2", player: "Ja'Marr Chase", bookmaker: "caesars", over_price: 200 }),
    ];
    const { quotes } = buildAnytimeTdQuotes(rows);
    const { selections } = selectAnytimeTdBestPrices(quotes);
    expect(selections).toHaveLength(2);
    const evt1 = selections.find((s) => s.eventId === "evt1");
    expect(evt1.bookmaker).toBe("draftkings");
  });

  it("reports a rejection when only unapproved books have a price", () => {
    const { quotes } = buildAnytimeTdQuotes([row({ bookmaker: "novig" })]);
    // novig never enters buildAnytimeTdQuotes since it only posts the exchange market -- simulate an unapproved scorer-market book instead.
    const { quotes: unapproved } = buildAnytimeTdQuotes([row({ bookmaker: "fanatics" })]);
    const { selections, rejections } = selectAnytimeTdBestPrices([...quotes, ...unapproved]);
    expect(selections).toHaveLength(0);
    expect(rejections.length).toBeGreaterThan(0);
  });
});

describe("resolveAnytimeTdForCandidate", () => {
  const canonicalMarket = {
    "gsis:001": {
      playerId: "gsis:001", gameId: "2026_01_CIN_CLE", anytimeTdOdds: 160, anytimeTdBook: "draftkings",
      marketImpliedProbability: 0.3846, oddsUpdatedAt: "2026-09-09T16:13:25Z",
    },
  };

  it("resolves available odds before kickoff", () => {
    const result = resolveAnytimeTdForCandidate(
      { playerId: "gsis:001", gameId: "2026_01_CIN_CLE", kickoff: "2026-09-14T17:00:00Z" },
      canonicalMarket,
      Date.parse("2026-09-10T00:00:00Z"),
    );
    expect(result).toEqual({ anytimeTdOdds: 160, anytimeTdBook: "draftkings", marketImpliedProbability: 0.3846, oddsUpdatedAt: "2026-09-09T16:13:25Z", oddsSourceState: "available" });
  });

  it("marks the market suspended once kickoff has passed, without touching JKB TD Score inputs", () => {
    const result = resolveAnytimeTdForCandidate(
      { playerId: "gsis:001", gameId: "2026_01_CIN_CLE", kickoff: "2026-09-14T17:00:00Z" },
      canonicalMarket,
      Date.parse("2026-09-14T18:00:00Z"),
    );
    expect(result.oddsSourceState).toBe("suspended");
    expect(result.anytimeTdOdds).toBe(160);
  });

  it("resolves unavailable when the player has no canonical entry", () => {
    const result = resolveAnytimeTdForCandidate({ playerId: "gsis:999", gameId: "2026_01_CIN_CLE", kickoff: null }, canonicalMarket);
    expect(result).toEqual({ anytimeTdOdds: null, anytimeTdBook: null, marketImpliedProbability: null, oddsUpdatedAt: null, oddsSourceState: "unavailable" });
  });

  it("fails closed to unavailable when playerId matches but gameId does not (stale cross-week entry)", () => {
    const result = resolveAnytimeTdForCandidate({ playerId: "gsis:001", gameId: "2026_02_CIN_CLE", kickoff: null }, canonicalMarket);
    expect(result.oddsSourceState).toBe("unavailable");
    expect(result.anytimeTdOdds).toBeNull();
  });

  it("resolves unavailable when there is no market artifact at all", () => {
    const result = resolveAnytimeTdForCandidate({ playerId: "gsis:001", gameId: "2026_01_CIN_CLE", kickoff: null }, undefined);
    expect(result.oddsSourceState).toBe("unavailable");
  });
});

describe("computeMarketImpliedProbability", () => {
  it("computes the positive-odds formula", () => {
    expect(computeMarketImpliedProbability(160)).toBeCloseTo(100 / 260, 4);
  });

  it("computes the negative-odds formula", () => {
    expect(computeMarketImpliedProbability(-160)).toBeCloseTo(160 / 260, 4);
  });

  it("returns null for a missing or non-finite price", () => {
    expect(computeMarketImpliedProbability(null)).toBeNull();
    expect(computeMarketImpliedProbability(Number.NaN)).toBeNull();
  });
});
