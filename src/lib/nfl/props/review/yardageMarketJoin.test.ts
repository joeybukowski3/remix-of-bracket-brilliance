import { describe, expect, test } from "vitest";
import {
  buildYardageReviewRows,
  joinMarketLine,
  matchupScoreBand,
  type NflYardageAltMarketArtifact,
  type NflYardageAltMarketLine,
  type NflYardageMarketArtifact,
} from "./yardageMarketJoin";

function buildMarket(overrides?: Partial<NflYardageMarketArtifact["canonical"]>): NflYardageMarketArtifact {
  return {
    generatedAt: "2026-08-26T14:09:24.393Z",
    schemaVersion: "nfl-yardage-market-v1",
    canonical: { passingYards: {}, rushingYards: {}, receivingYards: {}, ...overrides },
  };
}

function buildAltMarket(overrides?: Partial<NflYardageAltMarketArtifact["canonical"]>): NflYardageAltMarketArtifact {
  return {
    generatedAt: "2026-09-10T05:10:00.000Z",
    schemaVersion: "nfl-yardage-alt-market-v1",
    currentWeek: 1,
    canonical: { passingYards: {}, rushingYards: {}, receivingYards: {}, ...overrides },
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

function altLine(overrides?: Partial<NflYardageAltMarketLine>): NflYardageAltMarketLine {
  return {
    playerId: "gsis:00-0039851",
    playerName: "Drake Maye",
    position: "QB",
    team: "ne",
    opponent: "sea",
    gameId: "2026_01_NE_SEA",
    week: 1,
    source: "kalshi",
    referenceLine: 224.6,
    referenceLineMode: "interpolated",
    interpolationBracket: { lowThreshold: 199.5, lowYesProbability: 0.6, highThreshold: 249.5, highYesProbability: 0.36 },
    referenceRungUsed: null,
    nearestContract: {
      ticker: "KXNFLPASSYDS-26SEP-NEDMAYE-225",
      threshold: 224.5,
      yesBidCents: 48,
      yesAskCents: 52,
      yesMidCents: 50,
      noMidCents: 50,
      americanFromYesMid: -100,
    },
    ladder: [],
    externalEventTicker: "KXNFLPASSYDS-26SEP-NESEA",
    externalMarketId: "KXNFLPASSYDS-26SEP-NEDMAYE-225",
    closeTime: "2026-09-12T00:00:00Z",
    updatedAt: "2026-09-10T05:00:00.000Z",
    matchingConfidence: 1,
    ...overrides,
  };
}

describe("joinMarketLine — source priority", () => {
  test("1. sportsbook wins when a line exists, even if Kalshi also has one", () => {
    const sb = buildMarket({ passingYards: { "gsis:00-0039851": passingLine } });
    const alt = buildAltMarket({ passingYards: { "gsis:00-0039851": altLine() } });
    const result = joinMarketLine({ playerId: "gsis:00-0039851", market: "passing", projectedYards: 240 }, sb, alt);
    expect(result).toEqual({
      available: true,
      source: "sportsbook",
      line: 228.5,
      book: "draftkings",
      overPrice: "-112",
      underPrice: "-112",
      rawDifference: 240 - 228.5,
      lastUpdate: "2026-08-26T13:28:24Z",
    });
  });

  test("2. Kalshi fills a missing sportsbook line", () => {
    const sb = buildMarket();
    const alt = buildAltMarket({ passingYards: { "gsis:00-0039851": altLine() } });
    const result = joinMarketLine({ playerId: "gsis:00-0039851", market: "passing", projectedYards: 240 }, sb, alt);
    expect(result).toMatchObject({
      available: true,
      source: "kalshi",
      line: 224.6,
      lineKind: "market_implied_reference",
      referenceLineMode: "interpolated",
      externalMarketId: "KXNFLPASSYDS-26SEP-NEDMAYE-225",
      rawDifference: 240 - 224.6,
    });
    expect(result).toMatchObject({ exchange: { yesCents: 50, noCents: 50, americanYes: -100, contractThreshold: 224.5 } });
  });

  test("3. still unavailable when neither sportsbook nor Kalshi has a line", () => {
    const result = joinMarketLine({ playerId: "gsis:00-0039851", market: "passing", projectedYards: 240 }, buildMarket(), buildAltMarket());
    expect(result).toEqual({ available: false });
  });

  test("Kalshi is never consulted for the wrong market (no cross-join)", () => {
    const alt = buildAltMarket({ passingYards: { "gsis:00-0039851": altLine() } });
    const result = joinMarketLine({ playerId: "gsis:00-0039851", market: "rushing", projectedYards: 30 }, buildMarket(), alt);
    expect(result).toEqual({ available: false });
  });

  test("Kalshi line requires an exact playerId match (no fuzzy match)", () => {
    const alt = buildAltMarket({ passingYards: { "gsis:00-0039851": altLine() } });
    const result = joinMarketLine({ playerId: "gsis:00-0034869", market: "passing", projectedYards: 240 }, buildMarket(), alt);
    expect(result).toEqual({ available: false });
  });

  test("unavailable when projectedYards is null even if a Kalshi line exists", () => {
    const alt = buildAltMarket({ passingYards: { "gsis:00-0039851": altLine() } });
    const result = joinMarketLine({ playerId: "gsis:00-0039851", market: "passing", projectedYards: null }, buildMarket(), alt);
    expect(result).toEqual({ available: false });
  });

  test("a null alt artifact behaves exactly like the pre-Kalshi single-source join", () => {
    const sb = buildMarket({ passingYards: { "gsis:00-0039851": passingLine } });
    expect(joinMarketLine({ playerId: "gsis:00-0039851", market: "passing", projectedYards: 240 }, sb, null)).toMatchObject({
      source: "sportsbook",
      line: 228.5,
    });
    expect(joinMarketLine({ playerId: "gsis:00-0039851", market: "passing", projectedYards: 240 }, buildMarket(), null)).toEqual({
      available: false,
    });
  });

  test("nearest_rung fallback is surfaced through referenceLineMode", () => {
    const alt = buildAltMarket({
      rushingYards: {
        "gsis:00-0000002": altLine({ playerId: "gsis:00-0000002", referenceLine: 45, referenceLineMode: "nearest_rung", interpolationBracket: null }),
      },
    });
    const result = joinMarketLine({ playerId: "gsis:00-0000002", market: "rushing", projectedYards: 52 }, buildMarket(), alt);
    expect(result).toMatchObject({ available: true, source: "kalshi", referenceLineMode: "nearest_rung", line: 45 });
  });
});

describe("buildYardageReviewRows", () => {
  test("passes the alt artifact through so a row without a sportsbook line still gets a Kalshi line", () => {
    const rows = [
      { playerId: "gsis:00-0039851", market: "passing", projectedYards: 240 } as never,
    ];
    const alt = buildAltMarket({ passingYards: { "gsis:00-0039851": altLine() } });
    const [entry] = buildYardageReviewRows(rows, buildMarket(), alt);
    expect(entry.marketInfo).toMatchObject({ available: true, source: "kalshi" });
  });
});

describe("matchupScoreBand", () => {
  test.each([
    [null, null],
    [92, "elite"],
    [70, "strong"],
    [50, "average"],
    [30, "weak"],
    [0, "poor"],
  ] as const)("buckets %s as %s", (score, expected) => {
    expect(matchupScoreBand(score)).toBe(expected);
  });
});
