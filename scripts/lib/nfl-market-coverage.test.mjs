import { describe, expect, it } from "vitest";
import {
  computeBookCoverage,
  computeCandidateCounts,
  computeCoveragePercentages,
  evaluateReadinessGate,
  READINESS_GATE_THRESHOLDS,
  resolveCurrentWeek,
} from "./nfl-market-coverage.mjs";
import { PASSING_YARDS_MARKET, RECEIVING_YARDS_MARKET, RUSHING_YARDS_MARKET } from "./nfl-prop-line-selection.mjs";

describe("resolveCurrentWeek", () => {
  it("returns the earliest week with a scheduled (not-yet-final) game", () => {
    const games = [
      { week: 1, status: "final" },
      { week: 2, status: "scheduled" },
      { week: 3, status: "scheduled" },
    ];
    expect(resolveCurrentWeek(games)).toBe(2);
  });

  it("returns null when there are no scheduled games", () => {
    expect(resolveCurrentWeek([{ week: 1, status: "final" }])).toBeNull();
    expect(resolveCurrentWeek([])).toBeNull();
  });
});

describe("computeCandidateCounts", () => {
  it("counts rank-1 QB for passing, rank-1 RB+QB for rushing, rank<=2 WR + rank-1 TE for receiving, per current-week team", () => {
    const entries = [
      { team: "ne", position: "QB", depthRank: 1 },
      { team: "ne", position: "QB", depthRank: 2 },
      { team: "ne", position: "RB", depthRank: 1 },
      { team: "ne", position: "WR", depthRank: 1 },
      { team: "ne", position: "WR", depthRank: 2 },
      { team: "ne", position: "WR", depthRank: 3 },
      { team: "ne", position: "TE", depthRank: 1 },
      // not in current week -- excluded entirely
      { team: "buf", position: "QB", depthRank: 1 },
    ];
    const currentWeekTeams = new Set(["ne"]);
    const counts = computeCandidateCounts(entries, currentWeekTeams);
    expect(counts[PASSING_YARDS_MARKET]).toBe(1);
    expect(counts[RUSHING_YARDS_MARKET]).toBe(2); // rank-1 RB + rank-1 QB
    expect(counts[RECEIVING_YARDS_MARKET]).toBe(3); // rank-1/2 WR + rank-1 TE
  });

  it("never double counts a duplicate source row at the same team/position/rank", () => {
    const entries = [
      { team: "ne", position: "QB", depthRank: 1 },
      { team: "ne", position: "QB", depthRank: 1 },
    ];
    const counts = computeCandidateCounts(entries, new Set(["ne"]));
    expect(counts[PASSING_YARDS_MARKET]).toBe(1);
  });
});

describe("computeCoveragePercentages", () => {
  it("computes canonical/candidate as a percentage per market", () => {
    const percentages = computeCoveragePercentages(
      { [PASSING_YARDS_MARKET]: 5, [RUSHING_YARDS_MARKET]: 0, [RECEIVING_YARDS_MARKET]: 10 },
      { [PASSING_YARDS_MARKET]: 20, [RUSHING_YARDS_MARKET]: 40, [RECEIVING_YARDS_MARKET]: 40 },
    );
    expect(percentages[PASSING_YARDS_MARKET]).toBe(25);
    expect(percentages[RUSHING_YARDS_MARKET]).toBe(0);
    expect(percentages[RECEIVING_YARDS_MARKET]).toBe(25);
  });

  it("returns null (not divide-by-zero) when a market has zero candidates", () => {
    const percentages = computeCoveragePercentages({ [PASSING_YARDS_MARKET]: 0 }, { [PASSING_YARDS_MARKET]: 0 });
    expect(percentages[PASSING_YARDS_MARKET]).toBeNull();
  });
});

function quote(overrides = {}) {
  return { player: "brock purdy", bookmaker: "draftkings", twoSided: true, ...overrides };
}

describe("computeBookCoverage", () => {
  it("counts rows per approved book only, excluding novig/prizepicks/sleeper", () => {
    const quotes = [
      quote({ bookmaker: "draftkings" }),
      quote({ bookmaker: "fanduel" }),
      quote({ bookmaker: "novig" }),
      quote({ bookmaker: "prizepicks" }),
      quote({ bookmaker: "sleeper" }),
    ];
    const { rowsByBook } = computeBookCoverage(quotes);
    expect(rowsByBook).toEqual({ draftkings: 1, fanduel: 1 });
  });

  it("counts one-sided approved-book rows separately", () => {
    const quotes = [quote({ twoSided: true }), quote({ twoSided: false })];
    const { oneSidedApprovedRows } = computeBookCoverage(quotes);
    expect(oneSidedApprovedRows).toBe(1);
  });

  it("flags a player with only unapproved-provider observations", () => {
    const quotes = [quote({ player: "no dk player", bookmaker: "prizepicks" }), quote({ player: "has dk", bookmaker: "draftkings" })];
    const { playersWithOnlyUnapprovedObservations } = computeBookCoverage(quotes);
    expect(playersWithOnlyUnapprovedObservations).toBe(1);
  });

  it("does not flag a player who has both an unapproved and an approved observation", () => {
    const quotes = [quote({ player: "brock purdy", bookmaker: "novig" }), quote({ player: "brock purdy", bookmaker: "draftkings" })];
    const { playersWithOnlyUnapprovedObservations } = computeBookCoverage(quotes);
    expect(playersWithOnlyUnapprovedObservations).toBe(0);
  });
});

describe("evaluateReadinessGate", () => {
  it("matches the documented example thresholds", () => {
    expect(READINESS_GATE_THRESHOLDS[PASSING_YARDS_MARKET]).toBe(20);
    expect(READINESS_GATE_THRESHOLDS[RUSHING_YARDS_MARKET]).toBe(40);
    expect(READINESS_GATE_THRESHOLDS[RECEIVING_YARDS_MARKET]).toBe(80);
  });

  it("is not ready when every market is below threshold", () => {
    const result = evaluateReadinessGate({ [PASSING_YARDS_MARKET]: 2, [RUSHING_YARDS_MARKET]: 0, [RECEIVING_YARDS_MARKET]: 8 });
    expect(result.overallReady).toBe(false);
    expect(result.byMarket[PASSING_YARDS_MARKET]).toEqual({ count: 2, threshold: 20, ready: false });
  });

  it("is ready only when every market meets its own threshold", () => {
    const result = evaluateReadinessGate({ [PASSING_YARDS_MARKET]: 20, [RUSHING_YARDS_MARKET]: 40, [RECEIVING_YARDS_MARKET]: 79 });
    expect(result.overallReady).toBe(false);
    expect(result.byMarket[RECEIVING_YARDS_MARKET].ready).toBe(false);
  });

  it("passes when all three markets meet or exceed threshold", () => {
    const result = evaluateReadinessGate({ [PASSING_YARDS_MARKET]: 20, [RUSHING_YARDS_MARKET]: 40, [RECEIVING_YARDS_MARKET]: 80 });
    expect(result.overallReady).toBe(true);
  });
});
