import { describe, expect, it } from "vitest";
import {
  buildVenueIdByGameId,
  buildVenueLocationById,
  mergeScheduleVenueLocations,
} from "./mergeScheduleVenueLocations";
import type { CfbdGame, CfbdVenue } from "./types";
import type { CfbGame, CfbGameOdds, CfbGameModelProjections } from "../../../data/cfb/types";

const EMPTY_ODDS: CfbGameOdds = {
  openingSpread: null,
  currentSpread: null,
  awayMoneyline: null,
  homeMoneyline: null,
  openingTotal: null,
  currentTotal: null,
};

const EMPTY_MODEL: CfbGameModelProjections = {
  jkbProjectedSpread: null,
  jkbProjectedTotal: null,
  homeWinProbability: null,
  awayWinProbability: null,
  neutralPowerDifference: null,
  homeFieldAdjustment: null,
  jkbPowerLine: null,
};

function minimalGame(overrides: Partial<CfbGame> & { id: string }): CfbGame {
  return {
    season: 2026,
    week: 1,
    date: "2026-08-29",
    time: "16:00",
    awayTeamId: "away",
    homeTeamId: "home",
    neutralSite: false,
    venue: "Some Stadium",
    venueCity: null,
    venueState: null,
    tvNetwork: null,
    gameStatus: "scheduled",
    awayScore: null,
    homeScore: null,
    odds: EMPTY_ODDS,
    model: EMPTY_MODEL,
    ...overrides,
  };
}

function rawGame(overrides: Partial<CfbdGame> & { id: number }): CfbdGame {
  return {
    season: 2026,
    week: 1,
    seasonType: "regular",
    startDate: "2026-08-29T16:00:00.000Z",
    startTimeTBD: false,
    completed: false,
    neutralSite: false,
    homeId: 1,
    homeTeam: "Home",
    awayId: 2,
    awayTeam: "Away",
    ...overrides,
  };
}

describe("buildVenueIdByGameId", () => {
  it("maps CFBD game id -> venueId, skipping games with no venueId", () => {
    const map = buildVenueIdByGameId([
      rawGame({ id: 1, venueId: 100 }),
      rawGame({ id: 2, venueId: null }),
      rawGame({ id: 3 }),
    ]);
    expect(map.get("1")).toBe(100);
    expect(map.has("2")).toBe(false);
    expect(map.has("3")).toBe(false);
  });
});

describe("buildVenueLocationById", () => {
  it("normalizes empty-string state to null (non-US venues) without dropping the city", () => {
    const venues: CfbdVenue[] = [
      { id: 3504, name: "Aviva Stadium", city: "Dublin", state: "", countryCode: "IE" },
      { id: 5000, name: "Local Field", city: "Athens", state: "GA", countryCode: "US" },
    ];
    const byId = buildVenueLocationById(venues);
    expect(byId.get(3504)).toEqual({ city: "Dublin", state: null });
    expect(byId.get(5000)).toEqual({ city: "Athens", state: "GA" });
  });

  it("normalizes a missing/null city to null rather than throwing", () => {
    const byId = buildVenueLocationById([{ id: 1, name: "Unknown Venue", city: null, state: null }]);
    expect(byId.get(1)).toEqual({ city: null, state: null });
  });
});

describe("mergeScheduleVenueLocations", () => {
  const venueLocationById = buildVenueLocationById([
    { id: 100, name: "Home Stadium", city: "Austin", state: "TX", countryCode: "US" },
    { id: 200, name: "Neutral Arena", city: "Atlanta", state: "GA", countryCode: "US" },
    { id: 300, name: "Aviva Stadium", city: "Dublin", state: "", countryCode: "IE" },
  ]);

  it("joins verified city/state strictly by CFBD venue ID", () => {
    const schedule = [minimalGame({ id: "1" })];
    const venueIdByGameId = buildVenueIdByGameId([rawGame({ id: 1, venueId: 100 })]);
    const [merged] = mergeScheduleVenueLocations(schedule, venueIdByGameId, venueLocationById);
    expect(merged.venueCity).toBe("Austin");
    expect(merged.venueState).toBe("TX");
  });

  it("resolves a neutral-site game's location from its actual venue, never a participant's home city", () => {
    const schedule = [
      minimalGame({ id: "2", homeTeamId: "some-home-team", awayTeamId: "some-away-team", neutralSite: true, venue: "Neutral Arena" }),
    ];
    const venueIdByGameId = buildVenueIdByGameId([rawGame({ id: 2, venueId: 200, neutralSite: true })]);
    const [merged] = mergeScheduleVenueLocations(schedule, venueIdByGameId, venueLocationById);
    expect(merged.venueCity).toBe("Atlanta");
    expect(merged.venueState).toBe("GA");
  });

  it("leaves state null for a verified international venue rather than fabricating one", () => {
    const schedule = [minimalGame({ id: "3", neutralSite: true, venue: "Aviva Stadium" })];
    const venueIdByGameId = buildVenueIdByGameId([rawGame({ id: 3, venueId: 300, neutralSite: true })]);
    const [merged] = mergeScheduleVenueLocations(schedule, venueIdByGameId, venueLocationById);
    expect(merged.venueCity).toBe("Dublin");
    expect(merged.venueState).toBeNull();
  });

  it("falls back to null city/state (never a guess) when the game's venueId has no match in /venues", () => {
    const schedule = [minimalGame({ id: "4", venue: "Mystery Field" })];
    const venueIdByGameId = buildVenueIdByGameId([rawGame({ id: 4, venueId: 999 })]);
    const [merged] = mergeScheduleVenueLocations(schedule, venueIdByGameId, venueLocationById);
    expect(merged.venueCity).toBeNull();
    expect(merged.venueState).toBeNull();
    expect(merged.venue).toBe("Mystery Field");
  });

  it("falls back to null city/state when the raw /games cache has no venueId for this game at all", () => {
    const schedule = [minimalGame({ id: "5", venue: "No Raw Match" })];
    const venueIdByGameId = buildVenueIdByGameId([]);
    const [merged] = mergeScheduleVenueLocations(schedule, venueIdByGameId, venueLocationById);
    expect(merged.venueCity).toBeNull();
    expect(merged.venueState).toBeNull();
  });

  it("passes every other field through unchanged", () => {
    const schedule = [minimalGame({ id: "6", tvNetwork: "ESPN", venue: "Home Stadium" })];
    const venueIdByGameId = buildVenueIdByGameId([rawGame({ id: 6, venueId: 100 })]);
    const [merged] = mergeScheduleVenueLocations(schedule, venueIdByGameId, venueLocationById);
    expect(merged.tvNetwork).toBe("ESPN");
    expect(merged.venue).toBe("Home Stadium");
    expect(merged.odds).toEqual(EMPTY_ODDS);
  });
});
