import { describe, expect, test } from "vitest";
import { joinMarketLine, matchupScoreBand, type NflYardageMarketArtifact } from "./yardageMarketJoin";

function buildMarket(overrides?: Partial<NflYardageMarketArtifact["canonical"]>): NflYardageMarketArtifact {
  return {
    generatedAt: "2026-08-26T14:09:24.393Z",
    schemaVersion: "nfl-yardage-market-v1",
    canonical: {
      passingYards: {},
      rushingYards: {},
      receivingYards: {},
      ...overrides,
    },
  };
}

const passingLine = {
  playerId: "gsis:00-0039851",
  playerName: "Drake Maye",
  position: "QB",
  team: "ne",
  opponent: "sea",
  gameId: "2026_01_NE_SEA",
  week: 1,
  bookmaker: "draftkings",
  point: 228.5,
  over: "-112",
  under: "-112",
  booksAtPoint: 1,
  lastUpdate: "2026-08-26T13:28:24Z",
};

describe("joinMarketLine", () => {
  test("returns unavailable when the market artifact is null", () => {
    const result = joinMarketLine({ playerId: "gsis:00-0039851", market: "passing", projectedYards: 240 }, null);
    expect(result.available).toBe(false);
  });

  test("returns unavailable when no line exists for the exact playerId in that market", () => {
    const market = buildMarket({ passingYards: { "gsis:00-0039851": passingLine } });
    const result = joinMarketLine({ playerId: "gsis:00-0034869", market: "passing", projectedYards: 240 }, market);
    expect(result.available).toBe(false);
  });

  test("never cross-joins a line from a different market", () => {
    const market = buildMarket({ passingYards: { "gsis:00-0039851": passingLine } });
    const result = joinMarketLine({ playerId: "gsis:00-0039851", market: "rushing", projectedYards: 40 }, market);
    expect(result.available).toBe(false);
  });

  test("joins on exact playerId+market and computes rawDifference as projection minus line", () => {
    const market = buildMarket({ passingYards: { "gsis:00-0039851": passingLine } });
    const result = joinMarketLine({ playerId: "gsis:00-0039851", market: "passing", projectedYards: 240 }, market);
    expect(result).toEqual({
      available: true,
      line: 228.5,
      book: "draftkings",
      overPrice: "-112",
      underPrice: "-112",
      rawDifference: 240 - 228.5,
      lastUpdate: "2026-08-26T13:28:24Z",
    });
  });

  test("returns unavailable when projectedYards is null even if a line exists", () => {
    const market = buildMarket({ passingYards: { "gsis:00-0039851": passingLine } });
    const result = joinMarketLine({ playerId: "gsis:00-0039851", market: "passing", projectedYards: null }, market);
    expect(result.available).toBe(false);
  });
});

describe("matchupScoreBand", () => {
  test.each([
    [null, null],
    [undefined, null],
    [92, "elite"],
    [80, "elite"],
    [70, "strong"],
    [65, "strong"],
    [50, "average"],
    [45, "average"],
    [30, "weak"],
    [25, "weak"],
    [10, "poor"],
    [0, "poor"],
  ] as const)("buckets %s as %s", (score, expected) => {
    expect(matchupScoreBand(score)).toBe(expected);
  });
});
