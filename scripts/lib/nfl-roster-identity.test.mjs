import { describe, expect, it } from "vitest";
import { buildGameIndex, buildRosterNameIndex, normalizeRosterTeamAbbr, resolvePlayerIdentity, selectGameForPair } from "./nfl-roster-identity.mjs";
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

  it("current single-game-pair behavior is unchanged (13)", () => {
    // Both existing fixture games are the only meeting for their pair --
    // buildGameIndex/resolvePlayerIdentity must behave exactly as before.
    const result = resolvePlayerIdentity(
      { providerName: "Brock Purdy", homeTeamFullName: "Los Angeles Rams", awayTeamFullName: "San Francisco 49ers", canonicalMarket: PASSING_YARDS_MARKET },
      context(),
    );
    expect(result.resolved).toBe(true);
    expect(result.identity.gameId).toBe("2026_01_SF_LAR");
  });
});

describe("buildGameIndex team full-name aliases (Root Cause B)", () => {
  const aliasGames = [
    { gameId: "2026_01_SF_LA", week: 1, homeTeam: "LA Rams", awayTeam: "San Francisco 49ers", homeAbbr: "lar", awayAbbr: "sf", status: "scheduled", dateUtc: "2026-09-14T20:25:00Z" },
    { gameId: "2026_01_ARI_LAC", week: 1, homeTeam: "LA Chargers", awayTeam: "Arizona Cardinals", homeAbbr: "lac", awayAbbr: "ari", status: "scheduled", dateUtc: "2026-09-14T20:25:00Z" },
    { gameId: "2026_01_NYJ_TEN", week: 1, homeTeam: "Tennessee Titans", awayTeam: "NY Jets", homeAbbr: "ten", awayAbbr: "nyj", status: "scheduled", dateUtc: "2026-09-14T17:00:00Z" },
    { gameId: "2026_01_DAL_NYG", week: 1, homeTeam: "NY Giants", awayTeam: "Dallas Cowboys", homeAbbr: "nyg", awayAbbr: "dal", status: "scheduled", dateUtc: "2026-09-14T17:00:00Z" },
    { gameId: "2026_01_KC_BAL", week: 1, homeTeam: "Kansas City Chiefs", awayTeam: "Baltimore Ravens", homeAbbr: "kc", awayAbbr: "bal", status: "scheduled", dateUtc: "2026-09-14T17:00:00Z" },
  ];

  it("resolves 'Los Angeles Rams' to lar (1)", () => {
    const { teamNameToAbbr } = buildGameIndex(aliasGames);
    expect(teamNameToAbbr.get("los angeles rams")).toBe("lar");
  });

  it("resolves 'Los Angeles Chargers' to lac (2)", () => {
    const { teamNameToAbbr } = buildGameIndex(aliasGames);
    expect(teamNameToAbbr.get("los angeles chargers")).toBe("lac");
  });

  it("resolves 'New York Jets' to nyj (3)", () => {
    const { teamNameToAbbr } = buildGameIndex(aliasGames);
    expect(teamNameToAbbr.get("new york jets")).toBe("nyj");
  });

  it("resolves 'New York Giants' to nyg (4)", () => {
    const { teamNameToAbbr } = buildGameIndex(aliasGames);
    expect(teamNameToAbbr.get("new york giants")).toBe("nyg");
  });

  it("existing short forms still resolve (5)", () => {
    const { teamNameToAbbr } = buildGameIndex(aliasGames);
    expect(teamNameToAbbr.get("la rams")).toBe("lar");
    expect(teamNameToAbbr.get("la chargers")).toBe("lac");
    expect(teamNameToAbbr.get("ny jets")).toBe("nyj");
    expect(teamNameToAbbr.get("ny giants")).toBe("nyg");
  });

  it("unrelated team names remain unchanged / fail as before (6)", () => {
    const { teamNameToAbbr } = buildGameIndex(aliasGames);
    expect(teamNameToAbbr.get("kansas city chiefs")).toBe("kc");
    expect(teamNameToAbbr.get("baltimore ravens")).toBe("bal");
    // Not a real team's full or short name -- must not resolve to anything.
    expect(teamNameToAbbr.get("los angeles raiders")).toBeUndefined();
  });

  it("end-to-end: a ParlayAPI-style full name resolves identity through the alias, not just the raw index", () => {
    const rosterEntries = [{ team: "lar", position: "WR", playerId: "gsis:rams-wr", playerName: "Puka Nacua" }];
    const result = resolvePlayerIdentity(
      { providerName: "Puka Nacua", homeTeamFullName: "Los Angeles Rams", awayTeamFullName: "San Francisco 49ers", canonicalMarket: "receivingYards" },
      { rosterIndex: buildRosterNameIndex(rosterEntries), gameIndex: buildGameIndex(aliasGames), marketPlausiblePositions: { receivingYards: ["WR"] } },
    );
    expect(result.resolved).toBe(true);
    expect(result.identity.gameId).toBe("2026_01_SF_LA");
  });
});

