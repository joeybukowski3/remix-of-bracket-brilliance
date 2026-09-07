import { describe, it, expect } from "vitest";
import {
  classifyTotalIndicator,
  compareTotalToMarket,
  formatTeamPoints,
  formatTotalDifference,
  formatTotalIndicatorLabel,
  teamTotalFor,
  totalIndicatorToneClasses,
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

describe("classifyTotalIndicator boundaries", () => {
  it("classifies exactly 0 as EVEN", () => {
    expect(classifyTotalIndicator(0)).toBe("EVEN");
  });

  it("classifies +0.9 as SLIGHT_OVER (just under the moderate boundary)", () => {
    expect(classifyTotalIndicator(0.9)).toBe("SLIGHT_OVER");
  });

  it("classifies +1.0 as MODERATE_OVER (the slight/moderate boundary is inclusive to moderate)", () => {
    expect(classifyTotalIndicator(1.0)).toBe("MODERATE_OVER");
  });

  it("classifies +2.5 as MODERATE_OVER (the moderate/strong boundary is inclusive to moderate)", () => {
    expect(classifyTotalIndicator(2.5)).toBe("MODERATE_OVER");
  });

  it("classifies +2.6 as STRONG_OVER (just past the moderate/strong boundary)", () => {
    expect(classifyTotalIndicator(2.6)).toBe("STRONG_OVER");
  });

  it("classifies -0.9 as SLIGHT_UNDER", () => {
    expect(classifyTotalIndicator(-0.9)).toBe("SLIGHT_UNDER");
  });

  it("classifies -1.0 as MODERATE_UNDER", () => {
    expect(classifyTotalIndicator(-1.0)).toBe("MODERATE_UNDER");
  });

  it("classifies -2.5 as MODERATE_UNDER", () => {
    expect(classifyTotalIndicator(-2.5)).toBe("MODERATE_UNDER");
  });

  it("classifies -2.6 as STRONG_UNDER", () => {
    expect(classifyTotalIndicator(-2.6)).toBe("STRONG_UNDER");
  });
});

describe("compareTotalToMarket", () => {
  it("computes JKB projected total minus the Vegas total (full precision, unrounded)", () => {
    const c = compareTotalToMarket(projection(), market(44.5))!;
    expect(c.jkbTotal).toBeCloseTo(48.89390929546783, 10);
    expect(c.vegasTotal).toBe(44.5);
    expect(c.difference).toBeCloseTo(4.39390929546783, 10);
  });

  it("computes the exact Slight Lean Over example from the spec: 48.9 vs 48.5 => Slight Lean Over +0.4", () => {
    const c = compareTotalToMarket(projection({ projectedGameTotal: 48.9 }), market(48.5))!;
    expect(c.indicator).toBe("SLIGHT_OVER");
    expect(formatTotalDifference(c.difference)).toBe("+0.4");
  });

  it("computes the exact Slight Lean Under example from the spec: 48.1 vs 48.5 => Slight Lean Under -0.4", () => {
    const c = compareTotalToMarket(projection({ projectedGameTotal: 48.1 }), market(48.5))!;
    expect(c.indicator).toBe("SLIGHT_UNDER");
    expect(formatTotalDifference(c.difference)).toBe("−0.4");
  });

  it("computes the exact Moderate Lean Over example from the spec: 50.0 vs 48.5 => Moderate Lean Over +1.5", () => {
    const c = compareTotalToMarket(projection({ projectedGameTotal: 50.0 }), market(48.5))!;
    expect(c.indicator).toBe("MODERATE_OVER");
    expect(formatTotalDifference(c.difference)).toBe("+1.5");
  });

  it("computes the exact Moderate Lean Under example from the spec: 46.0 vs 48.5 => Moderate Lean Under -2.5", () => {
    const c = compareTotalToMarket(projection({ projectedGameTotal: 46.0 }), market(48.5))!;
    expect(c.indicator).toBe("MODERATE_UNDER");
    expect(formatTotalDifference(c.difference)).toBe("−2.5");
  });

  it("computes the exact Strong Lean Over example from the spec: 51.1 vs 48.5 => Strong Lean Over +2.6", () => {
    const c = compareTotalToMarket(projection({ projectedGameTotal: 51.1 }), market(48.5))!;
    expect(c.indicator).toBe("STRONG_OVER");
    expect(formatTotalDifference(c.difference)).toBe("+2.6");
  });

  it("computes the exact Strong Lean Under example from the spec: 45.8 vs 48.5 => Strong Lean Under -2.7", () => {
    const c = compareTotalToMarket(projection({ projectedGameTotal: 45.8 }), market(48.5))!;
    expect(c.indicator).toBe("STRONG_UNDER");
    expect(formatTotalDifference(c.difference)).toBe("−2.7");
  });

  it("computes the exact EVEN example from the spec: 48.5 vs 48.5 => EVEN 0.0", () => {
    const c = compareTotalToMarket(projection({ projectedGameTotal: 48.5 }), market(48.5))!;
    expect(c.indicator).toBe("EVEN");
    expect(formatTotalDifference(c.difference)).toBe("0.0");
  });

  it("classifies off the DISPLAYED one-decimal difference, not the raw full-precision difference", () => {
    // Raw difference is 0.049999... which rounds to 0.0 for display -> EVEN,
    // even though the unrounded value is technically nonzero.
    const c = compareTotalToMarket(projection({ projectedGameTotal: 48.549999 }), market(48.5))!;
    expect(c.difference).toBeGreaterThan(0);
    expect(formatTotalDifference(c.difference)).toBe("0.0");
    expect(c.indicator).toBe("EVEN");
  });

  it("returns a null vegasTotal/difference/indicator when there is no market total", () => {
    const c = compareTotalToMarket(projection(), market(null))!;
    expect(c.jkbTotal).toBeCloseTo(48.89390929546783, 10);
    expect(c.vegasTotal).toBeNull();
    expect(c.difference).toBeNull();
    expect(c.indicator).toBeNull();
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

describe("formatTotalIndicatorLabel", () => {
  it("labels each tier with the exact spec wording", () => {
    expect(formatTotalIndicatorLabel("EVEN")).toBe("EVEN");
    expect(formatTotalIndicatorLabel("SLIGHT_OVER")).toBe("Slight Lean Over");
    expect(formatTotalIndicatorLabel("MODERATE_OVER")).toBe("Moderate Lean Over");
    expect(formatTotalIndicatorLabel("STRONG_OVER")).toBe("Strong Lean Over");
    expect(formatTotalIndicatorLabel("SLIGHT_UNDER")).toBe("Slight Lean Under");
    expect(formatTotalIndicatorLabel("MODERATE_UNDER")).toBe("Moderate Lean Under");
    expect(formatTotalIndicatorLabel("STRONG_UNDER")).toBe("Strong Lean Under");
  });

  it("reports N/A for a null indicator", () => {
    expect(formatTotalIndicatorLabel(null)).toBe("N/A");
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

describe("totalIndicatorToneClasses", () => {
  it("gives progressively stronger green shades for Slight/Moderate/Strong Over", () => {
    expect(totalIndicatorToneClasses("SLIGHT_OVER")).toContain("emerald-50");
    expect(totalIndicatorToneClasses("MODERATE_OVER")).toContain("emerald-100");
    expect(totalIndicatorToneClasses("STRONG_OVER")).toContain("emerald-700");
  });

  it("gives progressively stronger red shades for Slight/Moderate/Strong Under", () => {
    expect(totalIndicatorToneClasses("SLIGHT_UNDER")).toContain("rose-50");
    expect(totalIndicatorToneClasses("MODERATE_UNDER")).toContain("rose-100");
    expect(totalIndicatorToneClasses("STRONG_UNDER")).toContain("rose-700");
  });

  it("gives EVEN a neutral/slate treatment", () => {
    expect(totalIndicatorToneClasses("EVEN")).toContain("slate");
  });

  it("uses white text on the darkest (Strong) tiers for readable contrast", () => {
    expect(totalIndicatorToneClasses("STRONG_OVER")).toContain("text-white");
    expect(totalIndicatorToneClasses("STRONG_UNDER")).toContain("text-white");
  });

  it("falls back to a neutral treatment for a null indicator", () => {
    expect(totalIndicatorToneClasses(null)).toContain("slate");
  });
});
