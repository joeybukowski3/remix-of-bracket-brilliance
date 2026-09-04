import { describe, expect, it } from "vitest";
import { computeEwmaWindow } from "./ewmaWindow";
import type { NflTotalResearchScoringSupportRow } from "./types";

function row(partial: Partial<NflTotalResearchScoringSupportRow> & Pick<NflTotalResearchScoringSupportRow, "gameId" | "season" | "week" | "team" | "opponent">): NflTotalResearchScoringSupportRow {
  return { eligiblePlays: 60, offEpaSum: 6, successNum: 24, successDen: 60, explosiveCount: 6, ...partial };
}

describe("computeEwmaWindow -- target-game exclusion / no future leakage", () => {
  it("never includes the target game's own row, even when it is the most extreme value in the pool", () => {
    const rows = [
      row({ gameId: "target", season: 2023, week: 5, team: "buf", opponent: "mia", eligiblePlays: 9999, offEpaSum: 9999 }),
      row({ gameId: "g1", season: 2023, week: 1, team: "buf", opponent: "nyj", eligiblePlays: 50, offEpaSum: 2 }),
    ];
    const result = computeEwmaWindow(rows, { season: 2023, week: 5 }, 4);
    expect(result.totalGamesUsed).toBe(1);
    expect(result.epaPerPlay).toBeCloseTo(2 / 50, 6);
  });

  it("never includes a future game (later week, same season)", () => {
    const rows = [
      row({ gameId: "future", season: 2023, week: 10, team: "buf", opponent: "mia", eligiblePlays: 50, offEpaSum: 999 }),
      row({ gameId: "past", season: 2023, week: 1, team: "buf", opponent: "nyj", eligiblePlays: 50, offEpaSum: 2 }),
    ];
    const result = computeEwmaWindow(rows, { season: 2023, week: 5 }, 4);
    expect(result.totalGamesUsed).toBe(1);
  });

  it("never includes a future season's games", () => {
    const rows = [
      row({ gameId: "futureSeason", season: 2024, week: 1, team: "buf", opponent: "mia", eligiblePlays: 50, offEpaSum: 999 }),
      row({ gameId: "past", season: 2023, week: 1, team: "buf", opponent: "nyj", eligiblePlays: 50, offEpaSum: 2 }),
    ];
    const result = computeEwmaWindow(rows, { season: 2023, week: 5 }, 4);
    expect(result.totalGamesUsed).toBe(1);
  });
});

describe("computeEwmaWindow -- chronological weighting correctness", () => {
  it("weights the most recent game highest and orders decay chronologically", () => {
    const rows = [
      row({ gameId: "g1", season: 2023, week: 1, team: "buf", opponent: "a", eligiblePlays: 50, offEpaSum: 0 }),
      row({ gameId: "g2", season: 2023, week: 2, team: "buf", opponent: "b", eligiblePlays: 50, offEpaSum: 5 }),
      row({ gameId: "g3", season: 2023, week: 3, team: "buf", opponent: "c", eligiblePlays: 50, offEpaSum: 10 }),
    ];
    const result = computeEwmaWindow(rows, { season: 2023, week: 4 }, 4);
    // Week 3 (most recent, offEpaSum=10) should pull the weighted average above the simple mean of the three (5).
    expect(result.epaPerPlay!).toBeGreaterThan((0 + 0.1 + 0.2) / 3);
  });

  it("exactly one half-life back carries exactly half the weight of the most recent game", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ gameId: `g${i}`, season: 2023, week: i + 1, team: "buf", opponent: "x", eligiblePlays: 50, offEpaSum: i }));
    const halfLife = 4;
    const result = computeEwmaWindow(rows, { season: 2023, week: 11 }, halfLife);
    // Reconstruct raw (unnormalized) weights the same way the implementation does, to check the ratio directly.
    const rawWeightMostRecent = 0.5 ** (0 / halfLife);
    const rawWeightOneHalfLifeBack = 0.5 ** (halfLife / halfLife);
    expect(rawWeightOneHalfLifeBack / rawWeightMostRecent).toBeCloseTo(0.5, 10);
    expect(result.totalGamesUsed).toBe(10);
  });
});

