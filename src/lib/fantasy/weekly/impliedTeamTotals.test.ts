import { deriveImpliedTeamTotals } from "@/lib/fantasy/weekly/impliedTeamTotals";

const provenance = {
  source: "nflverse (nfldata games.csv)",
  generatedAt: "2026-08-03T17:25:47.658Z",
  perRowTimestampAvailable: false,
};

function market(home: number | null, total: number | null, neutralSite = false) {
  return { spread: { home, away: home == null ? null : -home }, total, neutralSite };
}

describe("market implied team totals", () => {
  it("handles a home favorite", () => {
    expect(deriveImpliedTeamTotals(market(-3.5, 44.5), provenance)).toMatchObject({ home: 24, away: 20.5 });
  });

  it("handles an away favorite", () => {
    expect(deriveImpliedTeamTotals(market(2.5, 47.5), provenance)).toMatchObject({ home: 22.5, away: 25 });
  });

  it("handles pick'em", () => {
    expect(deriveImpliedTeamTotals(market(0, 42), provenance)).toMatchObject({ home: 21, away: 21 });
  });

  it("preserves half-point precision", () => {
    expect(deriveImpliedTeamTotals(market(-0.5, 41.5), provenance)).toMatchObject({ home: 21, away: 20.5 });
  });

  it("uses designated home/away orientation at a neutral site", () => {
    expect(deriveImpliedTeamTotals(market(-4, 46, true), provenance)).toMatchObject({
      home: 25, away: 21, neutralSite: true,
    });
  });

  it("returns null when either required market field is missing", () => {
    expect(deriveImpliedTeamTotals(market(null, 44), provenance)).toBeNull();
    expect(deriveImpliedTeamTotals(market(-3, null), provenance)).toBeNull();
    expect(deriveImpliedTeamTotals(null, provenance)).toBeNull();
  });

  it("rejects non-finite, negative, and impossible outputs", () => {
    expect(() => deriveImpliedTeamTotals(market(Number.NaN, 44), provenance)).toThrow();
    expect(() => deriveImpliedTeamTotals(market(-3, Number.POSITIVE_INFINITY), provenance)).toThrow();
    expect(() => deriveImpliedTeamTotals(market(-3, -1), provenance)).toThrow();
    expect(() => deriveImpliedTeamTotals(market(60, 40), provenance)).toThrow();
  });

  it("preserves source freshness metadata", () => {
    expect(deriveImpliedTeamTotals(market(-3, 45), provenance)?.provenance).toEqual(provenance);
  });
});