describe("selectGameForPair / rematch disambiguation (Root Cause A)", () => {
  const wasWeek1 = { gameId: "2026_01_WAS_PHI", week: 1, homeTeam: "Philadelphia Eagles", awayTeam: "Washington Commanders", homeAbbr: "phi", awayAbbr: "wsh", status: "scheduled", dateUtc: "2026-09-14T17:00:00Z" };
  const wasWeek8 = { gameId: "2026_08_PHI_WAS", week: 8, homeTeam: "Washington Commanders", awayTeam: "Philadelphia Eagles", homeAbbr: "wsh", awayAbbr: "phi", status: "scheduled", dateUtc: "2026-11-01T18:00:00Z" };
  const gbWeek1 = { gameId: "2026_01_GB_MIN", week: 1, homeTeam: "Minnesota Vikings", awayTeam: "Green Bay Packers", homeAbbr: "min", awayAbbr: "gb", status: "scheduled", dateUtc: "2026-09-13T20:25:00Z" };
  const gbWeek10 = { gameId: "2026_10_MIN_GB", week: 10, homeTeam: "Green Bay Packers", awayTeam: "Minnesota Vikings", homeAbbr: "gb", awayAbbr: "min", status: "scheduled", dateUtc: "2026-11-15T18:00:00Z" };
  const denWeek1 = { gameId: "2026_01_DEN_KC", week: 1, homeTeam: "Kansas City Chiefs", awayTeam: "Denver Broncos", homeAbbr: "kc", awayAbbr: "den", status: "scheduled", dateUtc: "2026-09-15T00:15:00Z" };
  const denWeek8 = { gameId: "2026_08_KC_DEN", week: 8, homeTeam: "Denver Broncos", awayTeam: "Kansas City Chiefs", homeAbbr: "den", awayAbbr: "kc", status: "scheduled", dateUtc: "2026-11-01T21:25:00Z" };

  it("two games with the same team pair no longer overwrite each other in the index (7)", () => {
    const { gameByTeamPair } = buildGameIndex([wasWeek1, wasWeek8]);
    const bucket = gameByTeamPair.get(["phi", "wsh"].sort().join("|"));
    expect(bucket).toHaveLength(2);
    expect(bucket.map((g) => g.gameId).sort()).toEqual(["2026_01_WAS_PHI", "2026_08_PHI_WAS"].sort());
  });

  it("Week 1 WAS/PHI resolves to Week 1 when given Week 1 context (8)", () => {
    const { game, ambiguous } = selectGameForPair([wasWeek1, wasWeek8], { targetWeek: 1 });
    expect(ambiguous).toBe(false);
    expect(game.gameId).toBe("2026_01_WAS_PHI");
  });

  it("the later WAS/PHI rematch resolves to the later game when given Week 8 context (9)", () => {
    const { game, ambiguous } = selectGameForPair([wasWeek1, wasWeek8], { targetWeek: 8 });
    expect(ambiguous).toBe(false);
    expect(game.gameId).toBe("2026_08_PHI_WAS");
  });

  it("same disambiguation for GB/MIN (10)", () => {
    expect(selectGameForPair([gbWeek1, gbWeek10], { targetWeek: 1 }).game.gameId).toBe("2026_01_GB_MIN");
    expect(selectGameForPair([gbWeek1, gbWeek10], { targetWeek: 10 }).game.gameId).toBe("2026_10_MIN_GB");
  });

  it("same disambiguation for DEN/KC (11)", () => {
    expect(selectGameForPair([denWeek1, denWeek8], { targetWeek: 1 }).game.gameId).toBe("2026_01_DEN_KC");
    expect(selectGameForPair([denWeek1, denWeek8], { targetWeek: 8 }).game.gameId).toBe("2026_08_KC_DEN");
  });

  it("without a target week, nearest-upcoming-by-kickoff deterministically picks the earlier scheduled meeting", () => {
    const { game, ambiguous } = selectGameForPair([wasWeek8, wasWeek1]); // order-independent
    expect(ambiguous).toBe(false);
    expect(game.gameId).toBe("2026_01_WAS_PHI");
  });

  it("falls through to nearest-upcoming when the target week matches none of the candidates", () => {
    const { game, ambiguous } = selectGameForPair([wasWeek1, wasWeek8], { targetWeek: 3 });
    expect(ambiguous).toBe(false);
    expect(game.gameId).toBe("2026_01_WAS_PHI");
  });

  it("a genuinely ambiguous repeated matchup fails closed (12)", () => {
    // Two "games" for the same pair with identical kickoff and no target
    // week resolving it -- there is no safe basis to choose, so it must fail.
    const tiedA = { gameId: "2026_99_A_B", week: 99, homeTeam: "A", awayTeam: "B", homeAbbr: "aa", awayAbbr: "bb", status: "scheduled", dateUtc: "2026-09-14T17:00:00Z" };
    const tiedB = { gameId: "2026_99_B_A", week: 99, homeTeam: "B", awayTeam: "A", homeAbbr: "bb", awayAbbr: "aa", status: "scheduled", dateUtc: "2026-09-14T17:00:00Z" };
    const { game, ambiguous } = selectGameForPair([tiedA, tiedB]);
    expect(ambiguous).toBe(true);
    expect(game).toBeNull();
  });

  it("a target week matching more than one candidate also fails closed", () => {
    const tiedA = { gameId: "g1", week: 5, homeTeam: "A", awayTeam: "B", homeAbbr: "aa", awayAbbr: "bb" };
    const tiedB = { gameId: "g2", week: 5, homeTeam: "B", awayTeam: "A", homeAbbr: "bb", awayAbbr: "aa" };
    const { game, ambiguous } = selectGameForPair([tiedA, tiedB], { targetWeek: 5 });
    expect(ambiguous).toBe(true);
    expect(game).toBeNull();
  });

  it("resolvePlayerIdentity fails closed with 'ambiguous_repeated_matchup' when disambiguation genuinely fails", () => {
    const tiedA = { gameId: "2026_99_A_B", week: 99, homeTeam: "Team A", awayTeam: "Team B", homeAbbr: "aa", awayAbbr: "bb", status: "scheduled", dateUtc: "2026-09-14T17:00:00Z" };
    const tiedB = { gameId: "2026_99_B_A", week: 99, homeTeam: "Team B", awayTeam: "Team A", homeAbbr: "bb", awayAbbr: "aa", status: "scheduled", dateUtc: "2026-09-14T17:00:00Z" };
    const result = resolvePlayerIdentity(
      { providerName: "Nobody", homeTeamFullName: "Team A", awayTeamFullName: "Team B", canonicalMarket: PASSING_YARDS_MARKET },
      { rosterIndex: buildRosterNameIndex([]), gameIndex: buildGameIndex([tiedA, tiedB]), marketPlausiblePositions: MARKET_PLAUSIBLE_POSITIONS },
    );
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe("ambiguous_repeated_matchup");
  });

  it("resolvePlayerIdentity end-to-end resolves the correct rematch game via targetWeek", () => {
    const rosterEntries = [{ team: "phi", position: "QB", playerId: "gsis:hurts", playerName: "Jalen Hurts" }];
    const week1Result = resolvePlayerIdentity(
      { providerName: "Jalen Hurts", homeTeamFullName: "Philadelphia Eagles", awayTeamFullName: "Washington Commanders", canonicalMarket: PASSING_YARDS_MARKET, targetWeek: 1 },
      { rosterIndex: buildRosterNameIndex(rosterEntries), gameIndex: buildGameIndex([wasWeek1, wasWeek8]), marketPlausiblePositions: MARKET_PLAUSIBLE_POSITIONS },
    );
    expect(week1Result.resolved).toBe(true);
    expect(week1Result.identity.gameId).toBe("2026_01_WAS_PHI");
    expect(week1Result.identity.week).toBe(1);
  });
});

