import { describe, expect, it } from "vitest";
import {
  buildTrailingPregameAverage,
  statRowMatchesPosition,
  buildYardsAllowedPerGame,
  buildPlayerYardsPerGame,
} from "./nfl-yardage-rolling-core.mjs";

describe("buildTrailingPregameAverage", () => {
  it("excludes the current game's own value from its pregame average (no leakage)", () => {
    const perGame = new Map([
      ["A|2025|1", 100],
      ["A|2025|2", 100],
      ["A|2025|3", 999], // must never enter week 3's own pregame average
    ]);
    const rolling = buildTrailingPregameAverage(perGame);
    expect(rolling.get("A|2025|3").avg).toBe(100);
    expect(rolling.get("A|2025|3").gamesIncluded).toBe(2);
  });

  it("returns null with zero prior games", () => {
    const perGame = new Map([["A|2025|1", 50]]);
    const rolling = buildTrailingPregameAverage(perGame);
    expect(rolling.get("A|2025|1").avg).toBeNull();
    expect(rolling.get("A|2025|1").gamesIncluded).toBe(0);
  });

  it("caps the trailing window at the requested size", () => {
    const perGame = new Map();
    for (let week = 1; week <= 12; week += 1) perGame.set(`A|2025|${week}`, week);
    const rolling = buildTrailingPregameAverage(perGame, 10);
    // Week 12's prior games are weeks 2-11 (10 games), average = (2+...+11)/10 = 6.5
    expect(rolling.get("A|2025|12").avg).toBeCloseTo(6.5, 5);
    expect(rolling.get("A|2025|12").gamesIncluded).toBe(10);
  });
});

describe("statRowMatchesPosition", () => {
  it("passing only matches QB", () => {
    expect(statRowMatchesPosition("passing", "QB", "QB")).toBe(true);
    expect(statRowMatchesPosition("passing", "QB", "RB")).toBe(false);
  });
  it("rushing ALL matches every position, RB matches only RB", () => {
    expect(statRowMatchesPosition("rushing", "ALL", "WR")).toBe(true);
    expect(statRowMatchesPosition("rushing", "RB", "WR")).toBe(false);
    expect(statRowMatchesPosition("rushing", "RB", "RB")).toBe(true);
  });
  it("receiving is strictly position-specific", () => {
    expect(statRowMatchesPosition("receiving", "WR", "WR")).toBe(true);
    expect(statRowMatchesPosition("receiving", "WR", "TE")).toBe(false);
  });
});

describe("buildYardsAllowedPerGame", () => {
  it("sums multiple matching-position rows in the same defense/game", () => {
    const rows = [
      { season: 2025, week: 1, opponentTeam: "NE", position: "WR", receivingYards: 50, rushingYards: 0, passingYards: 0 },
      { season: 2025, week: 1, opponentTeam: "NE", position: "WR", receivingYards: 30, rushingYards: 0, passingYards: 0 },
      { season: 2025, week: 1, opponentTeam: "NE", position: "TE", receivingYards: 999, rushingYards: 0, passingYards: 0 },
    ];
    const perGame = buildYardsAllowedPerGame(rows, "receiving", "WR");
    expect(perGame.get("NE|2025|1")).toBe(80); // TE row excluded from the WR slice
  });
});

describe("buildPlayerYardsPerGame", () => {
  it("keys by playerId|season|week", () => {
    const rows = [{ season: 2025, week: 1, playerId: "00-1", passingYards: 250, rushingYards: 0, receivingYards: 0 }];
    const perGame = buildPlayerYardsPerGame(rows, "passing");
    expect(perGame.get("00-1|2025|1")).toBe(250);
  });
});
