import { describe, expect, it } from "vitest";
import type { CfbdResearchLinesGameRaw } from "../types";
import { normalizeResearchMarketLines } from "./normalizeMarketLines";

const GAME: CfbdResearchLinesGameRaw = {
  id: 401_119_270,
  season: 2019,
  seasonType: "regular",
  week: 5,
  startDate: "2019-09-28T16:00:00.000Z",
  homeTeamId: 193,
  homeTeam: "Miami (OH)",
  homeConference: "Mid-American",
  homeClassification: "fbs",
  homeScore: 34,
  awayTeamId: 2084,
  awayTeam: "Buffalo",
  awayConference: "Mid-American",
  awayClassification: "fbs",
  awayScore: 20,
  lines: [
    {
      provider: "teamrankings",
      spread: 2.5,
      formattedSpread: "Buffalo -2.5",
      spreadOpen: null,
      overUnder: 47.5,
      overUnderOpen: null,
      homeMoneyline: null,
      awayMoneyline: null,
    },
    {
      provider: "consensus",
      spread: 2.5,
      formattedSpread: "Buffalo -2.5",
      spreadOpen: null,
      overUnder: 47,
      overUnderOpen: null,
      homeMoneyline: null,
      awayMoneyline: null,
    },
    {
      provider: "Caesars",
      spread: 3,
      formattedSpread: "Buffalo -3",
      spreadOpen: 2.5,
      overUnder: 48.5,
      overUnderOpen: 47.5,
      homeMoneyline: 150,
      awayMoneyline: -180,
    },
  ],
};

describe("normalizeResearchMarketLines", () => {
  it("produces one row per (game, provider) without merging providers", () => {
    const rows = normalizeResearchMarketLines([GAME]);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.provider))).toEqual(new Set(["teamrankings", "consensus", "Caesars"]));
  });

  it("passes CFBD's own 'consensus' provider through untouched rather than synthesizing one", () => {
    const rows = normalizeResearchMarketLines([GAME]);
    const consensusRows = rows.filter((r) => r.provider === "consensus");
    expect(consensusRows).toHaveLength(1);
    expect(consensusRows[0].spreadLatestObserved).toBe(2.5);
  });

  it("maps unqualified spread/overUnder to *LatestObserved, never labeling them closing", () => {
    const rows = normalizeResearchMarketLines([GAME]);
    const teamrankings = rows.find((r) => r.provider === "teamrankings")!;
    expect(teamrankings.spreadLatestObserved).toBe(2.5);
    expect(teamrankings.totalLatestObserved).toBe(47.5);
    expect(teamrankings.spreadOpen).toBeNull();
    expect(teamrankings.totalOpen).toBeNull();
  });

  it("stores explicit opening values only when CFBD provides them", () => {
    const rows = normalizeResearchMarketLines([GAME]);
    const caesars = rows.find((r) => r.provider === "Caesars")!;
    expect(caesars.spreadOpen).toBe(2.5);
    expect(caesars.totalOpen).toBe(47.5);
    expect(caesars.homeMoneyline).toBe(150);
    expect(caesars.awayMoneyline).toBe(-180);
  });

  it("observedAtUtc is always null (CFBD has no per-line timestamp)", () => {
    const rows = normalizeResearchMarketLines([GAME]);
    expect(rows.every((r) => r.observedAtUtc === null)).toBe(true);
  });

  it("returns no rows for a game with an empty lines array", () => {
    const rows = normalizeResearchMarketLines([{ ...GAME, lines: [] }]);
    expect(rows).toHaveLength(0);
  });
});
