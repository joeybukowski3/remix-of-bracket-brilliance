import { describe, expect, it } from "vitest";
import {
  matchMlbTeam,
  parseStringArray,
  parsePrice,
  parseYesNoMarket,
  parseTwoTeamMarket,
  findMoneylineMarket,
  isRejectableMarket,
  matchEventToGame,
  formatCents,
  formatProbability,
  normalizeMoneylineResponse,
  MLB_TEAM_ALIASES,
  type PolymarketMlbMarket,
  type PolymarketMlbEvent,
  type ScheduleGame,
} from "./polymarketMoneylines.js";

// ---------------------------------------------------------------------------
// 1–2: JSON-encoded outcomes / outcomePrices
// ---------------------------------------------------------------------------

describe("parseStringArray", () => {
  it("parses a JSON-encoded string array", () => {
    expect(parseStringArray('[\"Yes\", \"No\"]')).toEqual(["Yes", "No"]);
  });

  it("parses an actual array", () => {
    expect(parseStringArray(["Yes", "No"])).toEqual(["Yes", "No"]);
  });

  it("returns null for malformed JSON", () => {
    expect(parseStringArray("{bad}")).toBeNull();
  });

  it("returns null for non-array JSON", () => {
    expect(parseStringArray('{"a":1}')).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(parseStringArray(null)).toBeNull();
    expect(parseStringArray(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3: Explicit Yes/No market parsing
// ---------------------------------------------------------------------------

describe("parseYesNoMarket", () => {
  it("parses a standard Yes/No market", () => {
    const result = parseYesNoMarket(
      '["Yes", "No"]',
      '["0.57", "0.43"]',
    );
    expect(result.yesPrice).toBe(0.57);
    expect(result.noPrice).toBe(0.43);
  });

  // 5: YES not at index zero
  it("handles YES not at index zero", () => {
    const result = parseYesNoMarket(
      '["No", "Yes"]',
      '["0.43", "0.57"]',
    );
    expect(result.yesPrice).toBe(0.57);
    expect(result.noPrice).toBe(0.43);
  });

  // 6: Missing/malformed prices
  it("returns null prices for missing data", () => {
    const result = parseYesNoMarket(null, null);
    expect(result.yesPrice).toBeNull();
    expect(result.noPrice).toBeNull();
  });

  it("returns null prices for length mismatch", () => {
    const result = parseYesNoMarket('["Yes"]', '["0.5", "0.5"]');
    expect(result.yesPrice).toBeNull();
    expect(result.noPrice).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4: Two-team outcome market parsing
// ---------------------------------------------------------------------------

describe("parseTwoTeamMarket", () => {
  it("parses a two-team market with JSON-encoded strings", () => {
    const result = parseTwoTeamMarket(
      '["Cincinnati Reds", "New York Yankees"]',
      '["0.365", "0.635"]',
    );
    expect(result).not.toBeNull();
    expect(result!.get("CIN")).toEqual({ yesPrice: 0.365, noPrice: 0.635 });
    expect(result!.get("NYY")).toEqual({ yesPrice: 0.635, noPrice: 0.365 });
  });

  it("parses a two-team market with actual arrays", () => {
    const result = parseTwoTeamMarket(
      ["Los Angeles Dodgers", "Baltimore Orioles"],
      ["0.6", "0.4"],
    );
    expect(result).not.toBeNull();
    expect(result!.get("LAD")!.yesPrice).toBe(0.6);
    expect(result!.get("BAL")!.yesPrice).toBe(0.4);
  });

  it("returns null for unrecognized teams", () => {
    const result = parseTwoTeamMarket(
      '["Unknown Team", "New York Yankees"]',
      '["0.5", "0.5"]',
    );
    expect(result).toBeNull();
  });

  it("returns null for same team twice", () => {
    const result = parseTwoTeamMarket(
      '["Yankees", "New York Yankees"]',
      '["0.5", "0.5"]',
    );
    expect(result).toBeNull();
  });

  // 6: Missing prices
  it("handles out-of-range prices as null", () => {
    const result = parseTwoTeamMarket(
      '["Reds", "Yankees"]',
      '["1.5", "-0.1"]',
    );
    expect(result).not.toBeNull();
    expect(result!.get("CIN")!.yesPrice).toBeNull();
    expect(result!.get("NYY")!.yesPrice).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7: All 30 MLB team aliases
// ---------------------------------------------------------------------------

describe("matchMlbTeam – all 30 teams", () => {
  const EXPECTED_TEAMS: [string, string[]][] = [
    ["ARI", ["Arizona Diamondbacks", "D-backs", "Diamondbacks"]],
    ["ATL", ["Atlanta Braves", "Braves"]],
    ["BAL", ["Baltimore Orioles", "Orioles"]],
    ["BOS", ["Boston Red Sox", "Red Sox"]],
    ["CHC", ["Chicago Cubs", "Cubs"]],
    ["CIN", ["Cincinnati Reds", "Reds"]],
    ["CLE", ["Cleveland Guardians", "Guardians"]],
    ["COL", ["Colorado Rockies", "Rockies"]],
    ["CWS", ["Chicago White Sox", "White Sox"]],
    ["DET", ["Detroit Tigers", "Tigers"]],
    ["HOU", ["Houston Astros", "Astros"]],
    ["KC", ["Kansas City Royals", "Royals"]],
    ["LAA", ["Los Angeles Angels", "LA Angels", "Angels"]],
    ["LAD", ["Los Angeles Dodgers", "LA Dodgers", "Dodgers"]],
    ["MIA", ["Miami Marlins", "Marlins"]],
    ["MIL", ["Milwaukee Brewers", "Brewers"]],
    ["MIN", ["Minnesota Twins", "Twins"]],
    ["NYM", ["New York Mets", "NY Mets", "Mets"]],
    ["NYY", ["New York Yankees", "NY Yankees", "Yankees"]],
    ["ATH", ["Athletics", "Oakland Athletics", "A's"]],
    ["PHI", ["Philadelphia Phillies", "Phillies"]],
    ["PIT", ["Pittsburgh Pirates", "Pirates"]],
    ["SD", ["San Diego Padres", "Padres"]],
    ["SEA", ["Seattle Mariners", "Mariners"]],
    ["SF", ["San Francisco Giants", "SF Giants", "Giants"]],
    ["STL", ["St. Louis Cardinals", "Cardinals"]],
    ["TB", ["Tampa Bay Rays", "Rays"]],
    ["TEX", ["Texas Rangers", "Rangers"]],
    ["TOR", ["Toronto Blue Jays", "Blue Jays"]],
    ["WSH", ["Washington Nationals", "Nationals"]],
  ];

  // Verify all 30 teams have aliases
  it("covers all 30 MLB teams", () => {
    expect(Object.keys(MLB_TEAM_ALIASES)).toHaveLength(30);
  });

  for (const [abbr, aliases] of EXPECTED_TEAMS) {
    for (const alias of aliases) {
      it(`matches "${alias}" → ${abbr}`, () => {
        expect(matchMlbTeam(alias)).toBe(abbr);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 8: Matchup extraction from market title
// ---------------------------------------------------------------------------

describe("matchup extraction", () => {
  it("extracts teams from 'Cincinnati Reds vs. New York Yankees'", () => {
    const t1 = matchMlbTeam("Cincinnati Reds");
    const t2 = matchMlbTeam("New York Yankees");
    expect(t1).toBe("CIN");
    expect(t2).toBe("NYY");
  });
});

// ---------------------------------------------------------------------------
// 9: Home/away order differences
// ---------------------------------------------------------------------------

describe("home/away order", () => {
  it("handles either team order in outcomes", () => {
    const r1 = parseTwoTeamMarket(
      '["Yankees", "Reds"]',
      '["0.6", "0.4"]',
    );
    const r2 = parseTwoTeamMarket(
      '["Reds", "Yankees"]',
      '["0.4", "0.6"]',
    );
    expect(r1!.get("NYY")!.yesPrice).toBe(0.6);
    expect(r2!.get("NYY")!.yesPrice).toBe(0.6);
  });
});

// ---------------------------------------------------------------------------
// 10: Doubleheader matching
// ---------------------------------------------------------------------------

describe("doubleheader matching", () => {
  const schedule: ScheduleGame[] = [
    {
      gamePk: 1001,
      gameDate: "2026-06-20T17:10:00Z",
      status: "Scheduled",
      venue: "Yankee Stadium",
      gameNumber: 1,
      away: { id: 113, name: "Cincinnati Reds", abbreviation: "CIN" },
      home: { id: 147, name: "New York Yankees", abbreviation: "NYY" },
    },
    {
      gamePk: 1002,
      gameDate: "2026-06-20T23:10:00Z",
      status: "Scheduled",
      venue: "Yankee Stadium",
      gameNumber: 2,
      away: { id: 113, name: "Cincinnati Reds", abbreviation: "CIN" },
      home: { id: 147, name: "New York Yankees", abbreviation: "NYY" },
    },
  ];

  it("matches game 1 by start time", () => {
    const event: PolymarketMlbEvent = {
      id: "100",
      title: "Cincinnati Reds vs. New York Yankees",
      startTime: "2026-06-20T17:10:00Z",
      teams: [{ name: "Cincinnati Reds" }, { name: "New York Yankees" }],
    };
    const result = matchEventToGame(event, schedule, new Set());
    expect(result).not.toBe("ambiguous");
    expect(result).not.toBeNull();
    expect((result as ScheduleGame).gamePk).toBe(1001);
  });

  it("does not cross-match events to the same game", () => {
    const event1: PolymarketMlbEvent = {
      id: "100",
      title: "Cincinnati Reds vs. New York Yankees",
      startTime: "2026-06-20T17:10:00Z",
      teams: [{ name: "Cincinnati Reds" }, { name: "New York Yankees" }],
    };
    const alreadyMatched = new Set<number>();
    const result1 = matchEventToGame(event1, schedule, alreadyMatched);
    expect((result1 as ScheduleGame).gamePk).toBe(1001);
    alreadyMatched.add(1001);

    const event2: PolymarketMlbEvent = {
      id: "101",
      title: "Cincinnati Reds vs. New York Yankees",
      startTime: "2026-06-20T23:10:00Z",
      teams: [{ name: "Cincinnati Reds" }, { name: "New York Yankees" }],
    };
    const result2 = matchEventToGame(event2, schedule, alreadyMatched);
    expect(result2).not.toBe("ambiguous");
    expect(result2).not.toBeNull();
    expect((result2 as ScheduleGame).gamePk).toBe(1002);
  });
});

// ---------------------------------------------------------------------------
// 11–15: Rejecting non-moneyline markets
// ---------------------------------------------------------------------------

describe("market rejection", () => {
  const makeMarket = (overrides: Partial<PolymarketMlbMarket>): PolymarketMlbMarket => ({
    id: "1",
    outcomes: '["Cincinnati Reds", "New York Yankees"]',
    outcomePrices: '["0.4", "0.6"]',
    ...overrides,
  });

  it("rejects totals / O/U", () => {
    expect(isRejectableMarket(makeMarket({ groupItemTitle: "O/U 8.5" }))).toBe(true);
    expect(isRejectableMarket(makeMarket({ question: "Over/Under 8.5 runs" }))).toBe(true);
  });

  it("rejects run-line/spread markets", () => {
    expect(isRejectableMarket(makeMarket({ groupItemTitle: "Spread -1.5" }))).toBe(true);
    expect(isRejectableMarket(makeMarket({ question: "Run line: Yankees -1.5" }))).toBe(true);
  });

  it("rejects first-five-inning markets", () => {
    expect(isRejectableMarket(makeMarket({ groupItemTitle: "1st 5 Innings O/U 3.5" }))).toBe(true);
    expect(isRejectableMarket(makeMarket({ question: "First 5 innings spread" }))).toBe(true);
  });

  it("rejects player props", () => {
    expect(isRejectableMarket(makeMarket({ question: "Home run prop: Judge" }))).toBe(true);
    expect(isRejectableMarket(makeMarket({ question: "Strikeout total: Cole" }))).toBe(true);
  });

  it("rejects futures", () => {
    expect(isRejectableMarket(makeMarket({ question: "World Series champion 2026" }))).toBe(true);
    expect(isRejectableMarket(makeMarket({ question: "Division winner" }))).toBe(true);
    expect(isRejectableMarket(makeMarket({ question: "AL Pennant winner" }))).toBe(true);
  });

  it("rejects NRFI", () => {
    expect(isRejectableMarket(makeMarket({ groupItemTitle: "NRFI" }))).toBe(true);
  });

  it("rejects extra innings", () => {
    expect(isRejectableMarket(makeMarket({ groupItemTitle: "Extra Innings" }))).toBe(true);
  });

  it("accepts a clean moneyline market", () => {
    expect(
      isRejectableMarket(
        makeMarket({ groupItemTitle: "-", question: "Cincinnati Reds vs. New York Yankees" }),
      ),
    ).toBe(false);
  });
});

describe("findMoneylineMarket", () => {
  it("finds the game-winner market among mixed markets", () => {
    const markets: PolymarketMlbMarket[] = [
      {
        id: "1",
        groupItemTitle: "Spread -1.5",
        question: "Spread: Yankees (-1.5)",
        outcomes: '["New York Yankees", "Cincinnati Reds"]',
        outcomePrices: '["0.5", "0.5"]',
      },
      {
        id: "2",
        groupItemTitle: "O/U 8.5",
        question: "Reds vs Yankees O/U 8.5",
        outcomes: '["Over", "Under"]',
        outcomePrices: '["0.55", "0.45"]',
      },
      {
        id: "3",
        groupItemTitle: "-",
        question: "Cincinnati Reds vs. New York Yankees",
        outcomes: '["Cincinnati Reds", "New York Yankees"]',
        outcomePrices: '["0.365", "0.635"]',
      },
      {
        id: "4",
        groupItemTitle: "NRFI",
        question: "Will there be a run scored in the first inning?",
        outcomes: '["Yes", "No"]',
        outcomePrices: '["0.55", "0.45"]',
      },
    ];

    const result = findMoneylineMarket(markets);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("3");
  });

  it("returns null when no moneyline exists", () => {
    const markets: PolymarketMlbMarket[] = [
      {
        id: "1",
        groupItemTitle: "O/U 8.5",
        question: "Over/Under 8.5",
        outcomes: '["Over", "Under"]',
        outcomePrices: '["0.5", "0.5"]',
      },
    ];
    expect(findMoneylineMarket(markets)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 16: Unmatched scheduled games
// ---------------------------------------------------------------------------

describe("unmatched scheduled games", () => {
  it("returns unmatched games with null prices", () => {
    const schedule: ScheduleGame[] = [
      {
        gamePk: 999,
        gameDate: "2026-06-20T20:10:00Z",
        status: "Scheduled",
        venue: "Some Park",
        away: { id: 140, name: "Texas Rangers", abbreviation: "TEX" },
        home: { id: 137, name: "San Francisco Giants", abbreviation: "SF" },
      },
    ];

    const result = normalizeMoneylineResponse([], schedule, "2026-06-20", false);
    expect(result.games).toHaveLength(1);
    expect(result.games[0].matched).toBe(false);
    expect(result.games[0].away.yesPrice).toBeNull();
    expect(result.games[0].home.yesPrice).toBeNull();
    expect(result.matchedCount).toBe(0);
    expect(result.totalGames).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 17: Game sorting by start time
// ---------------------------------------------------------------------------

describe("game sorting", () => {
  it("sorts games by gameDate ascending", () => {
    const schedule: ScheduleGame[] = [
      {
        gamePk: 2,
        gameDate: "2026-06-20T23:00:00Z",
        status: "Scheduled",
        venue: "Park B",
        away: { id: 1, name: "A", abbreviation: "CIN" },
        home: { id: 2, name: "B", abbreviation: "NYY" },
      },
      {
        gamePk: 1,
        gameDate: "2026-06-20T17:00:00Z",
        status: "Scheduled",
        venue: "Park A",
        away: { id: 3, name: "C", abbreviation: "BOS" },
        home: { id: 4, name: "D", abbreviation: "NYM" },
      },
    ];

    const result = normalizeMoneylineResponse([], schedule, "2026-06-20", false);
    expect(result.games[0].gamePk).toBe(1);
    expect(result.games[1].gamePk).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 18: Correct cents and probability formatting
// ---------------------------------------------------------------------------

describe("formatting", () => {
  it("formats cents correctly", () => {
    expect(formatCents(0.54)).toBe("54¢");
    expect(formatCents(0.635)).toBe("64¢");
    expect(formatCents(null)).toBe("—");
    expect(formatCents(1)).toBe("100¢");
    expect(formatCents(0)).toBe("0¢");
  });

  it("formats probability correctly", () => {
    expect(formatProbability(0.54)).toBe("54%");
    expect(formatProbability(null)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// 19: Stale fallback normalization
// ---------------------------------------------------------------------------

describe("stale fallback", () => {
  it("sets stale: false on fresh response", () => {
    const result = normalizeMoneylineResponse([], [], "2026-06-20", false);
    expect(result.stale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 20: Ambiguous market rejection
// ---------------------------------------------------------------------------

describe("ambiguous match rejection", () => {
  it("rejects ambiguous doubleheader matches without start time", () => {
    const schedule: ScheduleGame[] = [
      {
        gamePk: 1001,
        gameDate: "2026-06-20T17:10:00Z",
        status: "Scheduled",
        venue: "Park",
        gameNumber: 1,
        away: { id: 113, name: "Cincinnati Reds", abbreviation: "CIN" },
        home: { id: 147, name: "New York Yankees", abbreviation: "NYY" },
      },
      {
        gamePk: 1002,
        gameDate: "2026-06-20T23:10:00Z",
        status: "Scheduled",
        venue: "Park",
        gameNumber: 2,
        away: { id: 113, name: "Cincinnati Reds", abbreviation: "CIN" },
        home: { id: 147, name: "New York Yankees", abbreviation: "NYY" },
      },
    ];

    const event: PolymarketMlbEvent = {
      id: "100",
      title: "Cincinnati Reds vs. New York Yankees",
      // No startTime — ambiguous
      teams: [{ name: "Cincinnati Reds" }, { name: "New York Yankees" }],
    };

    const result = matchEventToGame(event, schedule, new Set());
    expect(result).toBe("ambiguous");
  });
});

// ---------------------------------------------------------------------------
// parsePrice edge cases
// ---------------------------------------------------------------------------

describe("parsePrice", () => {
  it("accepts valid 0–1 range", () => {
    expect(parsePrice("0.5")).toBe(0.5);
    expect(parsePrice("0")).toBe(0);
    expect(parsePrice("1")).toBe(1);
  });

  it("rejects out-of-range", () => {
    expect(parsePrice("1.5")).toBeNull();
    expect(parsePrice("-0.1")).toBeNull();
    expect(parsePrice("NaN")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
  });
});
