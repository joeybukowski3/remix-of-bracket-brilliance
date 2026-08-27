import { describe, expect, it } from "vitest";
import {
  classifyVsCurrentLine,
  classifyVsAverageDiff,
  computeVsAverageDiff,
  averageExcludingNulls,
  buildPlayerLast10Summary,
  buildOpponentLast10Summary,
  buildPlayerLast10FooterAverages,
  buildOpponentLast10FooterAverages,
  resolvePositionSlice,
  formatRank,
  formatHomeAway,
  formatOpponentDisplay,
  formatGameScore,
  formatSignedDiff,
} from "./yardageHistoryView";
import type { NflYardagePlayerHistoryGame, NflYardageOpponentHistoryGame } from "../types/yardageHistory";

function playerGame(overrides: Partial<NflYardagePlayerHistoryGame> = {}): NflYardagePlayerHistoryGame {
  return {
    gameId: "2025_01_NE_SEA",
    season: 2025,
    week: 1,
    dateUtc: "2025-09-07T17:00:00.000Z",
    opponentAbbr: "sea",
    homeAway: "home",
    oppDefRank: 10,
    oppDefRankPoolSize: 32,
    oppYdsAllowAvg: 220,
    stat: { completions: 20, attempts: 30, passingTds: 2, interceptions: 0 },
    actualYards: 250,
    gameScore: { result: "W", teamScore: 24, oppScore: 17 },
    vegasLine: null,
    ...overrides,
  };
}

function opponentGame(overrides: Partial<NflYardageOpponentHistoryGame> = {}): NflYardageOpponentHistoryGame {
  return {
    gameId: "g1",
    season: 2025,
    week: 1,
    dateUtc: null,
    opponentPlayerId: "00-1",
    opponentPlayerName: "Player",
    homeAway: "home",
    oppOffRank: 5,
    oppOffRankPoolSize: 32,
    oppPlayerYpg: 200,
    stat: { completions: 20, attempts: 30, passingTds: 1, interceptions: 0 },
    yardsAllowed: 260,
    gameScore: { result: "W", teamScore: 20, oppScore: 10 },
    vegasLine: null,
    ...overrides,
  };
}

describe("classifyVsCurrentLine", () => {
  it("classifies over/under/push against the CURRENT line, never the historical one", () => {
    expect(classifyVsCurrentLine(250, 233.5)).toBe("over");
    expect(classifyVsCurrentLine(200, 233.5)).toBe("under");
    expect(classifyVsCurrentLine(233.5, 233.5)).toBe("push");
  });

  it("is neutral with no current line available", () => {
    expect(classifyVsCurrentLine(250, null)).toBe("neutral");
  });
});

describe("buildPlayerLast10Summary", () => {
  it("counts over/under against today's line, not the historical Vegas Line field", () => {
    const games = [
      playerGame({ actualYards: 276, vegasLine: 240 }), // historical line irrelevant to classification
      playerGame({ actualYards: 198, vegasLine: null }),
    ];
    const summary = buildPlayerLast10Summary(games, 233.5);
    expect(summary.over).toBe(1);
    expect(summary.under).toBe(1);
    expect(summary.avg).toBeCloseTo((276 + 198) / 2, 5);
    expect(summary.median).toBeCloseTo((276 + 198) / 2, 5);
  });

  it("has no over/under classification with no current line -- states neutral", () => {
    const games = [playerGame({ actualYards: 276 })];
    const summary = buildPlayerLast10Summary(games, null);
    expect(summary.over).toBe(0);
    expect(summary.under).toBe(0);
    expect(summary.currentLine).toBeNull();
  });

  it("returns null avg/median for zero games", () => {
    const summary = buildPlayerLast10Summary([], 233.5);
    expect(summary.avg).toBeNull();
    expect(summary.median).toBeNull();
    expect(summary.sampleSize).toBe(0);
  });
});

describe("buildOpponentLast10Summary", () => {
  it("summarizes yards allowed against today's line", () => {
    const games: NflYardageOpponentHistoryGame[] = [opponentGame()];
    const summary = buildOpponentLast10Summary(games, 233.5);
    expect(summary.over).toBe(1);
  });
});

describe("resolvePositionSlice", () => {
  it("passing is always QB", () => {
    expect(resolvePositionSlice("passing", "QB")).toBe("QB");
  });
  it("rushing is RB for RBs, ALL otherwise", () => {
    expect(resolvePositionSlice("rushing", "RB")).toBe("RB");
    expect(resolvePositionSlice("rushing", "QB")).toBe("ALL");
  });
  it("receiving uses the player's own position", () => {
    expect(resolvePositionSlice("receiving", "TE")).toBe("TE");
  });
});