describe("normalizeRosterTeamAbbr / roster-source team normalization (LA/WAS root cause)", () => {
  it("roster team LA canonicalizes to lar (1)", () => {
    expect(normalizeRosterTeamAbbr("LA")).toBe("lar");
    expect(normalizeRosterTeamAbbr("la")).toBe("lar");
  });

  it("roster team LAR canonicalizes to lar (2)", () => {
    expect(normalizeRosterTeamAbbr("LAR")).toBe("lar");
  });

  it("roster team WAS canonicalizes to wsh (3)", () => {
    expect(normalizeRosterTeamAbbr("WAS")).toBe("wsh");
    expect(normalizeRosterTeamAbbr("was")).toBe("wsh");
  });

  it("roster team WSH canonicalizes to wsh (4)", () => {
    expect(normalizeRosterTeamAbbr("WSH")).toBe("wsh");
  });

  it("does not affect unrelated teams -- Chargers, Jets, Giants pass through unchanged", () => {
    expect(normalizeRosterTeamAbbr("LAC")).toBe("lac");
    expect(normalizeRosterTeamAbbr("NYJ")).toBe("nyj");
    expect(normalizeRosterTeamAbbr("NYG")).toBe("nyg");
    expect(normalizeRosterTeamAbbr("SEA")).toBe("sea");
  });

  it("buildRosterNameIndex applies the normalization to every entry's team field", () => {
    const entries = [
      { team: "LA", position: "WR", playerId: "gsis:rams-wr", playerName: "Puka Nacua" },
      { team: "WAS", position: "QB", playerId: "gsis:cmdrs-qb", playerName: "Jayden Daniels" },
    ];
    const index = buildRosterNameIndex(entries);
    expect(index.get("puka nacua")[0].team).toBe("lar");
    expect(index.get("jayden daniels")[0].team).toBe("wsh");
  });
});

