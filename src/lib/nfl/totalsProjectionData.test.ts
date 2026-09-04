import { describe, it, expect } from "vitest";
import {
  compareTotalToMarket,
  formatTeamPoints,
  formatTotalDifference,
  teamTotalFor,
  type TeamTotalProjection,
  type TeamTotalsArtifact,
} from "@/lib/nfl/totalsProjectionData";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";

function projection(overrides: Partial<TeamTotalProjection> = {}): TeamTotalProjection {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    kickoffUtc: "2026-09-10T00:20:00.000Z",
    homeTeam: "sea",
    awayTeam: "ne",
    homeExpectedPoints: 24.206209063910883,
    awayExpectedPoints: 24.687700231556946,
    projectedGameTotal: 48.89390929546783,
    modelVersion: "jkb-nfl-total-ridge-v1.0.0",
    predictionTimestamp: "2026-09-04T17:58:46.030Z",
    status: "projected",
    ...overrides,
  };
}

function market(total: number | null): MarketCurrentGame {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    seasonType: "REG",
    homeAbbr: "sea",
    awayAbbr: "ne",
    neutralSite: false,
    spread: { home: null, away: null },
    moneyline: { home: null, away: null },
    total,
    rawSpreadLine: null,
  };
}

describe("teamTotalFor", () => {
  const artifact = {
    projections: { "2026_01_NE_SEA": projection() },
  } as unknown as TeamTotalsArtifact;

  it("finds a game's team-total projection by game id", () => {
    expect(teamTotalFor(artifact, "2026_01_NE_SEA")?.gameId).toBe("2026_01_NE_SEA");
  });

  it("returns null rather than throwing when the artifact, id, or game is missing", () => {
    expect(teamTotalFor(null, "2026_01_NE_SEA")).toBeNull();
    expect(teamTotalFor(artifact, undefined)).toBeNull();
    expect(teamTotalFor(artifact, "2026_02_XX_YY")).toBeNull();
  });
});

describe("formatTeamPoints", () => {
  it("formats to exactly one decimal place", () => {
    expect(formatTeamPoints(24.687700231556946)).toBe("24.7");
    expect(formatTeamPoints(24.206209063910883)).toBe("24.2");
    expect(formatTeamPoints(20)).toBe("20.0");
  });

  it("reports N/A for missing or non-finite input", () => {
    expect(formatTeamPoints(null)).toBe("N/A");
    expect(formatTeamPoints(undefined)).toBe("N/A");
    expect(formatTeamPoints(Number.NaN)).toBe("N/A");
  });
});

describe("compareTotalToMarket", () => {
  it("computes JKB projected total minus the Vegas total", () => {
    const c = compareTotalToMarket(projection(), market(44.5))!;
    expect(c.jkbTotal).toBeCloseTo(48.89390929546783, 10);
    expect(c.vegasTotal).toBe(44.5);
    expect(c.difference).toBeCloseTo(4.39390929546783, 10);
  });

  it("labels a large positive difference an OVER LEAN", () => {
    const c = compareTotalToMarket(projection(), market(44.5))!;
    expect(c.lean).toBe("OVER LEAN");
  });

  it("labels a large negative difference an UNDER LEAN", () => {
    const c = compareTotalToMarket(projection({ projectedGameTotal: 38 }), market(44.5))!;
    expect(c.difference).toBeCloseTo(-6.5, 10);
    expect(c.lean).toBe("UNDER LEAN");
  });

  it("labels a sub-threshold difference NEUTRAL", () => {
    const c = compareTotalToMarket(projection({ projectedGameTotal: 44.8 }), market(44.5))!;
    expect(c.lean).toBe("NEUTRAL");
  });

  it("returns a null vegasTotal/difference/lean when there is no market total", () => {
    const c = compareTotalToMarket(projection(), market(null))!;
    expect(c.jkbTotal).toBeCloseTo(48.89390929546783, 10);
    expect(c.vegasTotal).toBeNull();
    expect(c.difference).toBeNull();
    expect(c.lean).toBeNull();
  });

  it("returns null without a JKB projection, so the market can never stand in for one", () => {
    expect(compareTotalToMarket(null, market(44.5))).toBeNull();
  });

  it("never labels the comparison +EV, edge, confidence or probability", () => {
    const c = compareTotalToMarket(projection(), market(44.5))!;
    const text = JSON.stringify(c).toLowerCase();
    for (const banned of ["+ev", "edge", "confidence", "probability"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("formatTotalDifference", () => {
  it("signs a positive and a negative difference", () => {
    expect(formatTotalDifference(2.5)).toBe("+2.5");
    expect(formatTotalDifference(-1.5)).toBe("−1.5");
  });

  it("prints an unsigned zero", () => {
    expect(formatTotalDifference(0)).toBe("0.0");
  });

  it("reports N/A for missing or non-finite input", () => {
    expect(formatTotalDifference(null)).toBe("N/A");
    expect(formatTotalDifference(Number.NaN)).toBe("N/A");
  });
});

describe("market independence of the consumer layer", () => {
  it("computes the JKB total identically regardless of the market line", () => {
    const p = projection();
    const withTightMarket = compareTotalToMarket(p, market(48))!;
    const withWideMarket = compareTotalToMarket(p, market(30))!;
    expect(withTightMarket.jkbTotal).toBe(withWideMarket.jkbTotal);
  });

  it("home + away expected points equals the projected game total", () => {
    const p = projection();
    expect(p.homeExpectedPoints + p.awayExpectedPoints).toBeCloseTo(p.projectedGameTotal, 10);
  });
});
