import { describe, expect, it } from "vitest";
import type { NflGameRecord } from "@/lib/nfl/standings";
import { getAvailableRegularSeasonWeeks, resolveNflWeekSelection } from "@/lib/nfl/weekSelection";

function game(week: number, dateUtc: string | null, overrides: Partial<NflGameRecord> = {}): NflGameRecord {
  return {
    gameId: `2026_${String(week).padStart(2, "0")}_AWY_HME`,
    season: 2026,
    week,
    seasonType: "REG",
    dateUtc,
    homeTeam: "Home",
    awayTeam: "Away",
    homeAbbr: "HME",
    awayAbbr: "AWY",
    status: "scheduled",
    stadium: null,
    neutralSite: false,
    ...overrides,
  };
}

const SCHEDULE = [
  game(1, "2026-09-11T00:20:00.000Z"),
  game(1, "2026-09-15T00:15:00.000Z", { gameId: "2026_01_MON" }),
  game(2, "2026-09-18T00:15:00.000Z"),
  game(2, "2026-09-22T00:15:00.000Z", { gameId: "2026_02_MON" }),
  game(3, null),
  game(1, "2027-01-10T18:00:00.000Z", { gameId: "POST", seasonType: "POST" }),
];

describe("getAvailableRegularSeasonWeeks", () => {
  it("derives unique ascending regular-season weeks from schedule data", () => {
    expect(getAvailableRegularSeasonWeeks(SCHEDULE)).toEqual([1, 2, 3]);
  });
});

describe("resolveNflWeekSelection", () => {
  it("naturally selects Week 1 before and during the Week 1 period", () => {
    expect(resolveNflWeekSelection(SCHEDULE, { now: new Date("2026-08-20T16:00:00Z") }).week).toBe(1);
    expect(resolveNflWeekSelection(SCHEDULE, { now: new Date("2026-09-14T16:00:00Z") }).week).toBe(1);
  });

  it("advances after the final scheduled Eastern calendar date of a week", () => {
    expect(resolveNflWeekSelection(SCHEDULE, { now: new Date("2026-09-15T04:30:00Z") }).week).toBe(2);
  });

  it("uses Eastern time at the date boundary", () => {
    expect(resolveNflWeekSelection(SCHEDULE, { now: new Date("2026-09-15T03:30:00Z") }).week).toBe(1);
  });

  it("supports explicit historical and future week browsing", () => {
    expect(resolveNflWeekSelection(SCHEDULE, { search: "?week=1", now: new Date("2026-09-20T12:00:00Z") })).toMatchObject({
      week: 1,
      source: "query",
      invalidQuery: false,
    });
    expect(resolveNflWeekSelection(SCHEDULE, { search: "?week=3", now: new Date("2026-08-20T12:00:00Z") }).week).toBe(3);
  });

  it.each(["?week=abc", "?week=0", "?week=4", "?week="])(
    "falls back deterministically for invalid query %s",
    (search) => {
      expect(resolveNflWeekSelection(SCHEDULE, { search, now: new Date("2026-09-20T12:00:00Z") })).toMatchObject({
        week: 2,
        source: "schedule",
        invalidQuery: true,
      });
    }
  );

  it("uses the last dated week after the schedule and keeps undated weeks queryable", () => {
    expect(resolveNflWeekSelection(SCHEDULE, { now: new Date("2027-02-01T12:00:00Z") }).week).toBe(2);
    expect(resolveNflWeekSelection(SCHEDULE, { search: "?week=3", now: new Date("2027-02-01T12:00:00Z") }).week).toBe(3);
  });

  it("returns an unavailable state when the schedule has no regular-season weeks", () => {
    expect(resolveNflWeekSelection([], { search: "?week=1" })).toEqual({
      week: null,
      availableWeeks: [],
      source: "unavailable",
      invalidQuery: false,
    });
  });
});
