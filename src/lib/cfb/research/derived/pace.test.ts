import { describe, expect, it } from "vitest";
import { computeSecondsPerPlay, filterSituationNeutralPlays } from "./pace";

function row(overrides: Partial<{
  gameId: string;
  period: number | null;
  clockMinutes: number | null;
  clockSeconds: number | null;
  offenseScore: number | null;
  defenseScore: number | null;
}>) {
  return {
    gameId: "g1",
    period: 1,
    clockMinutes: 10,
    clockSeconds: 0,
    offenseScore: 0,
    defenseScore: 0,
    ...overrides,
  };
}

describe("computeSecondsPerPlay", () => {
  it("computes average elapsed time between consecutive decreasing-clock plays in the same period", () => {
    const rows = [
      row({ period: 1, clockMinutes: 10, clockSeconds: 0 }),
      row({ period: 1, clockMinutes: 9, clockSeconds: 30 }), // 30s elapsed
      row({ period: 1, clockMinutes: 9, clockSeconds: 0 }), // 30s elapsed
    ];
    const result = computeSecondsPerPlay(rows);
    expect(result.secondsPerPlay).toBe(30);
  });

  it("skips the interval across a period boundary rather than fabricating elapsed time", () => {
    const rows = [
      row({ period: 1, clockMinutes: 0, clockSeconds: 10 }),
      row({ period: 2, clockMinutes: 15, clockSeconds: 0 }), // clock resets — different period
    ];
    const result = computeSecondsPerPlay(rows);
    expect(result.secondsPerPlay).toBeNull();
  });

  it("skips a tied (non-decreasing) clock reading between two plays", () => {
    const rows = [
      row({ period: 1, clockMinutes: 5, clockSeconds: 0 }),
      row({ period: 1, clockMinutes: 5, clockSeconds: 0 }), // identical clock — zero gap, not a valid interval
    ];
    const result = computeSecondsPerPlay(rows);
    expect(result.secondsPerPlay).toBeNull();
  });

  it("returns null with zero valid intervals for a single play or fully malformed clocks", () => {
    expect(computeSecondsPerPlay([row({})]).secondsPerPlay).toBeNull();
    expect(
      computeSecondsPerPlay([row({ clockMinutes: null }), row({ clockMinutes: null })]).secondsPerPlay,
    ).toBeNull();
  });
});

describe("filterSituationNeutralPlays", () => {
  it("keeps plays within the margin threshold and outside the final 2:00 of a half", () => {
    const rows = [
      row({ period: 2, clockMinutes: 3, clockSeconds: 0, offenseScore: 10, defenseScore: 3 }), // margin 7, OK
    ];
    expect(filterSituationNeutralPlays(rows)).toHaveLength(1);
  });

  it("excludes plays with |margin| > 16", () => {
    const rows = [row({ offenseScore: 30, defenseScore: 0 })];
    expect(filterSituationNeutralPlays(rows)).toHaveLength(0);
  });

  it("excludes the final 2:00 of the 2nd and 4th quarters only", () => {
    const lateQ2 = row({ period: 2, clockMinutes: 1, clockSeconds: 30 });
    const lateQ1 = row({ period: 1, clockMinutes: 1, clockSeconds: 30 });
    expect(filterSituationNeutralPlays([lateQ2])).toHaveLength(0);
    expect(filterSituationNeutralPlays([lateQ1])).toHaveLength(1);
  });

  it("excludes overtime by default (regulationOnly)", () => {
    expect(filterSituationNeutralPlays([row({ period: 5 })])).toHaveLength(0);
  });

  it("excludes plays with unknown score state rather than assuming margin 0", () => {
    expect(filterSituationNeutralPlays([row({ offenseScore: null })])).toHaveLength(0);
  });
});
