import { describe, expect, it } from "vitest";
import { buildDefenseAllowedWindow, buildOffenseWindow, buildScoringSupportIndex } from "./teamScoringFeatures";
import type { NflTotalResearchScoringSupportRow } from "./types";

function row(partial: Partial<NflTotalResearchScoringSupportRow> & Pick<NflTotalResearchScoringSupportRow, "gameId" | "season" | "week" | "team" | "opponent">): NflTotalResearchScoringSupportRow {
  return {
    eligiblePlays: 60,
    offEpaSum: 6,
    successNum: 24,
    successDen: 60,
    explosiveCount: 6,
    ...partial,
  };
}

describe("teamScoringFeatures", () => {
  it("coalesces to season-prior games when the team has already played this season", () => {
    const rows = [
      row({ gameId: "2021_10_buf_x", season: 2021, week: 10, team: "buf", opponent: "nyj", eligiblePlays: 60, offEpaSum: -30 }), // prior season -- should NOT be used
      row({ gameId: "2022_01_buf_x", season: 2022, week: 1, team: "buf", opponent: "mia", eligiblePlays: 50, offEpaSum: 10 }),
      row({ gameId: "2022_02_buf_x", season: 2022, week: 2, team: "buf", opponent: "nyj", eligiblePlays: 50, offEpaSum: 10 }),
    ];
    const index = buildScoringSupportIndex(rows);
    const window = buildOffenseWindow(index, "buf", { season: 2022, week: 3 });
    expect(window.window).toBe("seasonPrior");
    expect(window.sampleGames).toBe(2);
    expect(window.epaPerPlay).toBeCloseTo(20 / 100, 6);
  });

  it("falls back to the entire immediately-prior season when the team has no games yet this season (Week 1)", () => {
    const rows = [
      row({ gameId: "2021_01_buf_x", season: 2021, week: 1, team: "buf", opponent: "mia", eligiblePlays: 60, offEpaSum: 6 }),
      row({ gameId: "2021_18_buf_x", season: 2021, week: 18, team: "buf", opponent: "nyj", eligiblePlays: 60, offEpaSum: 12 }),
      row({ gameId: "2020_01_buf_x", season: 2020, week: 1, team: "buf", opponent: "mia", eligiblePlays: 60, offEpaSum: -100 }), // two seasons back -- should NOT be used
    ];
    const index = buildScoringSupportIndex(rows);
    const window = buildOffenseWindow(index, "buf", { season: 2022, week: 1 });
    expect(window.window).toBe("priorSeason");
    expect(window.sampleGames).toBe(2);
    expect(window.epaPerPlay).toBeCloseTo(18 / 120, 6);
  });

  it("returns insufficient with null rates when no history exists at all", () => {
    const index = buildScoringSupportIndex([]);
    const window = buildOffenseWindow(index, "buf", { season: 2022, week: 1 });
    expect(window.window).toBe("insufficient");
    expect(window.epaPerPlay).toBeNull();
    expect(window.successRate).toBeNull();
    expect(window.explosiveRate).toBeNull();
    expect(window.sampleGames).toBe(0);
  });

  it("never includes the target game's own row in a team's offense window", () => {
    const rows = [
      row({ gameId: "2022_05_buf_x", season: 2022, week: 5, team: "buf", opponent: "nyj", eligiblePlays: 999, offEpaSum: 999 }), // the target game itself
      row({ gameId: "2022_01_buf_x", season: 2022, week: 1, team: "buf", opponent: "mia", eligiblePlays: 50, offEpaSum: 5 }),
    ];
    const index = buildScoringSupportIndex(rows);
    const window = buildOffenseWindow(index, "buf", { season: 2022, week: 5 });
    expect(window.sampleGames).toBe(1);
    expect(window.epaPerPlay).toBeCloseTo(5 / 50, 6);
  });

  it("computes defense-allowed strictly from the opponent's offensive production in the team's own past games", () => {
    const rows = [
      // buf played mia in week 1; mia's offensive output that game is what buf's defense allowed.
      row({ gameId: "2022_01_mia_buf", season: 2022, week: 1, team: "mia", opponent: "buf", eligiblePlays: 60, offEpaSum: 12, successNum: 30, successDen: 60, explosiveCount: 9 }),
      row({ gameId: "2022_01_mia_buf", season: 2022, week: 1, team: "buf", opponent: "mia", eligiblePlays: 55, offEpaSum: 3 }),
    ];
    const index = buildScoringSupportIndex(rows);
    const allowed = buildDefenseAllowedWindow(index, "buf", { season: 2022, week: 2 });
    expect(allowed.window).toBe("seasonPrior");
    expect(allowed.sampleGames).toBe(1);
    expect(allowed.epaPerPlay).toBeCloseTo(12 / 60, 6);
    expect(allowed.successRate).toBeCloseTo(30 / 60, 6);
    expect(allowed.explosiveRate).toBeCloseTo(9 / 60, 6);
  });

  it("applies canonical team aliases consistently (lowercase abbreviations only, e.g. jax not jac)", () => {
    const rows = [row({ gameId: "2022_01_jax_x", season: 2022, week: 1, team: "jax", opponent: "ind", eligiblePlays: 50, offEpaSum: 5 })];
    const index = buildScoringSupportIndex(rows);
    const window = buildOffenseWindow(index, "jax", { season: 2022, week: 2 });
    expect(window.sampleGames).toBe(1);
  });
});
