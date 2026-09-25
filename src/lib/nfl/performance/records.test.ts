import { describe, expect, it } from "vitest";
import {
  availableWeeks,
  computeAtsRecord,
  computeOuRecord,
  computeSuRecord,
  computeSuResult,
  formatRecord,
  rowsForWeek,
} from "./records";
import type { AtsResult, DirectionalResult, SidesPerformanceRow, TotalsPerformanceRow } from "@/types/nfl/performance";

function side(week: number, ats: AtsResult | null, projected: number, actual: number, final = true): SidesPerformanceRow {
  return {
    week,
    ats_result: ats,
    projected_home_margin: projected,
    actual_margin: actual,
    game_completion_status: final ? "final" : "not_final",
    // A market that would contradict SU if it were (wrongly) consulted.
    market_spread: projected > 0 ? 10 : -10,
  } as unknown as SidesPerformanceRow;
}

function total(week: number, result: DirectionalResult | null): TotalsPerformanceRow {
  return { week, directional_result: result } as unknown as TotalsPerformanceRow;
}

const sides = [
  side(1, "WIN", 3, 7), // SU win
  side(1, "LOSS", -4, 6), // SU loss
  side(1, "PUSH", 2, 1), // SU win
  side(2, "WIN", -1, -3), // SU win
  side(2, "NEUTRAL", 0, 4), // SU neutral
  side(2, "LOSS", 5, 0), // SU tie -> push
];

describe("computeSuResult", () => {
  it("wins when the projected winner wins (home and away)", () => {
    expect(computeSuResult(side(1, null, 3, 7))).toBe("WIN");
    expect(computeSuResult(side(1, null, -3, -7))).toBe("WIN");
  });

  it("loses when the projected winner loses", () => {
    expect(computeSuResult(side(1, null, 3, -7))).toBe("LOSS");
    expect(computeSuResult(side(1, null, -3, 7))).toBe("LOSS");
  });

  it("treats a zero projected margin as neutral, never a forced win or loss", () => {
    expect(computeSuResult(side(1, null, 0, 7))).toBe("NEUTRAL");
    expect(computeSuResult(side(1, null, 0, 0))).toBe("NEUTRAL");
  });

  it("treats a tie game as a push and ignores non-final games", () => {
    expect(computeSuResult(side(1, null, 3, 0))).toBe("PUSH");
    expect(computeSuResult(side(1, null, 3, 7, false))).toBeNull();
  });
});

describe("ATS aggregation", () => {
  it("aggregates the season", () => {
    expect(computeAtsRecord(sides)).toEqual({ wins: 2, losses: 2, pushes: 1, neutral: 1, hitRate: 0.5 });
  });

  it("aggregates each week", () => {
    expect(computeAtsRecord(rowsForWeek(sides, 1))).toMatchObject({ wins: 1, losses: 1, pushes: 1 });
    expect(computeAtsRecord(rowsForWeek(sides, 2))).toMatchObject({ wins: 1, losses: 1, pushes: 0, neutral: 1 });
  });

  it("returns a null hit rate with no decided games", () => {
    expect(computeAtsRecord([]).hitRate).toBeNull();
    expect(computeAtsRecord([side(1, "PUSH", 1, 1)]).hitRate).toBeNull();
  });
});

describe("SU aggregation", () => {
  it("aggregates the season from projected and actual margins only", () => {
    expect(computeSuRecord(sides)).toEqual({ wins: 3, losses: 1, pushes: 1, neutral: 1, hitRate: 0.75 });
  });

  it("aggregates each week", () => {
    expect(computeSuRecord(rowsForWeek(sides, 1))).toMatchObject({ wins: 2, losses: 1 });
    expect(computeSuRecord(rowsForWeek(sides, 2))).toMatchObject({ wins: 1, losses: 0, pushes: 1, neutral: 1 });
  });
});

describe("totals O/U aggregation", () => {
  const totals = [total(1, "WIN"), total(1, "LOSS"), total(1, "NEUTRAL"), total(2, "WIN"), total(2, "PUSH"), total(2, null)];

  it("counts W/L/P over decided directional calls and reports NEUTRAL separately", () => {
    expect(computeOuRecord(totals)).toEqual({ wins: 2, losses: 1, pushes: 1, neutral: 1, hitRate: 2 / 3 });
  });

  it("aggregates a single week", () => {
    expect(computeOuRecord(rowsForWeek(totals, 1))).toMatchObject({ wins: 1, losses: 1, pushes: 0, neutral: 1 });
  });
});

describe("week switching", () => {
  it("returns only the selected week and restores the season on 'all'", () => {
    expect(rowsForWeek(sides, 2)).toHaveLength(3);
    expect(rowsForWeek(sides, "all")).toHaveLength(6);
    expect(rowsForWeek(sides, 9)).toEqual([]);
  });

  it("lists distinct weeks in order", () => {
    expect(availableWeeks([...sides].reverse())).toEqual([1, 2]);
  });
});

describe("formatRecord", () => {
  it("always shows pushes by default and can hide a zero push segment", () => {
    const rec = { wins: 14, losses: 16, pushes: 0, neutral: 0, hitRate: null };
    expect(formatRecord(rec)).toBe("14-16-0");
    expect(formatRecord(rec, true)).toBe("14-16");
    expect(formatRecord({ ...rec, pushes: 2 }, true)).toBe("14-16-2");
  });
});
