import { describe, it, expect } from "vitest";
import {
  compareToMarket,
  formatPoints,
  formatProjectedSpread,
  marketHomeMargin,
  projectedWinner,
  projectionBreakdown,
  projectionFor,
  type GameProjection,
  type ProjectionsArtifact,
} from "@/lib/nfl/projectionData";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";

const side = {
  offAdj: 0.1,
  defAdj: -0.05,
  pdgAdj: 4,
  compositeZ: 0,
  sampleGames: 17,
  lastSampleGameId: "2025_18_MIA_NE",
  priorSeason: 2025,
  priorWeight: 1,
  currentSeasonGames: 0,
  priorSeasonGames: 17,
};

function projection(overrides: Partial<GameProjection> = {}): GameProjection {
  const projectedHomeMargin = overrides.projectedHomeMargin ?? 3.36;
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    kickoff: "2026-09-10T00:20:00.000Z",
    awayTeam: "ne",
    homeTeam: "sea",
    neutralSite: false,
    beta: 4.63,
    away: { ...side },
    home: { ...side, compositeZ: 0.2934 },
    strengthDiff: 0.2934,
    neutralMargin: 1.36,
    homeFieldAdvantage: 2,
    projectedHomeMargin,
    projectedSpread: { favoriteTeam: "sea", line: -3.4, display: "SEA −3.4" },
    ...overrides,
  };
}

/** Sportsbook notation: a negative home number means the home team is favoured. */
function market(homeSpread: number | null): MarketCurrentGame {
  return {
    gameId: "2026_01_NE_SEA",
    season: 2026,
    week: 1,
    seasonType: "REG",
    homeAbbr: "sea",
    awayAbbr: "ne",
    neutralSite: false,
    spread: { home: homeSpread, away: homeSpread == null ? null : -homeSpread },
    moneyline: { home: null, away: null },
    total: null,
    rawSpreadLine: null,
  };
}

describe("projectionFor", () => {
  const artifact = {
    projections: { "2026_01_NE_SEA": projection() },
  } as unknown as ProjectionsArtifact;

  it("finds a projection by game id", () => {
    expect(projectionFor(artifact, "2026_01_NE_SEA")?.gameId).toBe("2026_01_NE_SEA");
  });

  it("returns null rather than throwing when the artifact or id is missing", () => {
    expect(projectionFor(null, "2026_01_NE_SEA")).toBeNull();
    expect(projectionFor(artifact, undefined)).toBeNull();
    expect(projectionFor(artifact, "2026_01_XX_YY")).toBeNull();
  });
});

describe("formatProjectedSpread", () => {
  it("prints the favourite with a negative line", () => {
    expect(formatProjectedSpread(projection())).toBe("SEA −3.4");
  });

  it("reports N/A when there is no projection", () => {
    expect(formatProjectedSpread(null)).toBe("N/A");
  });
});

describe("formatPoints", () => {
  it("signs positive and negative values", () => {
    expect(formatPoints(3.36)).toBe("+3.4");
    expect(formatPoints(-1.52)).toBe("−1.5");
  });

  it("prints an unsigned zero", () => {
    expect(formatPoints(0)).toBe("0.0");
    expect(formatPoints(0.04)).toBe("0.0");
  });

  it("reports N/A for missing or non-finite input", () => {
    expect(formatPoints(null)).toBe("N/A");
    expect(formatPoints(Number.NaN)).toBe("N/A");
  });
});

describe("marketHomeMargin", () => {
  it("inverts sportsbook notation into a home margin", () => {
    // SEA -3.5 means the market expects SEA to win by 3.5.
    expect(marketHomeMargin(market(-3.5))).toBe(3.5);
    expect(marketHomeMargin(market(2.5))).toBe(-2.5);
  });

  it("returns null when no line exists", () => {
    expect(marketHomeMargin(market(null))).toBeNull();
    expect(marketHomeMargin(null)).toBeNull();
  });
});

describe("compareToMarket", () => {
  it("is positive when the model is higher on the home team than the market", () => {
    // Model: SEA by 3.36. Market: SEA by 2.5. Model leans home.
    const c = compareToMarket(projection(), market(-2.5))!;
    expect(c.difference).toBeCloseTo(0.86, 10);
    expect(c.leansToward).toBe("sea");
  });

  it("is negative when the model is higher on the away team than the market", () => {
    // Model: SEA by 3.36. Market: SEA by 6.5. Model leans away.
    const c = compareToMarket(projection(), market(-6.5))!;
    expect(c.difference).toBeCloseTo(-3.14, 10);
    expect(c.leansToward).toBe("ne");
  });

  it("leans toward nobody when the two agree", () => {
    const c = compareToMarket(projection({ projectedHomeMargin: 3.5 }), market(-3.5))!;
    expect(c.difference).toBeCloseTo(0, 10);
    expect(c.leansToward).toBeNull();
  });

  it("still reports the model line when no market line exists", () => {
    const c = compareToMarket(projection(), market(null))!;
    expect(c.modelHomeMargin).toBeCloseTo(3.36, 10);
    expect(c.marketHomeMargin).toBeNull();
    expect(c.difference).toBeNull();
    expect(c.leansToward).toBeNull();
  });

  it("returns null without a projection, so the market can never stand in for one", () => {
    expect(compareToMarket(null, market(-3.5))).toBeNull();
  });
});

describe("projectedWinner", () => {
  it("names the home team on a positive margin and the away team on a negative one", () => {
    expect(projectedWinner(projection({ projectedHomeMargin: 3.36 }))).toBe("sea");
    expect(projectedWinner(projection({ projectedHomeMargin: -1.2 }))).toBe("ne");
  });

  it("names nobody on an exact pick'em", () => {
    expect(projectedWinner(projection({ projectedHomeMargin: 0.02 }))).toBeNull();
  });
});

describe("projectionBreakdown", () => {
  it("shows exactly the three terms the model computes", () => {
    expect(projectionBreakdown(projection()).map((r) => r.label)).toEqual([
      "Team Strength Difference",
      "Home Field",
      "Projected Margin",
    ]);
  });

  it("states that home field is neither applied nor fitted at a neutral site", () => {
    const rows = projectionBreakdown(projection({ neutralSite: true, homeFieldAdvantage: 0 }));
    expect(rows[1].value).toBe("0.0");
    expect(rows[1].detail).toMatch(/neutral site/i);
  });

  it("describes home field as fixed and never fitted", () => {
    expect(projectionBreakdown(projection())[1].detail).toMatch(/never fitted/i);
  });

  it("offers no confidence, probability, edge or bet sizing", () => {
    const text = JSON.stringify(projectionBreakdown(projection())).toLowerCase();
    for (const banned of ["confidence", "probability", "kelly", "expected value", "best bet", "edge"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("market independence of the consumer layer", () => {
  it("produces a projection with no market data present at all", () => {
    const p = projection();
    expect(formatProjectedSpread(p)).toBe("SEA −3.4");
    expect(projectedWinner(p)).toBe("sea");
    expect(projectionBreakdown(p)).toHaveLength(3);
  });

  it("does not let the market change the projection itself", () => {
    const p = projection();
    const withTightLine = compareToMarket(p, market(-1))!;
    const withWideLine = compareToMarket(p, market(-14))!;
    expect(withTightLine.modelHomeMargin).toBe(withWideLine.modelHomeMargin);
  });
});
