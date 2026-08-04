import { describe, it, expect } from "vitest";
import {
  awayTeamSpread,
  buildTeamGameLog,
  currentMarketFor,
  gradeAts,
  gradeOverUnder,
  gradeStraightUp,
  homeTeamSpread,
  isPickem,
  lastNGames,
  parseMarketRow,
  rankHigherIsBetter,
  summarizeGames,
  teamAtsMargin,
  teamIsFavorite,
  teamSpread,
} from "../../../scripts/lib/nfl-market-core.mjs";

const TEAM_MAP = new Map([
  ["NE", { abbr: "ne", name: "New England Patriots" }],
  ["SEA", { abbr: "sea", name: "Seattle Seahawks" }],
  ["KC", { abbr: "kc", name: "Kansas City Chiefs" }],
  ["PIT", { abbr: "pit", name: "Pittsburgh Steelers" }],
  ["CHI", { abbr: "chi", name: "Chicago Bears" }],
]);

function row(overrides: Record<string, unknown> = {}) {
  return {
    game_id: "2025_01_NE_SEA",
    season: "2025",
    game_type: "REG",
    week: "1",
    gameday: "2025-09-07",
    away_team: "NE",
    home_team: "SEA",
    away_score: "20",
    home_score: "24",
    location: "Home",
    spread_line: "3.5",
    total_line: "44.5",
    away_moneyline: "170",
    home_moneyline: "-205",
    ...overrides,
  };
}

const game = (overrides: Record<string, unknown> = {}) => parseMarketRow(row(overrides), TEAM_MAP);

describe("spread sign convention", () => {
  it("treats a positive spread_line as the home team favoured", () => {
    // spread_line = +3.5 -> home -3.5, away +3.5
    expect(homeTeamSpread(3.5)).toBe(-3.5);
    expect(awayTeamSpread(3.5)).toBe(3.5);

    const g = game({ spread_line: "3.5" });
    expect(teamSpread(g, "sea")).toBe(-3.5); // home
    expect(teamSpread(g, "ne")).toBe(3.5); // away
  });

  it("treats a negative spread_line as the away team favoured", () => {
    // spread_line = -3.5 -> home +3.5, away -3.5
    expect(homeTeamSpread(-3.5)).toBe(3.5);
    expect(awayTeamSpread(-3.5)).toBe(-3.5);

    const g = game({ spread_line: "-3.5" });
    expect(teamSpread(g, "sea")).toBe(3.5);
    expect(teamSpread(g, "ne")).toBe(-3.5);
  });

  it("treats spread_line 0 as pick'em with no favourite", () => {
    const g = game({ spread_line: "0" });
    expect(isPickem(g)).toBe(true);
    expect(teamSpread(g, "sea")).toBe(-0);
    expect(teamIsFavorite(g, "sea")).toBeNull();
    expect(teamIsFavorite(g, "ne")).toBeNull();
  });

  it("never inverts the two sides into the same sign", () => {
    for (const line of [-7, -3.5, -1, 1, 2.5, 10]) {
      expect(homeTeamSpread(line)).toBe(-awayTeamSpread(line));
    }
  });

  it("returns null for both sides when no line is published", () => {
    const g = game({ spread_line: "" });
    expect(teamSpread(g, "sea")).toBeNull();
    expect(teamSpread(g, "ne")).toBeNull();
  });
});

