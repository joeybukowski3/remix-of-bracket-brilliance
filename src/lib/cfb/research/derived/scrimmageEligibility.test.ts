import { describe, expect, it } from "vitest";
import { isEligibleScrimmagePlay, isOvertimePeriod, isTwoPointTryCategory } from "./scrimmageEligibility";

describe("isEligibleScrimmagePlay", () => {
  it("includes rush, pass, sack, and turnover", () => {
    expect(isEligibleScrimmagePlay("rush")).toBe(true);
    expect(isEligibleScrimmagePlay("pass")).toBe(true);
    expect(isEligibleScrimmagePlay("sack")).toBe(true);
    expect(isEligibleScrimmagePlay("turnover")).toBe(true);
  });

  it("excludes special teams, no-plays, and administrative markers", () => {
    for (const category of [
      "punt",
      "kickoff",
      "field_goal",
      "pat",
      "penalty_no_play",
      "kneel",
      "spike",
      "administrative",
    ] as const) {
      expect(isEligibleScrimmagePlay(category)).toBe(false);
    }
  });
});

describe("isTwoPointTryCategory / isOvertimePeriod", () => {
  it("flags two-point tries without excluding them from eligibility", () => {
    expect(isTwoPointTryCategory("two_point_try")).toBe(true);
    expect(isTwoPointTryCategory("rush")).toBe(false);
  });

  it("flags overtime periods (5+) without excluding them from eligibility", () => {
    expect(isOvertimePeriod(5)).toBe(true);
    expect(isOvertimePeriod(4)).toBe(false);
    expect(isOvertimePeriod(null)).toBe(false);
  });
});
