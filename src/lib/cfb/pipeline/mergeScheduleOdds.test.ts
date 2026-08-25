import { describe, expect, it } from "vitest";
import { mergeScheduleOdds, previousOddsByGameId } from "./mergeScheduleOdds";
import type { CfbGame, CfbGameOdds } from "../../../data/cfb/types";

const EMPTY_ODDS: CfbGameOdds = {
  openingSpread: null,
  currentSpread: null,
  awayMoneyline: null,
  homeMoneyline: null,
  openingTotal: null,
  currentTotal: null,
};

const SOME_ODDS: CfbGameOdds = {
  openingSpread: null,
  currentSpread: -7,
  awayMoneyline: 230,
  homeMoneyline: -280,
  openingTotal: null,
  currentTotal: 51.5,
};

function minimalGame(id: string): CfbGame {
  return {
    id,
    season: 2026,
    week: 1,
    date: "2026-08-29",
    time: "16:00",
    awayTeamId: "away",
    homeTeamId: "home",
    neutralSite: false,
    venue: null,
    venueCity: null,
    venueState: null,
    tvNetwork: null,
    gameStatus: "scheduled",
    awayScore: null,
    homeScore: null,
    odds: EMPTY_ODDS,
    model: {
      jkbProjectedSpread: null,
      jkbProjectedTotal: null,
      homeWinProbability: null,
      awayWinProbability: null,
      neutralPowerDifference: null,
      homeFieldAdjustment: null,
      jkbPowerLine: null,
    },
  };
}

describe("mergeScheduleOdds", () => {
  it("uses fresh odds when present for a game", () => {
    const schedule = [minimalGame("1")];
    const merged = mergeScheduleOdds(schedule, new Map([["1", SOME_ODDS]]), new Map());
    expect(merged[0].odds).toEqual(SOME_ODDS);
  });

  it("endpoint failure (freshOddsByGameId === null): preserves last-known-good odds for every game", () => {
    const schedule = [minimalGame("1"), minimalGame("2")];
    const previous = new Map([["1", SOME_ODDS]]);
    const merged = mergeScheduleOdds(schedule, null, previous);
    expect(merged[0].odds).toEqual(SOME_ODDS);
    expect(merged[1].odds).toEqual(EMPTY_ODDS);
  });

  it("legitimate missing market for one game (fetch succeeded overall): falls back to that game's own last-known-good, not null, when previously known", () => {
    const schedule = [minimalGame("1")];
    const previous = new Map([["1", SOME_ODDS]]);
    const merged = mergeScheduleOdds(schedule, new Map(), previous);
    expect(merged[0].odds).toEqual(SOME_ODDS);
  });

  it("a brand-new game with no fresh line and no prior committed odds stays null", () => {
    const schedule = [minimalGame("new-game")];
    const merged = mergeScheduleOdds(schedule, new Map(), new Map());
    expect(merged[0].odds).toEqual(EMPTY_ODDS);
  });

  it("never joins by anything other than game ID — a differently-keyed previous map cannot leak in", () => {
    const schedule = [minimalGame("1")];
    const previous = new Map([["not-1", SOME_ODDS]]);
    const merged = mergeScheduleOdds(schedule, null, previous);
    expect(merged[0].odds).toEqual(EMPTY_ODDS);
  });

  it("does not mutate the input schedule array or game objects", () => {
    const schedule = [minimalGame("1")];
    const original = schedule[0];
    mergeScheduleOdds(schedule, new Map([["1", SOME_ODDS]]), new Map());
    expect(original.odds).toEqual(EMPTY_ODDS);
  });
});

describe("previousOddsByGameId", () => {
  it("builds a gameId -> odds map from a previously-generated schedule artifact", () => {
    const map = previousOddsByGameId([
      { id: "1", odds: SOME_ODDS },
      { id: "2", odds: EMPTY_ODDS },
    ]);
    expect(map.get("1")).toEqual(SOME_ODDS);
    expect(map.get("2")).toEqual(EMPTY_ODDS);
  });
});
