import { describe, expect, it } from "vitest";
import {
  buildCoachAppearances,
  coachIdFromName,
  deriveCoachSegments,
  franchiseAbbr,
  normalizeCoachName,
} from "./nfl-coach-core.mjs";

const row = (o) => ({
  game_id: o.id,
  season: String(o.season),
  game_type: o.type ?? "REG",
  week: String(o.week),
  gameday: o.day ?? `${o.season}-09-10`,
  gametime: o.time ?? "13:00",
  home_team: o.home,
  away_team: o.away,
  home_coach: o.hc,
  away_coach: o.ac,
});

describe("normalizeCoachName / coachIdFromName", () => {
  it("collapses whitespace and applies curated aliases", () => {
    expect(normalizeCoachName("  Sean   McVay ")).toBe("Sean McVay");
    expect(normalizeCoachName("Sean Mcvay", { "Sean Mcvay": "Sean McVay" })).toBe("Sean McVay");
  });

  it("produces a stable slug id, dropping punctuation and accents", () => {
    expect(coachIdFromName("Kevin O'Connell")).toBe("kevin-oconnell");
    expect(coachIdFromName("Sean McVay")).toBe("sean-mcvay");
    expect(coachIdFromName("Raheem Morris")).toBe("raheem-morris");
  });

  it("gives the same id across seasons and teams for one coach", () => {
    const rows = [
      row({ id: "a", season: 2011, week: 1, home: "PHI", away: "STL", hc: "Andy Reid", ac: "Steve Spagnuolo" }),
      row({ id: "b", season: 2020, week: 1, home: "KC", away: "HOU", hc: "Andy Reid", ac: "Bill O'Brien" }),
    ];
    const { appearances } = buildCoachAppearances(rows, {});
    const reid = appearances.filter((a) => a.coachName === "Andy Reid");
    expect(new Set(reid.map((a) => a.coachId))).toEqual(new Set(["andy-reid"]));
  });
});

describe("franchiseAbbr", () => {
  it("folds relocated franchises onto the current abbr", () => {
    expect(franchiseAbbr("STL")).toBe("lar");
    expect(franchiseAbbr("LA")).toBe("lar");
    expect(franchiseAbbr("SD")).toBe("lac");
    expect(franchiseAbbr("OAK")).toBe("lv");
    expect(franchiseAbbr("WAS")).toBe("wsh");
  });
  it("throws on an unknown code", () => {
    expect(() => franchiseAbbr("XYZ")).toThrow(/Unknown nflverse team code/);
  });
});

describe("deriveCoachSegments", () => {
  it("keeps one coach across a full multi-year tenure as a single segment", () => {
    const rows = [1, 2, 3].flatMap((w) => [
      row({ id: `2019_0${w}`, season: 2019, week: w, home: "KC", away: "OAK", hc: "Andy Reid", ac: "Jon Gruden" }),
      row({ id: `2020_0${w}`, season: 2020, week: w, home: "KC", away: "LV", hc: "Andy Reid", ac: "Jon Gruden" }),
    ]);
    const { appearances } = buildCoachAppearances(rows, {});
    const segs = deriveCoachSegments(appearances, {});
    const kc = segs.filter((s) => s.team === "kc");
    expect(kc).toHaveLength(1);
    expect(kc[0]).toMatchObject({ coach_id: "andy-reid", season_start: 2019, season_end: 2020, games: 6, first_year_with_team: 2019 });
  });

  it("splits a midseason coaching change into separate segments with week bounds", () => {
    const rows = [
      row({ id: "g1", season: 2022, week: 1, home: "CAR", away: "CLE", hc: "Matt Rhule", ac: "Kevin Stefanski" }),
      row({ id: "g2", season: 2022, week: 5, home: "CAR", away: "SF", hc: "Matt Rhule", ac: "Kyle Shanahan" }),
      row({ id: "g3", season: 2022, week: 6, home: "CAR", away: "LA", hc: "Steve Wilks", ac: "Sean McVay" }),
      row({ id: "g4", season: 2022, week: 18, home: "CAR", away: "NO", hc: "Steve Wilks", ac: "Dennis Allen" }),
    ];
    const { appearances } = buildCoachAppearances(rows, {});
    const segs = deriveCoachSegments(appearances, {
      interim: [{ coach_id: "steve-wilks", team: "car", season: 2022 }],
    }).filter((s) => s.team === "car");
    expect(segs.map((s) => s.coach_id)).toEqual(["matt-rhule", "steve-wilks"]);
    expect(segs[0]).toMatchObject({ effective_start: { week: 1 }, effective_end: { week: 5 }, interim_flag: false });
    expect(segs[1]).toMatchObject({ effective_start: { week: 6 }, interim_flag: true });
  });

  it("gives a returning coach a second segment after an interruption", () => {
    const rows = [
      row({ id: "a", season: 2018, week: 1, home: "CLE", away: "PIT", hc: "Hue Jackson", ac: "Mike Tomlin" }),
      row({ id: "b", season: 2018, week: 9, home: "CLE", away: "KC", hc: "Gregg Williams", ac: "Andy Reid" }),
      row({ id: "c", season: 2019, week: 1, home: "CLE", away: "TEN", hc: "Freddie Kitchens", ac: "Mike Vrabel" }),
      row({ id: "d", season: 2020, week: 1, home: "CLE", away: "BAL", hc: "Kevin Stefanski", ac: "John Harbaugh" }),
      // a hypothetical Gregg Williams return years later -> new segment
      row({ id: "e", season: 2023, week: 1, home: "CLE", away: "CIN", hc: "Gregg Williams", ac: "Zac Taylor" }),
    ];
    const { appearances } = buildCoachAppearances(rows, {});
    const segs = deriveCoachSegments(appearances, {}).filter((s) => s.team === "cle" && s.coach_id === "gregg-williams");
    expect(segs).toHaveLength(2);
    expect(segs.map((s) => s.season_start)).toEqual([2018, 2023]);
    expect(segs.every((s) => s.first_year_with_team === 2018)).toBe(true);
  });

  it("drops rows with a blank coach and records a warning instead of crashing", () => {
    const rows = [row({ id: "x", season: 2020, week: 1, home: "KC", away: "HOU", hc: "", ac: "Bill O'Brien" })];
    const { appearances, warnings } = buildCoachAppearances(rows, {});
    expect(appearances.map((a) => a.coachName)).toEqual(["Bill O'Brien"]);
    expect(warnings.join(" ")).toMatch(/blank home_coach/);
  });
});