describe("formatting helpers", () => {
  it("formatRank shows the ordinal rank or N/A", () => {
    expect(formatRank(9)).toBe("9th");
    expect(formatRank(1)).toBe("1st");
    expect(formatRank(22)).toBe("22nd");
    expect(formatRank(13)).toBe("13th");
    expect(formatRank(null)).toBe("N/A");
  });
  it("formatHomeAway never abbreviates", () => {
    expect(formatHomeAway("home")).toBe("Home");
    expect(formatHomeAway("away")).toBe("Away");
    expect(formatHomeAway(null)).toBe("N/A");
  });
  it("formatOpponentDisplay uses @ for away, vs for home", () => {
    expect(formatOpponentDisplay("sf", "away")).toBe("@ SF");
    expect(formatOpponentDisplay("lar", "home")).toBe("vs LAR");
  });
  it("formatGameScore renders result + score", () => {
    expect(formatGameScore({ result: "W", teamScore: 27, oppScore: 20 })).toBe("W 27–20");
    expect(formatGameScore(null)).toBe("N/A");
  });
});

describe("computeVsAverageDiff / classifyVsAverageDiff", () => {
  it("computes actual minus the comparison average, independent of any current line", () => {
    expect(computeVsAverageDiff(203, 213.5)).toBeCloseTo(-10.5, 5);
    expect(computeVsAverageDiff(346, 222.1)).toBeCloseTo(123.9, 5);
  });

  it("is null when the comparison average is unavailable", () => {
    expect(computeVsAverageDiff(203, null)).toBeNull();
  });

  it("classifies positive diff as over/green, negative as under/red, zero as push/neutral", () => {
    expect(classifyVsAverageDiff(10.5)).toBe("over");
    expect(classifyVsAverageDiff(-10.5)).toBe("under");
    expect(classifyVsAverageDiff(0)).toBe("push");
    expect(classifyVsAverageDiff(null)).toBe("neutral");
  });
});

describe("formatSignedDiff", () => {
  it("prefixes a sign and one decimal", () => {
    expect(formatSignedDiff(123.9)).toBe("+123.9");
    expect(formatSignedDiff(-10.5)).toBe("-10.5");
    expect(formatSignedDiff(0)).toBe("0.0");
    expect(formatSignedDiff(null)).toBe("N/A");
  });
});

describe("averageExcludingNulls", () => {
  it("excludes null/undefined from the denominator instead of coercing to zero", () => {
    expect(averageExcludingNulls([10, null, 20, undefined, 30])).toBeCloseTo(20, 5);
  });

  it("returns null when every value is missing", () => {
    expect(averageExcludingNulls([null, null])).toBeNull();
  });
});

describe("buildPlayerLast10FooterAverages", () => {
  it("averages Opp Def Rank, Opp Yds Allow Avg, actual yards, VS OPP AVG, and stat fields, excluding nulls", () => {
    const games = [
      playerGame({ oppDefRank: 10, oppYdsAllowAvg: 220, actualYards: 250, vegasLine: 240 }),
      playerGame({ oppDefRank: null, oppDefRankPoolSize: null, oppYdsAllowAvg: 200, actualYards: 190, vegasLine: null }),
    ];
    const footer = buildPlayerLast10FooterAverages(games);
    expect(footer.oppDefRankAvg).toBeCloseTo(10, 5); // second game's null rank excluded, not zeroed
    expect(footer.oppYdsAllowAvgAvg).toBeCloseTo(210, 5);
    expect(footer.actualYardsAvg).toBeCloseTo(220, 5);
    expect(footer.vsOppAvgAvg).toBeCloseTo((30 + -10) / 2, 5);
    expect(footer.statAverages.completions).toBeCloseTo(20, 5);
    expect(footer.vegasLineAvg).toBeCloseTo(240, 5); // only the non-null historical line
  });

  it("Vegas Line average is null (rendered as —) when zero historical lines exist", () => {
    const footer = buildPlayerLast10FooterAverages([playerGame({ vegasLine: null })]);
    expect(footer.vegasLineAvg).toBeNull();
  });
});

describe("buildOpponentLast10FooterAverages", () => {
  it("averages Opp Off Rank, entering YPG, yards allowed, and VS PLAYER AVG, excluding nulls", () => {
    const games = [
      opponentGame({ oppOffRank: 5, oppPlayerYpg: 200, yardsAllowed: 260 }),
      opponentGame({ oppOffRank: 15, oppPlayerYpg: 180, yardsAllowed: 150 }),
    ];
    const footer = buildOpponentLast10FooterAverages(games);
    expect(footer.oppOffRankAvg).toBeCloseTo(10, 5);
    expect(footer.oppPlayerYpgAvg).toBeCloseTo(190, 5);
    expect(footer.yardsAllowedAvg).toBeCloseTo(205, 5);
    expect(footer.vsPlayerAvgAvg).toBeCloseTo((60 + -30) / 2, 5);
  });
});