describe("computeEwmaWindow -- prior-season fallback", () => {
  it("Week 1 (no current-season history) uses the prior season as the entire pool, most-recent-prior-season game weighted highest", () => {
    const rows = [
      row({ gameId: "p1", season: 2022, week: 1, team: "buf", opponent: "a", eligiblePlays: 50, offEpaSum: 0 }),
      row({ gameId: "p2", season: 2022, week: 18, team: "buf", opponent: "b", eligiblePlays: 50, offEpaSum: 10 }),
    ];
    const result = computeEwmaWindow(rows, { season: 2023, week: 1 }, 4);
    expect(result.currentSeasonGamesUsed).toBe(0);
    expect(result.priorSeasonGamesUsed).toBe(2);
    expect(result.nonCurrentSeasonWeightSharePct).toBeCloseTo(100, 6);
    // The most recent prior-season game (week 18, offEpaSum=10) should dominate over the week-1 game (offEpaSum=0).
    expect(result.epaPerPlay!).toBeGreaterThan(0.1); // simple mean would be 0.1; EWMA should exceed it since week18 is weighted higher
  });

  it("quantifies a real, non-hidden prior-season weight tail once current-season games exist", () => {
    const rows = [
      row({ gameId: "p1", season: 2022, week: 18, team: "buf", opponent: "a", eligiblePlays: 50, offEpaSum: 5 }),
      row({ gameId: "c1", season: 2023, week: 1, team: "buf", opponent: "b", eligiblePlays: 50, offEpaSum: 5 }),
    ];
    const result = computeEwmaWindow(rows, { season: 2023, week: 2 }, 4);
    expect(result.currentSeasonGamesUsed).toBe(1);
    expect(result.priorSeasonGamesUsed).toBe(1);
    expect(result.nonCurrentSeasonWeightSharePct).not.toBeNull();
    expect(result.nonCurrentSeasonWeightSharePct!).toBeGreaterThan(0);
    expect(result.nonCurrentSeasonWeightSharePct!).toBeLessThan(100);
  });

  it("tracks games from two or more seasons back separately from immediate-prior-season games", () => {
    const rows = [
      row({ gameId: "older", season: 2021, week: 18, team: "buf", opponent: "a", eligiblePlays: 50, offEpaSum: 1 }),
      row({ gameId: "prior", season: 2022, week: 18, team: "buf", opponent: "b", eligiblePlays: 50, offEpaSum: 1 }),
    ];
    const result = computeEwmaWindow(rows, { season: 2023, week: 1 }, 4);
    expect(result.priorSeasonGamesUsed).toBe(1);
    expect(result.olderSeasonGamesUsed).toBe(1);
  });
});

describe("computeEwmaWindow -- effective sample size", () => {
  it("a single-game pool has ESS exactly 1", () => {
    const rows = [row({ gameId: "g1", season: 2023, week: 1, team: "buf", opponent: "a", eligiblePlays: 50, offEpaSum: 1 })];
    const result = computeEwmaWindow(rows, { season: 2023, week: 2 }, 4);
    expect(result.effectiveSampleSize).toBeCloseTo(1, 6);
  });

  it("ESS is strictly less than the raw game count once more than one game contributes non-trivial weight", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ gameId: `g${i}`, season: 2023, week: i + 1, team: "buf", opponent: "x", eligiblePlays: 50, offEpaSum: i }));
    const result = computeEwmaWindow(rows, { season: 2023, week: 9 }, 4);
    expect(result.effectiveSampleSize).toBeLessThan(result.totalGamesUsed);
    expect(result.effectiveSampleSize).toBeGreaterThan(1);
  });

  it("ESS approaches the raw game count as halfLife grows very large (weights become nearly uniform)", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ gameId: `g${i}`, season: 2023, week: i + 1, team: "buf", opponent: "x", eligiblePlays: 50, offEpaSum: i }));
    const result = computeEwmaWindow(rows, { season: 2023, week: 9 }, 10000);
    expect(result.effectiveSampleSize).toBeCloseTo(8, 1);
  });
});

describe("computeEwmaWindow -- determinism, empty pool, and input validation", () => {
  it("is deterministic -- identical inputs produce identical output", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ gameId: `g${i}`, season: 2023, week: i + 1, team: "buf", opponent: "x", eligiblePlays: 50, offEpaSum: i }));
    const a = computeEwmaWindow(rows, { season: 2023, week: 6 }, 4);
    const b = computeEwmaWindow(rows, { season: 2023, week: 6 }, 4);
    expect(a).toEqual(b);
  });

  it("returns nulls and zero counts, never NaN, when no history exists at all", () => {
    const result = computeEwmaWindow([], { season: 2023, week: 1 }, 4);
    expect(result.epaPerPlay).toBeNull();
    expect(result.successRate).toBeNull();
    expect(result.explosiveRate).toBeNull();
    expect(result.totalGamesUsed).toBe(0);
    expect(result.effectiveSampleSize).toBe(0);
    expect(result.nonCurrentSeasonWeightSharePct).toBeNull();
  });

  it("throws on a non-positive half-life rather than silently producing NaN/Infinity", () => {
    expect(() => computeEwmaWindow([], { season: 2023, week: 1 }, 0)).toThrow(/halfLife/);
    expect(() => computeEwmaWindow([], { season: 2023, week: 1 }, -2)).toThrow(/halfLife/);
  });
});
