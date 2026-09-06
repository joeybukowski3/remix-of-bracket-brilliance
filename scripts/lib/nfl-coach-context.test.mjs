import { describe, expect, it } from "vitest";
import {
  atsResult,
  createCoachAccumulator,
  impliedWinProb,
  straightUpResult,
  teamIsFavorite,
  toCoachGame,
} from "./nfl-coach-context.mjs";
import { buildCoachGameContext } from "./nfl-coach-context-build.mjs";

const g = (o) => ({
  game_id: o.id,
  season: String(o.season),
  game_type: o.type ?? "REG",
  week: String(o.week),
  gameday: o.day ?? `${o.season}-09-10`,
  gametime: o.time ?? "13:00",
  home_team: o.home,
  away_team: o.away,
  home_score: o.hs == null ? "" : String(o.hs),
  away_score: o.as == null ? "" : String(o.as),
  spread_line: o.spread == null ? "" : String(o.spread),
  home_coach: o.hc,
  away_coach: o.ac,
  home_qb_name: o.hqb ?? "",
  away_qb_name: o.aqb ?? "",
  home_rest: o.hrest == null ? "" : String(o.hrest),
  away_rest: o.arest == null ? "" : String(o.arest),
  div_game: o.div ? "1" : "0",
});

describe("ATS sign contract (home_cover_margin = result - spread_line)", () => {
  it("home favorite that covers", () => {
    // home wins by 10, laying 6.5 (spread_line +6.5) -> home covers
    const game = toCoachGame(g({ id: "a", season: 2020, week: 1, home: "KC", away: "HOU", hs: 30, as: 20, spread: 6.5, hc: "A", ac: "B" }));
    expect(game.homeCoverMargin).toBeCloseTo(3.5);
    expect(atsResult(game, true)).toBe("W");
    expect(atsResult(game, false)).toBe("L");
  });

  it("home favorite that fails to cover", () => {
    const game = toCoachGame(g({ id: "b", season: 2020, week: 1, home: "KC", away: "HOU", hs: 24, as: 21, spread: 6.5, hc: "A", ac: "B" }));
    expect(game.homeCoverMargin).toBeCloseTo(-3.5);
    expect(atsResult(game, true)).toBe("L");
    expect(atsResult(game, false)).toBe("W");
  });

  it("away underdog that covers", () => {
    // away loses by 3 but was +6.5 -> away covers
    const game = toCoachGame(g({ id: "c", season: 2020, week: 1, home: "KC", away: "HOU", hs: 27, as: 24, spread: 6.5, hc: "A", ac: "B" }));
    expect(atsResult(game, false)).toBe("W");
    expect(atsResult(game, true)).toBe("L");
  });

  it("exact push on a whole-number line", () => {
    const game = toCoachGame(g({ id: "d", season: 2020, week: 1, home: "KC", away: "HOU", hs: 27, as: 20, spread: 7, hc: "A", ac: "B" }));
    expect(game.homeCoverMargin).toBe(0);
    expect(atsResult(game, true)).toBe("P");
    expect(atsResult(game, false)).toBe("P");
  });

  it("null spread -> no ATS result but straight-up still grades", () => {
    const game = toCoachGame(g({ id: "e", season: 2020, week: 1, home: "KC", away: "HOU", hs: 27, as: 20, spread: null, hc: "A", ac: "B" }));
    expect(game.homeCoverMargin).toBeNull();
    expect(atsResult(game, true)).toBeNull();
    expect(straightUpResult(game, true)).toBe("W");
  });

  it("favorite detection follows spread_line sign (>0 = home favored)", () => {
    const homeFav = toCoachGame(g({ id: "f", season: 2020, week: 1, home: "KC", away: "HOU", hs: 1, as: 0, spread: 3, hc: "A", ac: "B" }));
    expect(teamIsFavorite(homeFav, true)).toBe(true);
    expect(teamIsFavorite(homeFav, false)).toBe(false);
    const pickem = toCoachGame(g({ id: "h", season: 2020, week: 1, home: "KC", away: "HOU", hs: 1, as: 0, spread: 0, hc: "A", ac: "B" }));
    expect(teamIsFavorite(pickem, true)).toBeNull();
  });

  it("impliedWinProb is symmetric around a pick'em and ordered by spread", () => {
    const pk = toCoachGame(g({ id: "i", season: 2020, week: 1, home: "KC", away: "HOU", hs: 1, as: 0, spread: 0, hc: "A", ac: "B" }));
    expect(impliedWinProb(pk, true)).toBeCloseTo(0.5, 5);
    const fav = toCoachGame(g({ id: "j", season: 2020, week: 1, home: "KC", away: "HOU", hs: 1, as: 0, spread: 7, hc: "A", ac: "B" }));
    expect(impliedWinProb(fav, true)).toBeGreaterThan(0.5);
    expect(impliedWinProb(fav, false)).toBeLessThan(0.5);
  });
});

