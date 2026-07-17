import { describe, expect, it } from "vitest";
import {
  buildBvpHistoryEntry,
  buildBvpHistoryKey,
  parseVsPlayerSplit,
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
});
