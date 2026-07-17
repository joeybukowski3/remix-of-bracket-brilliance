import { describe, expect, it } from "vitest";
import {
  buildBvpHistoryEntry,
  buildBvpHistoryKey,
  parseVsPlayerSplit,
  violatesCareerInvariant,
  // @ts-expect-error -- plain JS module, no type declarations
} from "../../../scripts/lib/mlb-bvp-history-core.mjs";

describe("buildBvpHistoryKey", () => {
  it("builds a stable key from batter id and pitcher id", () => {
    expect(buildBvpHistoryKey(665742, 605400)).toBe("665742|605400");
  });

  it("is order-sensitive", () => {
    expect(buildBvpHistoryKey(1, 2)).not.toBe(buildBvpHistoryKey(2, 1));
  });
});

describe("parseVsPlayerSplit", () => {
  it("extracts pa/h/avg/hr from a real-shaped MLB StatsAPI vsPlayer response", () => {
    const json = { stats: [{ splits: [{ stat: { plateAppearances: 9, hits: 3, avg: ".375", homeRuns: 1 } }] }] };
    expect(parseVsPlayerSplit(json)).toEqual({ pa: 9, h: 3, avg: 0.375, hr: 1 });
  });

  it("returns null when there are no splits (never faced)", () => {
    expect(parseVsPlayerSplit({ stats: [{ splits: [] }] })).toBeNull();
  });

  it("returns null for entirely missing input, never throwing", () => {
    expect(parseVsPlayerSplit(null)).toBeNull();
    expect(parseVsPlayerSplit(undefined)).toBeNull();
    expect(parseVsPlayerSplit({})).toBeNull();
  });
});

describe("buildBvpHistoryEntry", () => {
  it("assembles a full record with the key derived from the ids", () => {
    const entry = buildBvpHistoryEntry({
      batterId: 665742,
      pitcherId: 605400,
      batter: "Juan Soto",
      pitcher: "Aaron Nola",
      career: { pa: 59, h: 11, avg: 0.262, hr: 5 },
      last5y: null,
    });
    expect(entry).toEqual({
      key: "665742|605400",
      batterId: 665742,
      pitcherId: 605400,
      batter: "Juan Soto",
      pitcher: "Aaron Nola",
      career: { pa: 59, h: 11, avg: 0.262, hr: 5 },
      last5y: null,
    });
  });

  it("never includes score, rank, or recommendation fields (display-only isolation)", () => {
    const entry = buildBvpHistoryEntry({ batterId: 1, pitcherId: 2, career: { pa: 1, h: 1, avg: 1, hr: 1 }, last5y: null });
    for (const forbidden of ["hrScore", "matchupScore", "rank", "recommendation", "confidence", "eligible", "bestBet"]) {
      expect(Object.keys(entry)).not.toContain(forbidden);
    }
  });

  it("nulls both windows when they violate the career/last5y counting-stat invariant -- real case: Kyle Schwarber vs Christian Scott", () => {
    // MLB StatsAPI's vsPlayerTotal lagged vsPlayer5Y by not yet reflecting a
    // just-completed game (see scripts/lib/mlb-bvp-history-invariant.test.mjs
    // for the full fixture-backed investigation).
    const entry = buildBvpHistoryEntry({
      batterId: 656941,
      pitcherId: 681035,
      batter: "Kyle Schwarber",
      pitcher: "Christian Scott",
      career: { pa: 2, h: 0, avg: 0, hr: 0 },
      last5y: { pa: 5, h: 1, avg: 0.25, hr: 0 },
    });
    expect(entry.career).toBeNull();
    expect(entry.last5y).toBeNull();
  });
});

describe("violatesCareerInvariant", () => {
  it("returns false for a valid pair", () => {
    expect(violatesCareerInvariant({ pa: 59, h: 11, avg: 0.262, hr: 5 }, { pa: 27, h: 7, avg: 0.412, hr: 3 })).toBe(false);
  });

  it("returns true when last5y.pa exceeds career.pa", () => {
    expect(violatesCareerInvariant({ pa: 2, h: 0, avg: 0, hr: 0 }, { pa: 5, h: 1, avg: 0.25, hr: 0 })).toBe(true);
  });

  it("ignores AVG -- a higher recent average alone is never a violation", () => {
    expect(violatesCareerInvariant({ pa: 100, h: 20, avg: 0.2, hr: 2 }, { pa: 20, h: 8, avg: 0.4, hr: 1 })).toBe(false);
  });
});
