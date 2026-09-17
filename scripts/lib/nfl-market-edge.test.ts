import { describe, expect, it } from "vitest";
import { computeSideEdgePoints, computeTotalEdgePoints, fairSpreadToHomeLine } from "./nfl-market-edge";

describe("fairSpreadToHomeLine", () => {
  it("returns the line unchanged when the favored team is the home team", () => {
    expect(fairSpreadToHomeLine({ team: "ind", line: -1.5 }, "ind")).toBe(-1.5);
  });

  it("negates the line when the favored team is the away team", () => {
    expect(fairSpreadToHomeLine({ team: "bal", line: -4 }, "ind")).toBe(4);
  });
});

describe("computeSideEdgePoints", () => {
  it("11. computes a positive (home-value) edge from the WU work order's worked example: model IND -1.5, market IND +3.5", () => {
    // HOME: IND, AWAY: BAL. Model favors IND by 1.5 (home-oriented line -1.5).
    // Market has IND getting +3.5 as the home team.
    const edge = computeSideEdgePoints({ fairSpread: { team: "ind", line: -1.5 } }, "ind", 3.5);
    expect(edge).toBe(5);
  });

  it("computes a negative (away-value) edge when the market favors the home team more than the model does", () => {
    const edge = computeSideEdgePoints({ fairSpread: { team: "ind", line: -6 } }, "ind", -3);
    expect(edge).toBe(3);
  });

  it("returns null when the market home line is unavailable -- never coerced to zero", () => {
    expect(computeSideEdgePoints({ fairSpread: { team: "ind", line: -1.5 } }, "ind", null)).toBeNull();
  });
});

describe("computeTotalEdgePoints", () => {
  it("12. computes a positive (over-value) edge when the model's total exceeds the market total", () => {
    expect(computeTotalEdgePoints({ projectedTotal: 49 }, 46.5)).toBe(2.5);
  });

  it("computes a negative (under-value) edge when the model's total is below the market total", () => {
    expect(computeTotalEdgePoints({ projectedTotal: 44 }, 46.5)).toBe(-2.5);
  });

  it("returns null when the market total is unavailable -- never coerced to zero", () => {
    expect(computeTotalEdgePoints({ projectedTotal: 46.5 }, null)).toBeNull();
  });
});
