import { describe, expect, it } from "vitest";
import { NFL_POWER_RATINGS } from "@/data/nflPreseason2026";
import {
  WARREN_SHARP_SCHEDULE_TEAM_ABBRS,
  getWarrenSharpRestEdgeForGame,
  getWarrenSharpScheduleProfile,
} from "@/lib/nfl/warrenSharpSchedule2026";

describe("Warren Sharp 2026 schedule data", () => {
  it("contains one validated profile for every NFL team", () => {
    expect(WARREN_SHARP_SCHEDULE_TEAM_ABBRS).toHaveLength(32);
    expect([...WARREN_SHARP_SCHEDULE_TEAM_ABBRS].sort()).toEqual(
      NFL_POWER_RATINGS.map((team) => team.abbr).sort(),
    );
  });

  it("has complete weekly schedules and internally consistent rest totals", () => {
    for (const abbr of WARREN_SHARP_SCHEDULE_TEAM_ABBRS) {
      const profile = getWarrenSharpScheduleProfile(abbr);
      expect(profile).not.toBeNull();
      if (!profile) continue;

      expect(profile.weeklyRestEdges).toHaveLength(18);
      expect(profile.weeklyRestEdges.filter((entry) => entry.bye)).toHaveLength(1);
      expect(profile.weeklyRestEdges.filter((entry) => !entry.bye)).toHaveLength(17);
      expect(
        profile.weeklyRestEdges.reduce((sum, entry) => sum + entry.restEdgeDays, 0),
      ).toBe(profile.netRestDays);
      expect(
        profile.weeklyRestEdges.filter((entry) => entry.restEdgeDays > 0),
      ).toHaveLength(profile.gamesWithRestAdvantage);
      expect(
        profile.weeklyRestEdges.filter((entry) => entry.restEdgeDays < 0),
      ).toHaveLength(profile.gamesWithRestDisadvantage);
      expect(profile.strengthOfSchedule.hardestFirstRank).toBe(
        33 - profile.strengthOfSchedule.easiestFirstRank,
      );
    }
  });

  it("preserves the documented schedule extremes", () => {
    expect(getWarrenSharpScheduleProfile("ari")?.strengthOfSchedule.hardestFirstRank).toBe(1);
    expect(getWarrenSharpScheduleProfile("det")?.strengthOfSchedule.hardestFirstRank).toBe(32);
    expect(getWarrenSharpScheduleProfile("chi")?.netRestDays).toBe(15);
    expect(getWarrenSharpScheduleProfile("lac")?.netRestDays).toBe(-24);
  });

  it("only returns a weekly rest edge when week and opponent both match", () => {
    const arizona = getWarrenSharpScheduleProfile("ari");
    expect(getWarrenSharpRestEdgeForGame(arizona, 2, "sea")?.restEdgeDays).toBe(-4);
    expect(getWarrenSharpRestEdgeForGame(arizona, 2, "sf")).toBeNull();
    expect(getWarrenSharpRestEdgeForGame(arizona, 14, "sea")).toBeNull();
  });
});