describe("schema validation", () => {
  it("parses a complete row", () => {
    expect(game()).toMatchObject({
      gameId: "2025_01_NE_SEA",
      season: 2025,
      week: 1,
      seasonType: "REG",
      homeAbbr: "sea",
      awayAbbr: "ne",
      homeScore: 24,
      awayScore: 20,
      final: true,
      neutralSite: false,
      spreadLine: 3.5,
      totalLine: 44.5,
      homeMoneyline: -205,
      awayMoneyline: 170,
    });
  });

  it("treats blank market fields as null rather than zero", () => {
    const g = game({ spread_line: "", total_line: "", home_moneyline: "", away_moneyline: "" });
    expect(g.spreadLine).toBeNull();
    expect(g.totalLine).toBeNull();
    expect(g.homeMoneyline).toBeNull();
    expect(g.awayMoneyline).toBeNull();
  });

  it("rejects a non-numeric market value instead of coercing it to zero", () => {
    expect(() => game({ spread_line: "n/a" })).toThrow(/Malformed spread_line/);
    expect(() => game({ total_line: "--" })).toThrow(/Malformed total_line/);
  });

  it("rejects a zero or fractional moneyline", () => {
    expect(() => game({ home_moneyline: "0" })).toThrow(/non-zero American odds/);
    expect(() => game({ away_moneyline: "1.5" })).toThrow(/non-zero American odds/);
  });

  it("rejects unknown teams, game types and locations", () => {
    expect(() => game({ home_team: "XXX" })).toThrow(/Unknown home team/);
    expect(() => game({ game_type: "PRE" })).toThrow(/Unknown game_type/);
    expect(() => game({ location: "Dome" })).toThrow(/Unknown location/);
  });

  it("rejects a half-scored game", () => {
    expect(() => game({ home_score: "24", away_score: "" })).toThrow(/only one score/);
  });

  it("marks an unplayed game as not final", () => {
    const g = game({ home_score: "", away_score: "" });
    expect(g.final).toBe(false);
    expect(gradeAts(g, "sea")).toBeNull();
    expect(gradeOverUnder(g)).toBeNull();
  });
});

describe("ATS grading", () => {
  it("grades a home favourite that covers", () => {
    // SEA -3.5, wins by 7 -> covers.
    const g = game({ spread_line: "3.5", home_score: "27", away_score: "20" });
    expect(teamAtsMargin(g, "sea")).toBeCloseTo(3.5, 10);
    expect(gradeAts(g, "sea")).toBe("W");
    expect(gradeAts(g, "ne")).toBe("L");
  });

  it("grades a home favourite that wins but does not cover", () => {
    // SEA -3.5, wins by 1 -> loses ATS while winning outright.
    const g = game({ spread_line: "3.5", home_score: "21", away_score: "20" });
    expect(gradeStraightUp(g, "sea")).toBe("W");
    expect(gradeAts(g, "sea")).toBe("L");
    expect(gradeAts(g, "ne")).toBe("W");
  });

  it("grades an away favourite that covers", () => {
    // spread_line -6 -> NE (away) -6; NE wins by 10.
    const g = game({ spread_line: "-6", home_score: "14", away_score: "24" });
    expect(teamSpread(g, "ne")).toBe(-6);
    expect(gradeAts(g, "ne")).toBe("W");
    expect(gradeAts(g, "sea")).toBe("L");
  });

  it("grades an away underdog that covers by losing narrowly", () => {
    // spread_line +7 -> NE (away) +7; NE loses by 3.
    const g = game({ spread_line: "7", home_score: "24", away_score: "21" });
    expect(gradeStraightUp(g, "ne")).toBe("L");
    expect(gradeAts(g, "ne")).toBe("W");
    expect(gradeAts(g, "sea")).toBe("L");
  });

  it("grades an exact push and never folds it into a win or a loss", () => {
    // The real 2025 push: PIT at CHI, spread_line 3, result 3.
    const g = parseMarketRow(
      row({
        game_id: "2025_12_PIT_CHI",
        away_team: "PIT",
        home_team: "CHI",
        spread_line: "3",
        home_score: "24",
        away_score: "21",
        total_line: "44.5",
      }),
      TEAM_MAP
    );
    expect(teamAtsMargin(g, "chi")).toBe(0);
    expect(gradeAts(g, "chi")).toBe("P");
    expect(gradeAts(g, "pit")).toBe("P");
  });

  it("grades a pick'em by raw margin", () => {
    const g = game({ spread_line: "0", home_score: "20", away_score: "17" });
    expect(gradeAts(g, "sea")).toBe("W");
    expect(gradeAts(g, "ne")).toBe("L");
  });

  it("produces mirrored ATS margins for the two sides", () => {
    const g = game({ spread_line: "3.5", home_score: "30", away_score: "20" });
    expect(teamAtsMargin(g, "sea")).toBeCloseTo(6.5, 10);
    expect(teamAtsMargin(g, "ne")).toBeCloseTo(-6.5, 10);
  });

  it("returns null when no line was published", () => {
    const g = game({ spread_line: "" });
    expect(teamAtsMargin(g, "sea")).toBeNull();
    expect(gradeAts(g, "sea")).toBeNull();
  });
});

