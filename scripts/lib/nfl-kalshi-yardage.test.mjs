import { describe, expect, it } from "vitest";
import {
  buildKalshiLadderRecord,
  deriveReferenceLine,
  isLiveYardageMarket,
  parseKalshiMarketContext,
  resolveKalshiTeamAbbr,
  rungYesProbability,
  yesProbabilityToAmericanDisplay,
} from "./nfl-kalshi-yardage.mjs";

const NOW = new Date("2026-09-11T12:00:00Z");

function rawRow(overrides = {}) {
  return {
    ticker: "KXNFLPASSYDS-26SEP13NODET-NOTSHOUGH6-275",
    event_ticker: "KXNFLPASSYDS-26SEP13NODET",
    status: "active",
    close_time: "2026-09-15T17:00:00Z",
    updated_time: "2026-09-11T10:00:00Z",
    floor_strike: 274.5,
    yes_bid_dollars: "0.48",
    yes_ask_dollars: "0.52",
    last_price_dollars: "0.50",
    yes_sub_title: "Tyler Shough: 275+",
    rules_primary:
      "If Tyler Shough records 275+ passing yards in the New Orleans vs Detroit Pro Football game originally scheduled for Sep 13, 2026, then the market resolves to Yes.",
    ...overrides,
  };
}

describe("rungYesProbability", () => {
  it("returns the bid/ask midpoint for a healthy two-sided book", () => {
    expect(rungYesProbability(rawRow({ yes_bid_dollars: "0.40", yes_ask_dollars: "0.50" }))).toBeCloseTo(0.45);
  });
  it("falls back to last trade when a crossed book is present", () => {
    expect(rungYesProbability(rawRow({ yes_bid_dollars: "0.60", yes_ask_dollars: "0.40", last_price_dollars: "0.55" }))).toBeCloseTo(0.55);
  });
  it("returns null when there is no usable price", () => {
    expect(rungYesProbability(rawRow({ yes_bid_dollars: "0", yes_ask_dollars: "0", last_price_dollars: "0" }))).toBeNull();
  });
});

describe("isLiveYardageMarket", () => {
  it("accepts an open, unexpired contract", () => {
    expect(isLiveYardageMarket(rawRow(), NOW)).toBe(true);
  });
  it("rejects a closed/settled market", () => {
    expect(isLiveYardageMarket(rawRow({ status: "settled" }), NOW)).toBe(false);
  });
  it("rejects a market whose close_time is already past", () => {
    expect(isLiveYardageMarket(rawRow({ close_time: "2026-09-10T00:00:00Z" }), NOW)).toBe(false);
  });
});

describe("parseKalshiMarketContext", () => {
  it("extracts both team names, kickoff date and player name from the rules text", () => {
    const ctx = parseKalshiMarketContext(rawRow());
    expect(ctx).toEqual({
      teamAName: "New Orleans",
      teamBName: "Detroit",
      kickoffDate: "2026-09-13",
      playerName: "Tyler Shough",
    });
  });
  it("falls back to the event-ticker date code when the rules text has no date", () => {
    const ctx = parseKalshiMarketContext(rawRow({ rules_primary: "If Tyler Shough records 275+ passing yards in the New Orleans vs Detroit Pro Football game, then Yes." }));
    expect(ctx.kickoffDate).toBe("2026-09-13");
  });
});

describe("resolveKalshiTeamAbbr", () => {
  const games = [
    { homeTeam: "Detroit Lions", awayTeam: "New Orleans Saints", homeAbbr: "det", awayAbbr: "no" },
    { homeTeam: "New York Giants", awayTeam: "Dallas Cowboys", homeAbbr: "nyg", awayAbbr: "dal" },
  ];
  it("resolves a city-only Kalshi name by prefix match", () => {
    expect(resolveKalshiTeamAbbr("New Orleans", games)).toBe("no");
    expect(resolveKalshiTeamAbbr("Detroit", games)).toBe("det");
  });
  it("resolves a truncated Kalshi name (New York G) against the full schedule name", () => {
    expect(resolveKalshiTeamAbbr("New York G", games)).toBe("nyg");
  });
  it("returns null when nothing matches", () => {
    expect(resolveKalshiTeamAbbr("Toronto", games)).toBeNull();
  });
});

