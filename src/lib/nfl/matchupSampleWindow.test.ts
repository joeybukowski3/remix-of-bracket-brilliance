import { describe, it, expect } from "vitest";
import {
  DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS,
  LAST_N_GAME_COUNT,
  ROLLING_BLEND_GAME_COUNT,
  describeSampleComposition,
  describeSampleRule,
  resolveSampleComposition,
  type NflMatchupSampleSettings,
} from "@/lib/nfl/matchupSampleWindow";

const SEASON_BLEND_ON: NflMatchupSampleSettings = { window: "season", includePriorSeason: true };
const SEASON_BLEND_OFF: NflMatchupSampleSettings = { window: "season", includePriorSeason: false };
const LAST5_BLEND_ON: NflMatchupSampleSettings = { window: "last5", includePriorSeason: true };
const LAST5_BLEND_OFF: NflMatchupSampleSettings = { window: "last5", includePriorSeason: false };

describe("matchup sample defaults", () => {
  it("defaults to Season with the historical blend on", () => {
    expect(DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS).toEqual({
      window: "season",
      includePriorSeason: true,
    });
  });
});

describe("rolling eight-game blend (Season + blend ON)", () => {
  // Each completed 2026 game replaces exactly one late-2025 game.
  const expected: [number, number, number][] = [
    // completed2026, from2026, from2025
    [0, 0, 8],
    [1, 1, 7],
    [2, 2, 6],
    [3, 3, 5],
    [4, 4, 4],
    [5, 5, 3],
    [6, 6, 2],
    [7, 7, 1],
    [8, 8, 0],
  ];

  it.each(expected)(
    "after %i completed 2026 games the sample is %i from 2026 + %i from 2025",
    (completed, from2026, from2025) => {
      const composition = resolveSampleComposition(completed, SEASON_BLEND_ON);
      expect(composition.currentSeasonGames).toBe(from2026);
      expect(composition.priorSeasonGames).toBe(from2025);
      expect(composition.totalGames).toBe(ROLLING_BLEND_GAME_COUNT);
    }
  );

  it("stops drawing on 2025 entirely from the eighth completed game onward", () => {
    for (const completed of [8, 9, 12, 17]) {
      const composition = resolveSampleComposition(completed, SEASON_BLEND_ON);
      expect(composition.priorSeasonGames).toBe(0);
      expect(composition.currentSeasonGames).toBe(ROLLING_BLEND_GAME_COUNT);
    }
  });
});

describe("Season + blend OFF", () => {
  it("uses only completed 2026 games and is not capped at eight", () => {
    expect(resolveSampleComposition(0, SEASON_BLEND_OFF)).toEqual({
      currentSeasonGames: 0,
      priorSeasonGames: 0,
      totalGames: 0,
    });
    expect(resolveSampleComposition(3, SEASON_BLEND_OFF)).toEqual({
      currentSeasonGames: 3,
      priorSeasonGames: 0,
      totalGames: 3,
    });
    expect(resolveSampleComposition(12, SEASON_BLEND_OFF)).toEqual({
      currentSeasonGames: 12,
      priorSeasonGames: 0,
      totalGames: 12,
    });
  });
});

describe("Last 5 window", () => {
  it("crosses the season boundary while the blend is on", () => {
    expect(resolveSampleComposition(0, LAST5_BLEND_ON)).toEqual({
      currentSeasonGames: 0,
      priorSeasonGames: 5,
      totalGames: 5,
    });
    expect(resolveSampleComposition(2, LAST5_BLEND_ON)).toEqual({
      currentSeasonGames: 2,
      priorSeasonGames: 3,
      totalGames: 5,
    });
    expect(resolveSampleComposition(5, LAST5_BLEND_ON)).toEqual({
      currentSeasonGames: 5,
      priorSeasonGames: 0,
      totalGames: 5,
    });
  });

  it("never exceeds five games once the season is deep enough", () => {
    const composition = resolveSampleComposition(11, LAST5_BLEND_ON);
    expect(composition.totalGames).toBe(LAST_N_GAME_COUNT);
    expect(composition.priorSeasonGames).toBe(0);
  });

  it("uses current-season games only when the blend is off, even if fewer than five exist", () => {
    expect(resolveSampleComposition(0, LAST5_BLEND_OFF)).toEqual({
      currentSeasonGames: 0,
      priorSeasonGames: 0,
      totalGames: 0,
    });
    expect(resolveSampleComposition(2, LAST5_BLEND_OFF)).toEqual({
      currentSeasonGames: 2,
      priorSeasonGames: 0,
      totalGames: 2,
    });
    expect(resolveSampleComposition(9, LAST5_BLEND_OFF)).toEqual({
      currentSeasonGames: 5,
      priorSeasonGames: 0,
      totalGames: 5,
    });
  });
});

describe("degenerate game counts", () => {
  it("treats negative, fractional and non-finite counts as a preseason baseline", () => {
    expect(resolveSampleComposition(-4, SEASON_BLEND_ON).currentSeasonGames).toBe(0);
    expect(resolveSampleComposition(Number.NaN, SEASON_BLEND_ON).currentSeasonGames).toBe(0);
    expect(resolveSampleComposition(3.8, SEASON_BLEND_ON).currentSeasonGames).toBe(3);
  });
});

describe("sample descriptions", () => {
  it("describes the rule for each control combination without asserting a game count", () => {
    expect(describeSampleRule(SEASON_BLEND_ON)).toMatch(/rolling eight-game/i);
    expect(describeSampleRule(SEASON_BLEND_OFF)).toMatch(/2026 games only/i);
    expect(describeSampleRule(LAST5_BLEND_ON)).toMatch(/cross/i);
    expect(describeSampleRule(LAST5_BLEND_OFF)).toMatch(/five most recent completed 2026/i);
  });

  it("formats a composition breakdown", () => {
    expect(describeSampleComposition(resolveSampleComposition(4, SEASON_BLEND_ON))).toBe(
      "4 from 2026 + 4 from 2025"
    );
    expect(describeSampleComposition(resolveSampleComposition(0, SEASON_BLEND_ON))).toBe("8 from 2025");
    expect(describeSampleComposition(resolveSampleComposition(9, SEASON_BLEND_ON))).toBe("8 from 2026");
  });
});