describe("over/under grading", () => {
  it("grades an over", () => {
    const g = game({ total_line: "44.5", home_score: "28", away_score: "24" });
    expect(gradeOverUnder(g)).toBe("O");
  });

  it("grades an under", () => {
    const g = game({ total_line: "44.5", home_score: "13", away_score: "10" });
    expect(gradeOverUnder(g)).toBe("U");
  });

  it("grades a push on a whole-number total", () => {
    const g = game({ total_line: "44", home_score: "24", away_score: "20" });
    expect(gradeOverUnder(g)).toBe("P");
  });

  it("cannot push on a half-point total", () => {
    for (const [home, away] of [[24, 20], [25, 20], [22, 22]]) {
      const g = game({ total_line: "44.5", home_score: String(home), away_score: String(away) });
      expect(gradeOverUnder(g)).not.toBe("P");
    }
  });

  it("returns null when no total was published", () => {
    expect(gradeOverUnder(game({ total_line: "" }))).toBeNull();
  });
});

describe("favourite / underdog", () => {
  it("identifies the favourite from the spread orientation", () => {
    const homeFav = game({ spread_line: "3.5" });
    expect(teamIsFavorite(homeFav, "sea")).toBe(true);
    expect(teamIsFavorite(homeFav, "ne")).toBe(false);

    const awayFav = game({ spread_line: "-3.5" });
    expect(teamIsFavorite(awayFav, "sea")).toBe(false);
    expect(teamIsFavorite(awayFav, "ne")).toBe(true);
  });

  it("refuses to bucket a pick'em", () => {
    const g = game({ spread_line: "0" });
    expect(teamIsFavorite(g, "sea")).toBeNull();
  });
});

describe("game log and windows", () => {
  function log(specs: [number, string, string, Record<string, unknown>?][]) {
    return specs.map(([week, away, home, extra]) =>
      parseMarketRow(
        row({
          game_id: `2025_${String(week).padStart(2, "0")}_${away}_${home}`,
          week: String(week),
          gameday: `2025-09-${String(week).padStart(2, "0")}`,
          away_team: away,
          home_team: home,
          ...extra,
        }),
        TEAM_MAP
      )
    );
  }

  const games = log([
    [1, "NE", "SEA"],
    [2, "SEA", "KC"],
    // week 3 is a bye for SEA — no row at all
    [4, "SEA", "PIT", { location: "Neutral" }],
    [5, "CHI", "SEA"],
    [6, "SEA", "NE"],
    [7, "PIT", "SEA", { game_type: "WC" }],
    [8, "SEA", "CHI", { home_score: "", away_score: "" }],
  ]);

  it("includes only completed regular-season games", () => {
    const seaLog = buildTeamGameLog(games, "sea", 2025);
    // Excludes the WC postseason game and the unplayed week 8 game.
    expect(seaLog.map((g) => g.week)).toEqual([1, 2, 4, 5, 6]);
  });

  it("skips byes naturally rather than counting calendar weeks", () => {
    const seaLog = buildTeamGameLog(games, "sea", 2025);
    expect(seaLog.map((g) => g.week)).not.toContain(3);
    expect(lastNGames(seaLog, 3).map((g) => g.week)).toEqual([4, 5, 6]);
  });

  it("orders chronologically", () => {
    const seaLog = buildTeamGameLog(games, "sea", 2025);
    const days = seaLog.map((g) => g.gameday);
    expect([...days].sort()).toEqual(days);
  });

  it("returns the whole log when fewer games than the window exist", () => {
    const seaLog = buildTeamGameLog(games, "sea", 2025);
    expect(lastNGames(seaLog, 8)).toHaveLength(5);
  });

  it("never blends seasons", () => {
    const other = log([[1, "NE", "SEA"]]).map((g) => ({ ...g, season: 2026 }));
    const combined = [...games, ...other];
    expect(buildTeamGameLog(combined, "sea", 2025).every((g) => g.season === 2025)).toBe(true);
    expect(buildTeamGameLog(combined, "sea", 2026)).toHaveLength(1);
  });

  describe("neutral-site handling", () => {
    const seaLog = buildTeamGameLog(games, "sea", 2025);
    const profile = summarizeGames(seaLog, "sea");

    it("uses the location field, never the stadium name", () => {
      const neutral = seaLog.find((g) => g.week === 4)!;
      expect(neutral.neutralSite).toBe(true);
      // Nothing in the record depends on a venue string.
      expect(Object.keys(neutral)).not.toContain("stadium");
    });

    it("counts the neutral game in the overall ATS and O/U records", () => {
      const totalAts = profile.ats.W + profile.ats.L + profile.ats.P;
      const totalOu = profile.overUnder.O + profile.overUnder.U + profile.overUnder.P;
      expect(profile.games).toBe(5);
      expect(totalAts).toBe(5);
      expect(totalOu).toBe(5);
      expect(profile.neutralGames).toBe(1);
    });

    it("excludes the neutral game from both home and away splits", () => {
      const homeCount = profile.homeAts.W + profile.homeAts.L + profile.homeAts.P;
      const awayCount = profile.awayAts.W + profile.awayAts.L + profile.awayAts.P;
      // 5 games: 2 true home, 2 true away, 1 neutral (SEA was designated away).
      expect(profile.homeGames).toBe(2);
      expect(profile.awayGames).toBe(2);
      expect(homeCount + awayCount).toBe(4);
      expect(homeCount + awayCount).toBeLessThan(profile.games);
    });
  });
});