describe("deriveReferenceLine", () => {
  it("interpolates the YES=0.50 crossing between two bracketing rungs", () => {
    const result = deriveReferenceLine([
      { threshold: 75, yesProbability: 0.58 },
      { threshold: 100, yesProbability: 0.38 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("interpolated");
    // 0.58 -> 0.38 spans 0.20; 0.50 is 0.08 below the low rung -> 40% of the way.
    expect(result.referenceLine).toBeCloseTo(85, 1);
  });

  it("uses the exact rung when a rung sits precisely at YES=0.50", () => {
    const result = deriveReferenceLine([
      { threshold: 50, yesProbability: 0.7 },
      { threshold: 80, yesProbability: 0.5 },
      { threshold: 110, yesProbability: 0.3 },
    ]);
    expect(result).toMatchObject({ ok: true, mode: "exact_rung", referenceLine: 80 });
  });

  it("falls back to the nearest rung when the ladder never crosses 0.50 (one-sided)", () => {
    const result = deriveReferenceLine([
      { threshold: 15, yesProbability: 0.44 },
      { threshold: 25, yesProbability: 0.2 },
    ]);
    expect(result).toMatchObject({ ok: true, mode: "nearest_rung", referenceLine: 15 });
    expect(result.rungUsed).toMatchObject({ threshold: 15 });
  });

  it("rejects a ladder with fewer than two priced rungs", () => {
    expect(deriveReferenceLine([{ threshold: 50, yesProbability: 0.5 }])).toEqual({ ok: false, reason: "insufficient_ladder" });
  });

  it("rejects a non-monotonic / malformed ladder", () => {
    const result = deriveReferenceLine([
      { threshold: 50, yesProbability: 0.4 },
      { threshold: 80, yesProbability: 0.75 },
      { threshold: 110, yesProbability: 0.2 },
    ]);
    expect(result).toEqual({ ok: false, reason: "non_monotonic_ladder" });
  });

  it("tolerates a tiny probability wobble within MONOTONICITY_TOLERANCE", () => {
    const result = deriveReferenceLine([
      { threshold: 50, yesProbability: 0.6 },
      { threshold: 80, yesProbability: 0.61 },
      { threshold: 110, yesProbability: 0.35 },
    ]);
    expect(result.ok).toBe(true);
  });

  it("handles a sparse but valid ladder (two far-apart rungs bracketing 0.50)", () => {
    const result = deriveReferenceLine([
      { threshold: 40, yesProbability: 0.9 },
      { threshold: 140, yesProbability: 0.1 },
    ]);
    expect(result).toMatchObject({ ok: true, mode: "interpolated" });
    expect(result.referenceLine).toBeCloseTo(90, 1);
  });
});

describe("yesProbabilityToAmericanDisplay", () => {
  it("converts a favorite (p>0.5) to negative American odds", () => {
    expect(yesProbabilityToAmericanDisplay(0.6)).toBe(-150);
  });
  it("converts an underdog (p<0.5) to positive American odds", () => {
    expect(yesProbabilityToAmericanDisplay(0.4)).toBe(150);
  });
  it("returns null for degenerate probabilities", () => {
    expect(yesProbabilityToAmericanDisplay(0)).toBeNull();
    expect(yesProbabilityToAmericanDisplay(1)).toBeNull();
  });
});

describe("buildKalshiLadderRecord", () => {
  const identity = {
    playerId: "gsis:00-0000001",
    playerName: "Tyler Shough",
    position: "QB",
    team: "no",
    opponent: "det",
    gameId: "2026_02_NO_DET",
    week: 2,
  };

  function ladderRows() {
    return [
      rawRow({ ticker: "t-200", floor_strike: 199.5, yes_bid_dollars: "0.80", yes_ask_dollars: "0.84" }),
      rawRow({ ticker: "t-250", floor_strike: 249.5, yes_bid_dollars: "0.56", yes_ask_dollars: "0.60" }),
      rawRow({ ticker: "t-275", floor_strike: 274.5, yes_bid_dollars: "0.44", yes_ask_dollars: "0.48" }),
      rawRow({ ticker: "t-300", floor_strike: 299.5, yes_bid_dollars: "0.28", yes_ask_dollars: "0.32" }),
    ];
  }

  it("builds a normalized record with an interpolated reference line and the raw ladder preserved", () => {
    const out = buildKalshiLadderRecord({ canonicalMarket: "passingYards", identity, rawRows: ladderRows(), now: NOW });
    expect(out.ok).toBe(true);
    expect(out.record.source).toBe("kalshi");
    expect(out.record.referenceLineMode).toBe("interpolated");
    expect(out.record.referenceLine).toBeGreaterThan(249.5);
    expect(out.record.referenceLine).toBeLessThan(274.5);
    expect(out.record.ladder).toHaveLength(4);
    expect(out.record.nearestContract.ticker).toBeDefined();
    expect(out.record.nearestContract.yesMidCents).toBeGreaterThan(0);
    expect(out.record.playerId).toBe("gsis:00-0000001");
  });

  it("rejects when every rung is closed/stale", () => {
    const rows = ladderRows().map((r) => ({ ...r, status: "settled" }));
    expect(buildKalshiLadderRecord({ canonicalMarket: "passingYards", identity, rawRows: rows, now: NOW })).toEqual({
      ok: false,
      reason: "closed_or_stale",
    });
  });

  it("rejects when fewer than two rungs carry a usable price", () => {
    const rows = [
      rawRow({ ticker: "t-250", floor_strike: 249.5, yes_bid_dollars: "0", yes_ask_dollars: "0", last_price_dollars: "0" }),
      rawRow({ ticker: "t-275", floor_strike: 274.5, yes_bid_dollars: "0.44", yes_ask_dollars: "0.48" }),
    ];
    expect(buildKalshiLadderRecord({ canonicalMarket: "passingYards", identity, rawRows: rows, now: NOW })).toEqual({
      ok: false,
      reason: "insufficient_priced_rungs",
    });
  });
});
