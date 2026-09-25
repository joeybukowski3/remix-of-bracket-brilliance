import { describe, it, expect } from "vitest";
import { buildMatchupSummaryStripValues, compareSummaryLine, compareSummaryTotal } from "@/lib/nfl/matchupSummaryStrip";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

const market = (home: number | null, total: number | null): MarketCurrentGame => ({
  gameId: "g",
  season: 2026,
  week: 1,
  seasonType: "REG",
  homeAbbr: "sea",
  awayAbbr: "ne",
  neutralSite: false,
  spread: { home, away: home == null ? null : -home },
  moneyline: { home: null, away: null },
  total,
  rawSpreadLine: null,
});
const projection = (formattedJkbSpread: string) => ({ formattedJkbSpread }) as GameProjection;
const totals = (projectedGameTotal: number) => ({ projectedGameTotal }) as TeamTotalProjection;
const margin = (projectedHomeMargin: number) => ({ projectedHomeMargin }) as GameProjection;

describe("buildMatchupSummaryStripValues", () => {
  it("formats a home favorite", () => {
    expect(buildMatchupSummaryStripValues(market(-3.5, 45.5), projection("SEA −1.8"), totals(47.24))).toEqual({
      vegasLine: "SEA −3.5",
      jkbLine: "SEA −1.8",
      vegasTotal: "45.5",
      jkbTotal: "47.2",
    });
  });

  it("names the away team when the away side is favored", () => {
    expect(buildMatchupSummaryStripValues(market(2.5, 41), null, null).vegasLine).toBe("NE −2.5");
  });

  it("renders a pickem as PK", () => {
    expect(buildMatchupSummaryStripValues(market(0, 41), projection("PK"), null).vegasLine).toBe("PK");
  });

  it("uses an em dash for every missing source without substituting another", () => {
    expect(buildMatchupSummaryStripValues(null, null, null)).toEqual({
      vegasLine: "—",
      jkbLine: "—",
      vegasTotal: "—",
      jkbTotal: "—",
    });
    const noMarket = buildMatchupSummaryStripValues(market(null, null), projection("SEA −1.8"), totals(47.2));
    expect(noMarket.vegasLine).toBe("—");
    expect(noMarket.vegasTotal).toBe("—");
    expect(noMarket.jkbLine).toBe("SEA −1.8");
  });

  it("shows the canonical projectedGameTotal without a status gate, matching the detail page", () => {
    const row = { projectedGameTotal: 47.2, status: "unavailable" } as TeamTotalProjection;
    expect(buildMatchupSummaryStripValues(null, null, row).jkbTotal).toBe("47.2");
  });

  it("shows a dash when the projected total is not finite", () => {
    expect(buildMatchupSummaryStripValues(null, null, totals(Number.NaN)).jkbTotal).toBe("—");
  });
});

describe("summary comparison signals", () => {
  it("orients bullishness to either market favorite", () => {
    expect(compareSummaryLine(market(-3.5, 45), margin(4.5))).toMatchObject({ kind: "higher", delta: 1 });
    expect(compareSummaryLine(market(-3.5, 45), margin(2.5))).toMatchObject({ kind: "lower", delta: -1 });
    expect(compareSummaryLine(market(2.5, 45), margin(-4))).toMatchObject({ kind: "higher", delta: 1.5 });
    expect(compareSummaryLine(market(2.5, 45), margin(-1))).toMatchObject({ kind: "lower", delta: -1.5 });
  });

  it("marks a favorite flip as a dog and leaves pick'em without directional comparison", () => {
    expect(compareSummaryLine(market(-3.5, 45), margin(-1))).toMatchObject({ kind: "dog", delta: -4.5 });
    expect(compareSummaryLine(market(2.5, 45), margin(1))).toMatchObject({ kind: "dog", delta: -3.5 });
    expect(compareSummaryLine(market(0, 45), margin(2))).toEqual({ kind: "pickem", delta: null });
    expect(compareSummaryLine(market(-3.5, 45), margin(0))).toMatchObject({ kind: "lower" });
  });

  it("treats sub-tenth gaps as aligned and missing/nonfinite values as unavailable", () => {
    expect(compareSummaryLine(market(-3.5, 45), margin(3.53)).kind).toBe("aligned");
    expect(compareSummaryLine(market(null, 45), margin(3)).kind).toBe("unavailable");
    expect(compareSummaryLine(market(-3.5, 45), null).kind).toBe("unavailable");
    expect(compareSummaryLine(market(-3.5, 45), margin(Number.NaN)).kind).toBe("unavailable");
    expect(compareSummaryTotal(market(-3.5, 45), totals(46)).kind).toBe("higher");
    expect(compareSummaryTotal(market(-3.5, 45), totals(43.6)).kind).toBe("lower");
    expect(compareSummaryTotal(market(-3.5, 45), totals(45.03)).kind).toBe("aligned");
    expect(compareSummaryTotal(market(-3.5, null), totals(45)).kind).toBe("unavailable");
    expect(compareSummaryTotal(market(-3.5, 45), totals(Number.NaN)).kind).toBe("unavailable");
  });
});
