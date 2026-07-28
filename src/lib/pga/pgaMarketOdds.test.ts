import { describe, expect, it } from "vitest";
import {
  PGA_MARKET_KEYS,
  hasMarketOdds,
  marketOddsFor,
  oddsKeyForMarket,
} from "@/lib/pga/marketOdds";
import {
  computeValueEdge,
  filterByValueAndOdds,
  toImplied,
} from "../../../scripts/generate-pga-best-bets.mjs";

const pickWith = (odds: Record<string, string | null> | null) => ({
  player: "Test Golfer",
  tournamentRank: 5,
  powerRank: 9,
  topStats: ["sgTotal=1.2"],
  bullets: ["A bullet"],
  odds,
});

/**
 * The audited defect: a placement market falling back to the outright price.
 * Every row asserts what each market shows given a specific set of prices.
 */
const ODDS_MATRIX = [
  {
    scenario: "outright only",
    odds: { outright: "+4500", top5: null, top10: null, top20: null },
    expected: { outrights: "+4500", top5: null, top10: null, top20: null },
  },
  {
    scenario: "top 5 only",
    odds: { outright: null, top5: "+650", top10: null, top20: null },
    expected: { outrights: null, top5: "+650", top10: null, top20: null },
  },
  {
    scenario: "all markets",
    odds: { outright: "+4500", top5: "+650", top10: "+260", top20: "-140" },
    expected: { outrights: "+4500", top5: "+650", top10: "+260", top20: "-140" },
  },
  {
    scenario: "no markets",
    odds: null,
    expected: { outrights: null, top5: null, top10: null, top20: null },
  },
] as const;

describe("marketOddsFor never substitutes across markets", () => {
  it.each(ODDS_MATRIX)("$scenario", ({ odds, expected }) => {
    const pick = pickWith(odds as Record<string, string | null> | null);
    for (const market of PGA_MARKET_KEYS) {
      expect(marketOddsFor(pick, market), `${market} under "${odds ? "priced" : "unpriced"}"`).toBe(
        expected[market],
      );
    }
  });

  it("never returns the outright price for a placement market", () => {
    const pick = pickWith({ outright: "+4500", top5: null, top10: null, top20: null });
    for (const market of ["top5", "top10", "top20"] as const) {
      expect(marketOddsFor(pick, market)).not.toBe("+4500");
      expect(marketOddsFor(pick, market)).toBeNull();
    }
  });

  it("fails closed for an unrecognized market rather than leaking another price", () => {
    const pick = pickWith({ outright: "+4500", top5: "+650", top10: null, top20: null });
    expect(marketOddsFor(pick, "top3")).toBeNull();
    expect(marketOddsFor(pick, undefined)).toBeNull();
    expect(oddsKeyForMarket("top3")).toBeNull();
  });

  it("accepts both accepted spellings of the outright market", () => {
    const pick = pickWith({ outright: "+4500", top5: null, top10: null, top20: null });
    expect(marketOddsFor(pick, "outrights")).toBe("+4500");
    expect(marketOddsFor(pick, "outright")).toBe("+4500");
  });

  it("hasMarketOdds mirrors marketOddsFor", () => {
    const pick = pickWith({ outright: "+4500", top5: null, top10: null, top20: null });
    expect(hasMarketOdds(pick, "outrights")).toBe(true);
    expect(hasMarketOdds(pick, "top20")).toBe(false);
  });
});

describe("filterByValueAndOdds retention", () => {
  it("drops a placement pick that only has an outright price", () => {
    const picks = [pickWith({ outright: "+4500", top5: null, top10: null, top20: null })];
    expect(filterByValueAndOdds(picks, "top20")).toHaveLength(0);
    expect(filterByValueAndOdds(picks, "top10")).toHaveLength(0);
    expect(filterByValueAndOdds(picks, "top5")).toHaveLength(0);
  });

  it("retains a pick priced in its own market", () => {
    const picks = [pickWith({ outright: null, top5: null, top10: null, top20: "-140" })];
    expect(filterByValueAndOdds(picks, "top20")).toHaveLength(1);
  });

  it("retains outright picks priced outright", () => {
    const picks = [pickWith({ outright: "+4500", top5: null, top10: null, top20: null })];
    expect(filterByValueAndOdds(picks, "outrights")).toHaveLength(1);
  });

  it("drops every pick when no odds exist at all", () => {
    expect(filterByValueAndOdds([pickWith(null)], "top10")).toHaveLength(0);
  });

  it("tolerates empty and nullish pick arrays", () => {
    expect(filterByValueAndOdds([], "top10")).toEqual([]);
    expect(filterByValueAndOdds(null, "top10")).toEqual([]);
  });

  it("orders deterministically, breaking ties by player name", () => {
    const mk = (player: string, rank: number) => ({
      ...pickWith({ outright: null, top5: null, top10: null, top20: "-140" }),
      player,
      tournamentRank: rank,
    });
    const picks = [mk("Zed", 5), mk("Al", 5), mk("Mo", 5)];
    expect(filterByValueAndOdds(picks, "top20").map((p) => p.player)).toEqual(["Al", "Mo", "Zed"]);
  });
});

describe("American odds conversion", () => {
  it.each([
    ["+100", 0.5],
    ["-100", 0.5],
    ["+4500", 100 / 4600],
    ["-140", 140 / 240],
  ])("converts %s to a vig-inclusive implied probability", (odds, expected) => {
    expect(toImplied(odds as string)).toBeCloseTo(expected as number, 10);
  });

  it("returns null for missing or unparseable odds", () => {
    expect(toImplied(null)).toBeNull();
    expect(toImplied("")).toBeNull();
    expect(toImplied("N/A")).toBeNull();
  });

  it("computeValueEdge returns the sentinel for unusable odds", () => {
    // Legacy, non-probabilistic ordering value -- asserted only so the guard
    // path is covered. Deliberately no assertion about its magnitude meaning
    // anything: it is not an edge and is scheduled for replacement.
    expect(computeValueEdge(5, null)).toBe(-1);
    expect(computeValueEdge(5, "N/A")).toBe(-1);
  });
});
