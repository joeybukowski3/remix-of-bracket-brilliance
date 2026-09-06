import { describe, expect, it } from "vitest";
import {
  atsShrinkageSweep,
  buildCoachResearch,
  pearson,
  shrinkAtsRate,
  shrinkMeanTowardZero,
  splitHalfPersistence,
  summarizeSignal,
} from "./nfl-coach-research.mjs";

const g = (o) => ({
  game_id: o.id,
  season: String(o.season),
  game_type: "REG",
  week: String(o.week),
  gameday: `${o.season}-${String(o.week).padStart(2, "0")}-10`,
  gametime: "13:00",
  home_team: o.home,
  away_team: o.away,
  home_score: String(o.hs),
  away_score: String(o.as),
  spread_line: o.spread == null ? "" : String(o.spread),
  home_coach: o.hc,
  away_coach: o.ac,
  home_rest: "7",
  away_rest: "7",
  div_game: "0",
});

/** Build a synthetic 6-season league: coach "steady" always beats the number,
 *  coach "coin" is exactly average. */
function syntheticRows() {
  const rows = [];
  for (let season = 2010; season <= 2015; season += 1) {
    for (let week = 1; week <= 8; week += 1) {
      const id = `${season}_${String(week).padStart(2, "0")}`;
      // steady @ home vs filler: laying 3, wins by 10 -> covers, beats expectation
      rows.push(g({ id: `${id}_S`, season, week, home: "KC", away: "DEN", hs: 27, as: 17, spread: 3, hc: "Steady Sam", ac: `Filler ${week}` }));
      // coin @ home laying 3: wins by 3 on odd weeks, loses by 7 on even weeks
      // -> roughly a .500 team that underperforms its number
      const coinWin = week % 2 === 1;
      rows.push(g({ id: `${id}_C`, season, week, home: "SF", away: "SEA", hs: coinWin ? 20 : 13, as: coinWin ? 17 : 20, spread: 3, hc: "Coin Carl", ac: `Guy ${week}` }));
    }
  }
  return rows;
}

describe("pearson", () => {
  it("returns null for < 3 points and 1.0 for a perfect line", () => {
    expect(pearson([[1, 1], [2, 2]]).r).toBeNull();
    expect(pearson([[1, 2], [2, 4], [3, 6]]).r).toBe(1);
  });
});

describe("shrinkage helpers", () => {
  it("shrinkAtsRate pulls small samples toward .500 and leaves large ones near raw", () => {
    expect(shrinkAtsRate(4, 0, 50)).toBeCloseTo((4 + 25) / (4 + 50), 4);
    const big = shrinkAtsRate(300, 100, 50);
    expect(big).toBeGreaterThan(0.7);
    expect(big).toBeLessThan(0.75);
  });
  it("shrinkAtsRate is monotonic in k toward .5", () => {
    const seq = [0, 10, 50, 200].map((k) => shrinkAtsRate(8, 0, k));
    for (let i = 1; i < seq.length; i += 1) expect(seq[i]).toBeLessThan(seq[i - 1]);
    expect(seq.at(-1)).toBeGreaterThan(0.5);
  });
  it("shrinkMeanTowardZero shrinks toward 0 as k grows", () => {
    expect(shrinkMeanTowardZero(10, 10, 0)).toBe(1);
    expect(Math.abs(shrinkMeanTowardZero(10, 10, 90))).toBeLessThan(0.11);
  });
});

describe("buildCoachResearch", () => {
  const { researchRows, perGame } = buildCoachResearch(syntheticRows(), {});

  it("is deterministic and NaN-free", () => {
    const again = buildCoachResearch(syntheticRows(), {}).researchRows;
    expect(JSON.stringify(researchRows)).toBe(JSON.stringify(again));
    const nums = JSON.stringify(researchRows).match(/-?\d+\.?\d*/g) ?? [];
    expect(nums.some((n) => n === "null" || Number.isNaN(Number(n)))).toBe(false);
  });

  it("excludes a coach-season's own games from its entering signal", () => {
    // Steady Sam entering 2011 should reflect only 2010 (8 games), all covers
    const sam2011 = researchRows.find((r) => r.coach_id === "steady-sam" && r.season === 2011);
    expect(sam2011.entering.career_games).toBe(8);
    expect(sam2011.entering.career_ats_pct).toBe(1);
    expect(sam2011.entering.win_over_expectation_per_game).toBeGreaterThan(0);
  });

  it("separates the higher-performing coach on win-over-expectation", () => {
    const sam = researchRows.filter((r) => r.coach_id === "steady-sam" && r.outcome_this_season);
    const carl = researchRows.filter((r) => r.coach_id === "coin-carl" && r.outcome_this_season);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(sam.map((r) => r.outcome_this_season.win_over_expectation_per_game)))
      .toBeGreaterThan(mean(carl.map((r) => r.outcome_this_season.win_over_expectation_per_game)));
  });

  it("summarizeSignal and splitHalfPersistence run without throwing on real-shaped data", () => {
    const s = summarizeSignal(researchRows, "entering.career_ats_pct", { minCareerGames: 0 });
    expect(s).toHaveProperty("year_to_year");
    expect(s).toHaveProperty("forward_win_over_expectation_same_season");
    const sh = splitHalfPersistence(perGame, { minGames: 10 });
    expect(sh.ats_pct).toHaveProperty("spearman_brown");
  });

  it("atsShrinkageSweep returns one entry per k with pearson blocks", () => {
    const sweep = atsShrinkageSweep(researchRows, [0, 25, 100]);
    expect(sweep.map((s) => s.k)).toEqual([0, 25, 100]);
    expect(sweep[0]).toHaveProperty("forward_ats_same_season");
  });
});