describe("createCoachAccumulator — pregame records exclude the target game", () => {
  const acc = createCoachAccumulator();
  const rec = (o) => {
    const game = toCoachGame(g(o));
    acc.record(game, { isHome: o.home === o.team, team: o.team, opponent: "xx", week: o.week, restDays: o.rest, qbName: o.qb, teamIsDivisionGame: o.div });
  };

  it("snapshot before recording game N reflects only games 1..N-1", () => {
    // game 1: coach's team (home) wins SU, covers
    rec({ id: "1", season: 2021, week: 1, home: "KC", away: "AA", hs: 30, as: 10, spread: 3, team: "KC" });
    const before2 = acc.snapshot({ season: 2021 });
    expect(before2.career_games).toBe(1);
    expect(before2.career_wins).toBe(1);
    expect(before2.career_ats_wins).toBe(1);
    expect(before2.season_wins).toBe(1);

    // game 2: loss, no cover
    rec({ id: "2", season: 2021, week: 2, home: "BB", away: "KC", hs: 20, as: 10, spread: -3, team: "KC" });
    const before3 = acc.snapshot({ season: 2021 });
    expect(before3.career_games).toBe(2);
    expect(before3.career_wins).toBe(1);
    expect(before3.career_losses).toBe(1);
    expect(before3.career_ats_losses).toBe(1);
  });

  it("tenure resets when the coach changes team; career keeps accumulating", () => {
    const a2 = createCoachAccumulator();
    const play = (team, isHome, win) => a2.record(
      toCoachGame(g({ id: `${team}-${win}`, season: 2020, week: 1, home: isHome ? team : "ZZ", away: isHome ? "ZZ" : team, hs: isHome === win ? 20 : 10, as: isHome === win ? 10 : 20, spread: null, hc: "x", ac: "y" })),
      { isHome, team, opponent: "zz", week: 1 }
    );
    play("AAA", true, true);
    play("AAA", true, true);
    let s = a2.snapshot({ season: 2020 });
    expect(s.tenure_games).toBe(2);
    expect(s.career_games).toBe(2);
    play("BBB", true, false); // new team
    s = a2.snapshot({ season: 2020 });
    expect(s.tenure_games).toBe(1);
    expect(s.career_games).toBe(3);
  });

  it("a snapshot for a game with a NEW team reads fresh tenure before record() runs", () => {
    const a3 = createCoachAccumulator();
    a3.record(
      toCoachGame(g({ id: "old", season: 2023, week: 17, home: "TEN", away: "JAX", hs: 28, as: 20, spread: null, hc: "x", ac: "y" })),
      { isHome: true, team: "ten", opponent: "jax", week: 17 }
    );
    // same team -> tenure carries
    expect(a3.snapshot({ season: 2024, team: "ten" }).tenure_games).toBe(1);
    // moved to a new team -> tenure reads fresh, career still counts the old game
    const moved = a3.snapshot({ season: 2025, team: "ne" });
    expect(moved.tenure_games).toBe(0);
    expect(moved.tenure_year).toBe(1);
    expect(moved.first_year).toBe(true);
    expect(moved.career_games).toBe(1);
  });
});

describe("buildCoachGameContext — no same-game or future leakage", () => {
  const rows = [
    g({ id: "2018_01_x", season: 2018, week: 1, home: "KC", away: "LAC", hs: 38, as: 28, spread: 3, hc: "Andy Reid", ac: "Anthony Lynn", hqb: "P Mahomes", aqb: "P Rivers" }),
    g({ id: "2019_01_x", season: 2019, week: 1, home: "KC", away: "JAX", hs: 40, as: 26, spread: 4, hc: "Andy Reid", ac: "Doug Marrone", hqb: "P Mahomes", aqb: "N Foles" }),
    g({ id: "2019_02_x", season: 2019, week: 2, home: "OAK", away: "KC", hs: 10, as: 28, spread: -3, hc: "Jon Gruden", ac: "Andy Reid", hqb: "D Carr", aqb: "P Mahomes" }),
  ];

  it("first-ever row for a coach has an empty pregame record", () => {
    const { rowsBySeason } = buildCoachGameContext(rows, { seasons: [2018, 2019], source: "t", sourceTimestamp: "t" });
    const reid2018 = rowsBySeason.get(2018).find((r) => r.coach_id === "andy-reid");
    expect(reid2018.pregame.career_games).toBe(0);
    expect(reid2018.pregame.career_wins).toBe(0);
  });

  it("2019 week 1 sees exactly the one prior (2018) game, not itself or later games", () => {
    const { rowsBySeason } = buildCoachGameContext(rows, { seasons: [2019], source: "t", sourceTimestamp: "t" });
    const wk1 = rowsBySeason.get(2019).find((r) => r.coach_id === "andy-reid" && r.week === 1);
    expect(wk1.pregame.career_games).toBe(1);
    expect(wk1.pregame.career_wins).toBe(1);
    const wk2 = rowsBySeason.get(2019).find((r) => r.coach_id === "andy-reid" && r.week === 2);
    expect(wk2.pregame.career_games).toBe(2);
  });

  it("qb_change_flag flips when the prior game had a different QB", () => {
    const withChange = [
      g({ id: "a", season: 2020, week: 1, home: "TB", away: "NO", hs: 20, as: 10, spread: null, hc: "Coach C", ac: "Coach D", hqb: "QB One" }),
      g({ id: "b", season: 2020, week: 2, home: "TB", away: "ATL", hs: 20, as: 10, spread: null, hc: "Coach C", ac: "Coach E", hqb: "QB Two" }),
    ];
    const { rowsBySeason } = buildCoachGameContext(withChange, { seasons: [2020], source: "t", sourceTimestamp: "t" });
    const g2 = rowsBySeason.get(2020).find((r) => r.coach_id === "coach-c" && r.week === 2);
    expect(g2.pregame.qb_change_flag).toBe(true);
  });
});
