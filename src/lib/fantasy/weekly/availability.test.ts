import { normalizeFantasyAvailability } from "@/lib/fantasy/weekly/availability";

const target = { season: 2025, week: 8, generatedAt: "2025-10-25T12:00:00Z" };

describe("fantasy availability normalization", () => {
  it.each([
    ["QUESTIONABLE", "questionable"], ["DOUBTFUL", "doubtful"], ["OUT", "out"],
  ])("normalizes %s", (gameStatus, expected) => {
    expect(normalizeFantasyAvailability({ gameStatus, sourceSeason: 2025, sourceWeek: 8 }, target).status)
      .toBe(expected);
  });

  it("normalizes active and reserve roster states", () => {
    expect(normalizeFantasyAvailability({ rosterStatus: "ACT", sourceSeason: 2025, sourceWeek: 8 }, target).status)
      .toBe("active");
    expect(normalizeFantasyAvailability({ reserveStatus: "RESERVE", sourceSeason: 2025, sourceWeek: 8 }, target).status)
      .toBe("reserve");
    expect(normalizeFantasyAvailability({ rosterStatus: "RET", sourceSeason: 2025, sourceWeek: 8 }, target).status)
      .toBe("reserve");
  });

  it("does not guess the meaning of an undocumented roster status", () => {
    expect(normalizeFantasyAvailability({ rosterStatus: "E14", sourceSeason: 2025, sourceWeek: 8 }, target).status)
      .toBe("unknown");
  });

  it("preserves practice status without inventing a snap reduction", () => {
    expect(normalizeFantasyAvailability({ practiceStatus: "LIMITED", sourceSeason: 2025, sourceWeek: 8 }, target))
      .toMatchObject({ status: "unknown", practiceStatus: "LIMITED" });
  });

  it("detects stale and missing injury data", () => {
    expect(normalizeFantasyAvailability({ sourceSeason: 2024, sourceWeek: 8 }, target))
      .toMatchObject({ isStale: true, staleReasons: ["source-season-mismatch"] });
    expect(normalizeFantasyAvailability({}, target).staleReasons).toEqual([
      "source-season-mismatch", "source-week-mismatch",
    ]);
  });
});