describe("summaries", () => {
  it("preserves pushes in both records and reports differentials", () => {
    const games = [
      parseMarketRow(row({ game_id: "g1", spread_line: "3", home_score: "24", away_score: "21", total_line: "45" }), TEAM_MAP),
      parseMarketRow(row({ game_id: "g2", spread_line: "3", home_score: "31", away_score: "20", total_line: "45" }), TEAM_MAP),
      parseMarketRow(row({ game_id: "g3", spread_line: "3", home_score: "10", away_score: "20", total_line: "45" }), TEAM_MAP),
    ];
    const p = summarizeGames(games, "sea");
    expect(p.ats).toEqual({ W: 1, L: 1, P: 1 });
    expect(p.overUnder).toEqual({ O: 1, U: 1, P: 1 });
    expect(p.record).toEqual({ W: 2, L: 1, T: 0 });
    // ATS margins: 0, +8, -13 -> mean -5/3
    expect(p.atsDifferential).toBeCloseTo(-5 / 3, 10);
    // Point margins: +3, +11, -10 -> mean +4/3
    expect(p.pointDifferential).toBeCloseTo(4 / 3, 10);
  });

  it("returns null differentials with no games", () => {
    const p = summarizeGames([], "sea");
    expect(p.atsDifferential).toBeNull();
    expect(p.pointDifferential).toBeNull();
    expect(p.games).toBe(0);
  });
});

describe("current market normalization", () => {
  it("converts to conventional orientation and keeps the raw value", () => {
    const m = currentMarketFor(game({ spread_line: "3.5" }));
    expect(m.spread).toEqual({ home: -3.5, away: 3.5 });
    expect(m.rawSpreadLine).toBe(3.5);
    expect(m.moneyline).toEqual({ home: -205, away: 170 });
    expect(m.total).toBe(44.5);
  });

  it("keeps each market field independent when one is missing", () => {
    const noMl = currentMarketFor(game({ home_moneyline: "", away_moneyline: "" }));
    expect(noMl.spread.home).toBe(-3.5);
    expect(noMl.total).toBe(44.5);
    expect(noMl.moneyline).toEqual({ home: null, away: null });

    const noSpread = currentMarketFor(game({ spread_line: "" }));
    expect(noSpread.spread).toEqual({ home: null, away: null });
    expect(noSpread.moneyline.home).toBe(-205); // never used to derive a spread
    expect(noSpread.total).toBe(44.5);

    const noTotal = currentMarketFor(game({ total_line: "" }));
    expect(noTotal.total).toBeNull();
    expect(noTotal.spread.home).toBe(-3.5);
  });

  it("returns an all-null market for an unpriced game", () => {
    const m = currentMarketFor(
      game({ spread_line: "", total_line: "", home_moneyline: "", away_moneyline: "" })
    );
    expect(m.spread).toEqual({ home: null, away: null });
    expect(m.moneyline).toEqual({ home: null, away: null });
    expect(m.total).toBeNull();
  });
});

describe("ranking", () => {
  it("ranks higher values first and shares a rank on ties", () => {
    const ranks = rankHigherIsBetter({ a: 5, b: 5, c: 1, d: null });
    expect(ranks.a).toBe(1);
    expect(ranks.b).toBe(1);
    expect(ranks.c).toBe(3);
    expect(ranks.d).toBeUndefined();
  });
});
