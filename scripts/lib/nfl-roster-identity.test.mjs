import { describe, expect, it } from "vitest";
import { buildGameIndex, buildRosterNameIndex, resolvePlayerIdentity } from "./nfl-roster-identity.mjs";
import { MARKET_PLAUSIBLE_POSITIONS, PASSING_YARDS_MARKET, RUSHING_YARDS_MARKET } from "./nfl-prop-line-selection.mjs";

const games = [
  { gameId: "2026_01_SF_LAR", week: 1, homeTeam: "Los Angeles Rams", awayTeam: "San Francisco 49ers", homeAbbr: "lar", awayAbbr: "sf" },
  { gameId: "2026_01_NE_SEA", week: 1, homeTeam: "Seattle Seahawks", awayTeam: "New England Patriots", homeAbbr: "sea", awayAbbr: "ne" },
];

const roster = [
  { team: "sf", position: "QB", playerId: "gsis:00-0036945", playerName: "Brock Purdy" },
  { team: "lar", position: "WR", playerId: "gsis:00-0036223", playerName: "Puka Nacua" },
  { team: "ne", position: "QB", playerId: "gsis:00-0039150", playerName: "Drake Maye" },
  { team: "ne", position: "RB", playerId: "gsis:00-0011111", playerName: "Some Other Guy" },
];

function context() {
  return {
    rosterIndex: buildRosterNameIndex(roster),
    gameIndex: buildGameIndex(games),
    marketPlausiblePositions: MARKET_PLAUSIBLE_POSITIONS,
  };
}

describe("resolvePlayerIdentity", () => {
  it("resolves a player unambiguously via name + team + game + position", () => {
    const result = resolvePlayerIdentity(
      { providerName: "Brock Purdy", homeTeamFullName: "Los Angeles Rams", awayTeamFullName: "San Francisco 49ers", canonicalMarket: PASSING_YARDS_MARKET },
      context(),
    );
    expect(result.resolved).toBe(true);
    expect(result.identity).toMatchObject({ playerId: "gsis:00-0036945", team: "sf", opponent: "lar", gameId: "2026_01_SF_LAR", week: 1 });
  });

  it("rejects when the event's team pair is not a scheduled game", () => {
    const result = resolvePlayerIdentity(
      { providerName: "Brock Purdy", homeTeamFullName: "Los Angeles Rams", awayTeamFullName: "Dallas Cowboys", canonicalMarket: PASSING_YARDS_MARKET },
      context(),
    );
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe("unresolved_game_teams");
  });

  it("rejects when the roster name has no match on either team in this game", () => {
    const result = resolvePlayerIdentity(
      { providerName: "Nobody Here", homeTeamFullName: "Los Angeles Rams", awayTeamFullName: "San Francisco 49ers", canonicalMarket: PASSING_YARDS_MARKET },
      context(),
    );
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe("no_roster_match_in_game");
  });

  it("rejects on position mismatch -- a WR is never a plausible passing-yards player", () => {
    const result = resolvePlayerIdentity(
      { providerName: "Puka Nacua", homeTeamFullName: "Los Angeles Rams", awayTeamFullName: "San Francisco 49ers", canonicalMarket: PASSING_YARDS_MARKET },
      context(),
    );
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe("position_mismatch");
  });

  it("never falls back to name-only matching when two same-named roster entries are ambiguous within a market's plausible positions", () => {
    const rosterWithDuplicate = [...roster, { team: "sea", position: "RB", playerId: "gsis:00-0022222", playerName: "Drake Maye" }];
    const result = resolvePlayerIdentity(
      { providerName: "Drake Maye", homeTeamFullName: "Seattle Seahawks", awayTeamFullName: "New England Patriots", canonicalMarket: RUSHING_YARDS_MARKET },
      { rosterIndex: buildRosterNameIndex(rosterWithDuplicate), gameIndex: buildGameIndex(games), marketPlausiblePositions: MARKET_PLAUSIBLE_POSITIONS },
    );
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe("ambiguous_multiple_roster_matches");
  });
});