describe("Rams/Commanders identity resolution end-to-end (LA/WAS root cause)", () => {
  const sfLaGame = { gameId: "2026_01_SF_LA", week: 1, homeTeam: "LA Rams", awayTeam: "San Francisco 49ers", homeAbbr: "lar", awayAbbr: "sf", status: "scheduled", dateUtc: "2026-09-14T20:25:00Z" };
  const wasPhiGame = { gameId: "2026_01_WAS_PHI", week: 1, homeTeam: "Philadelphia Eagles", awayTeam: "Washington Commanders", homeAbbr: "phi", awayAbbr: "wsh", status: "scheduled", dateUtc: "2026-09-14T17:00:00Z" };

  // Roster-source shape: raw nflverse depth-chart team codes ("LA", "WAS"),
  // matching what loadDepthChartEntries actually passes through today.
  const rosterEntries = [
    { team: "LA", position: "WR", playerId: "gsis:rams-wr", playerName: "Puka Nacua" },
    { team: "SF", position: "QB", playerId: "gsis:niners-qb", playerName: "Brock Purdy" },
    { team: "WAS", position: "QB", playerId: "gsis:cmdrs-qb", playerName: "Jayden Daniels" },
    { team: "PHI", position: "QB", playerId: "gsis:eagles-qb", playerName: "Jalen Hurts" },
  ];

  function endToEndContext() {
    return {
      rosterIndex: buildRosterNameIndex(rosterEntries),
      gameIndex: buildGameIndex([sfLaGame, wasPhiGame]),
      marketPlausiblePositions: MARKET_PLAUSIBLE_POSITIONS,
    };
  }

  it("Rams player resolves in SF@LA (5)", () => {
    const result = resolvePlayerIdentity(
      { providerName: "Puka Nacua", homeTeamFullName: "LA Rams", awayTeamFullName: "San Francisco 49ers", canonicalMarket: "receivingYards" },
      { ...endToEndContext(), marketPlausiblePositions: { receivingYards: ["WR"] } },
    );
    expect(result.resolved).toBe(true);
    expect(result.identity).toMatchObject({ playerId: "gsis:rams-wr", team: "lar", opponent: "sf", gameId: "2026_01_SF_LA" });
  });

  it("Commanders player resolves in WAS@PHI (6)", () => {
    const result = resolvePlayerIdentity(
      { providerName: "Jayden Daniels", homeTeamFullName: "Philadelphia Eagles", awayTeamFullName: "Washington Commanders", canonicalMarket: PASSING_YARDS_MARKET },
      endToEndContext(),
    );
    expect(result.resolved).toBe(true);
    expect(result.identity).toMatchObject({ playerId: "gsis:cmdrs-qb", team: "wsh", opponent: "phi", gameId: "2026_01_WAS_PHI" });
  });

  it("SF opponent still resolves in the same game (7)", () => {
    const result = resolvePlayerIdentity(
      { providerName: "Brock Purdy", homeTeamFullName: "LA Rams", awayTeamFullName: "San Francisco 49ers", canonicalMarket: PASSING_YARDS_MARKET },
      endToEndContext(),
    );
    expect(result.resolved).toBe(true);
    expect(result.identity).toMatchObject({ playerId: "gsis:niners-qb", team: "sf", opponent: "lar", gameId: "2026_01_SF_LA" });
  });

  it("PHI opponent still resolves in the same game (8)", () => {
    const result = resolvePlayerIdentity(
      { providerName: "Jalen Hurts", homeTeamFullName: "Philadelphia Eagles", awayTeamFullName: "Washington Commanders", canonicalMarket: PASSING_YARDS_MARKET },
      endToEndContext(),
    );
    expect(result.resolved).toBe(true);
    expect(result.identity).toMatchObject({ playerId: "gsis:eagles-qb", team: "phi", opponent: "wsh", gameId: "2026_01_WAS_PHI" });
  });

  it("introduces no new duplicate/ambiguous identity matches -- each player still resolves to exactly one candidate (9)", () => {
    for (const [providerName, home, away, market, expectedId] of [
      ["Puka Nacua", "LA Rams", "San Francisco 49ers", "receivingYards", "gsis:rams-wr"],
      ["Brock Purdy", "LA Rams", "San Francisco 49ers", PASSING_YARDS_MARKET, "gsis:niners-qb"],
      ["Jayden Daniels", "Philadelphia Eagles", "Washington Commanders", PASSING_YARDS_MARKET, "gsis:cmdrs-qb"],
      ["Jalen Hurts", "Philadelphia Eagles", "Washington Commanders", PASSING_YARDS_MARKET, "gsis:eagles-qb"],
    ]) {
      const result = resolvePlayerIdentity(
        { providerName, homeTeamFullName: home, awayTeamFullName: away, canonicalMarket: market },
        { ...endToEndContext(), marketPlausiblePositions: { ...MARKET_PLAUSIBLE_POSITIONS, receivingYards: ["WR"] } },
      );
      expect(result.resolved).toBe(true);
      expect(result.identity.playerId).toBe(expectedId);
    }
  });
});
