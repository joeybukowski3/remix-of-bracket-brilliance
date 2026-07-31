import { describe, expect, it } from "vitest";
import {
  compareGameStartTime,
  formatGameTime,
  GAME_TIME_FALLBACK_LABEL,
  getGameTimeSortValue,
} from "./mlbGameTime";

describe("formatGameTime", () => {
  it("formats a valid ISO timestamp as a 12-hour Eastern time", () => {
    // 2026-07-30T23:10:00Z is 7:10 PM Eastern (EDT, UTC-4) during the season.
    expect(formatGameTime("2026-07-30T23:10:00Z")).toBe("7:10 PM");
  });

  it("returns the TBD fallback for null", () => {
    expect(formatGameTime(null)).toBe(GAME_TIME_FALLBACK_LABEL);
  });

  it("returns the TBD fallback for undefined", () => {
    expect(formatGameTime(undefined)).toBe(GAME_TIME_FALLBACK_LABEL);
  });

  it("returns the TBD fallback for an empty string", () => {
    expect(formatGameTime("")).toBe(GAME_TIME_FALLBACK_LABEL);
  });

  it("returns the TBD fallback for a malformed timestamp instead of 'Invalid Date'", () => {
    expect(formatGameTime("not-a-date")).toBe(GAME_TIME_FALLBACK_LABEL);
    expect(formatGameTime("not-a-date")).not.toMatch(/Invalid Date/i);
  });
});

describe("getGameTimeSortValue", () => {
  it("returns the timestamp in milliseconds for a valid ISO string", () => {
    expect(getGameTimeSortValue("2026-07-30T23:10:00Z")).toBe(new Date("2026-07-30T23:10:00Z").getTime());
  });

  it("returns +Infinity for null, undefined, empty, and malformed values", () => {
    expect(getGameTimeSortValue(null)).toBe(Number.POSITIVE_INFINITY);
    expect(getGameTimeSortValue(undefined)).toBe(Number.POSITIVE_INFINITY);
    expect(getGameTimeSortValue("")).toBe(Number.POSITIVE_INFINITY);
    expect(getGameTimeSortValue("garbage")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("compareGameStartTime", () => {
  const early = "2026-07-30T17:10:00Z";
  const late = "2026-07-30T23:10:00Z";

  it("sorts earliest first in ascending order", () => {
    expect(compareGameStartTime(early, late, "asc")).toBeLessThan(0);
    expect(compareGameStartTime(late, early, "asc")).toBeGreaterThan(0);
  });

  it("sorts latest first in descending order", () => {
    expect(compareGameStartTime(late, early, "desc")).toBeLessThan(0);
    expect(compareGameStartTime(early, late, "desc")).toBeGreaterThan(0);
  });

  it("treats equal timestamps as equal", () => {
    expect(compareGameStartTime(early, early, "asc")).toBe(0);
  });

  it("sorts a missing/unparseable value after every valid time in ascending order", () => {
    expect(compareGameStartTime(null, early, "asc")).toBeGreaterThan(0);
    expect(compareGameStartTime(early, null, "asc")).toBeLessThan(0);
  });

  it("sorts a missing/unparseable value after every valid time in descending order too", () => {
    // This is the deliberate exception to simple sign-flipping: a "TBD" row
    // must never jump to the front just because the direction reversed.
    expect(compareGameStartTime(null, early, "desc")).toBeGreaterThan(0);
    expect(compareGameStartTime(early, null, "desc")).toBeLessThan(0);
  });

  it("treats two missing values as equal regardless of direction", () => {
    expect(compareGameStartTime(null, undefined, "asc")).toBe(0);
    expect(compareGameStartTime(null, undefined, "desc")).toBe(0);
  });

  it("produces a stable sort across multiple rows sharing the same game", () => {
    const rows = [
      { id: "a", gameStartTime: early },
      { id: "b", gameStartTime: early },
      { id: "c", gameStartTime: late },
      { id: "d", gameStartTime: null as string | null },
    ];
    const sorted = [...rows].sort((x, y) => compareGameStartTime(x.gameStartTime, y.gameStartTime, "asc"));
    expect(sorted.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
});
