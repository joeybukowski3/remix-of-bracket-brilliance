import { describe, expect, it } from "vitest";
import {
  adjustProjection,
  appliedMinutes,
  clearAllDrafts,
  clearDraft,
  differenceFromLine,
  MAX_USER_MINUTES,
  NO_OVERRIDE,
  overrideView,
  parseMinutesInput,
  playerOverrideKey,
  roundToTenth,
  seasonRateEstimate,
  setDraft,
} from "./minutesOverride";

describe("parseMinutesInput", () => {
  it("accepts 0 to 48 minutes, rounds to one decimal, and treats blank as clearing", () => {
    expect(parseMinutesInput("32")).toEqual({ kind: "valid", minutes: 32 });
    expect(parseMinutesInput(" 32.5 ")).toEqual({ kind: "valid", minutes: 32.5 });
    expect(parseMinutesInput("0")).toEqual({ kind: "valid", minutes: 0 });
    expect(parseMinutesInput("48")).toEqual({ kind: "valid", minutes: 48 });
    expect(parseMinutesInput("24.46")).toEqual({ kind: "valid", minutes: 24.5 });
    expect(parseMinutesInput("24.44")).toEqual({ kind: "valid", minutes: 24.4 });
    expect(parseMinutesInput(".5")).toEqual({ kind: "valid", minutes: 0.5 });
    expect(parseMinutesInput("")).toEqual({ kind: "empty" });
    expect(parseMinutesInput("   ")).toEqual({ kind: "empty" });
  });

  it("rejects out-of-range, negative, non-numeric, exponent and malformed input with a reason", () => {
    for (const bad of ["48.1", "49", "100", "-1", "-0.5", "abc", "1e1", "12,5", "0x10", "Infinity", "NaN", ".", "3..4", "1 2", "+5"]) {
      const result = parseMinutesInput(bad);
      expect(result.kind, bad).toBe("invalid");
    }
    expect(parseMinutesInput("60")).toMatchObject({ kind: "invalid", reason: `Minutes must be between 0 and ${MAX_USER_MINUTES}` });
    expect(parseMinutesInput("abc")).toMatchObject({ reason: expect.stringMatching(/number/) });
  });

  it("rounds half up at the tenth without binary surprises", () => {
    expect(roundToTenth(24.45)).toBe(24.5);
    expect(roundToTenth(0.05)).toBe(0.1);
    expect(roundToTenth(32.04)).toBe(32);
  });
});

describe("adjustProjection: JKB projection x user minutes / JKB minutes", () => {
  it("scales the projection to the new minutes", () => {
    expect(adjustProjection(20, 30, 36)).toBeCloseTo(24, 12);
    expect(adjustProjection(20, 30, 15)).toBeCloseTo(10, 12);
    expect(adjustProjection(20, 30, 30)).toBeCloseTo(20, 12);
    expect(adjustProjection(20, 30, 0)).toBe(0);
    expect(adjustProjection(0, 30, 20)).toBe(0);
  });

  it("returns null instead of a number it cannot support", () => {
    expect(adjustProjection(null, 30, 36)).toBeNull();
    expect(adjustProjection(20, null, 36)).toBeNull();
    expect(adjustProjection(20, 30, null)).toBeNull();
    expect(adjustProjection(undefined, 30, 36)).toBeNull();
    expect(adjustProjection(20, 0, 36)).toBeNull();
    expect(adjustProjection(20, -5, 36)).toBeNull();
    expect(adjustProjection(20, 30, 49)).toBeNull();
    expect(adjustProjection(20, 30, -1)).toBeNull();
    expect(adjustProjection(-3, 30, 36)).toBeNull();
    expect(adjustProjection(Number.NaN, 30, 36)).toBeNull();
    expect(adjustProjection(20, Number.POSITIVE_INFINITY, 36)).toBeNull();
    expect(adjustProjection(Number.MAX_VALUE, 1e-300, 48)).toBeNull();
  });
});

describe("seasonRateEstimate: user minutes x season stat per minute", () => {
  it("multiplies minutes by the per-minute rate", () => {
    expect(seasonRateEstimate(30, 0.8)).toBeCloseTo(24, 12);
    expect(seasonRateEstimate(0, 0.8)).toBe(0);
    expect(seasonRateEstimate(30, 0)).toBe(0);
  });

  it("returns null without a rate or valid minutes", () => {
    expect(seasonRateEstimate(30, null)).toBeNull();
    expect(seasonRateEstimate(null, 0.8)).toBeNull();
    expect(seasonRateEstimate(49, 0.8)).toBeNull();
    expect(seasonRateEstimate(30, -0.1)).toBeNull();
    expect(seasonRateEstimate(30, Number.NaN)).toBeNull();
  });
});

describe("differenceFromLine", () => {
  it("is value minus line, and null unless both exist", () => {
    expect(differenceFromLine(24, 22.5)).toBe(1.5);
    expect(differenceFromLine(20, 22.5)).toBe(-2.5);
    expect(differenceFromLine(null, 22.5)).toBeNull();
    expect(differenceFromLine(24, null)).toBeNull();
  });
});

describe("overrideView keeps the two estimates, and their line differences, apart", () => {
  const base = { jkbProjection: 20, jkbMinutes: 30, line: 18.5, seasonPerMinute: 0.5 };

  it("computes the adjusted JKB projection and the season-rate estimate separately", () => {
    const view = overrideView({ ...base, userMinutes: 36 });
    expect(view.userMinutes).toBe(36);
    expect(view.adjustedProjection).toBeCloseTo(24, 12);
    expect(view.seasonRateEstimate).toBeCloseTo(18, 12);
    expect(view.adjustedDifference).toBeCloseTo(5.5, 12);
    expect(view.seasonRateDifference).toBeCloseTo(-0.5, 12);
    expect(view.adjustedProjection).not.toBe(view.seasonRateEstimate);
  });

  it("recalculates the differences when the minutes change, from the same original model output", () => {
    const first = overrideView({ ...base, userMinutes: 36 });
    const second = overrideView({ ...base, userMinutes: 24 });
    expect(second.adjustedProjection).toBeCloseTo(16, 12);
    expect(second.adjustedDifference).toBeCloseTo(-2.5, 12);
    expect(first.adjustedDifference).not.toBe(second.adjustedDifference);
  });

  it("has no override without minutes, and fills only what it can when a side is missing", () => {
    expect(overrideView({ ...base, userMinutes: null })).toBe(NO_OVERRIDE);
    const noLine = overrideView({ ...base, line: null, userMinutes: 36 });
    expect(noLine.adjustedProjection).toBeCloseTo(24, 12);
    expect(noLine.adjustedDifference).toBeNull();
    const noModel = overrideView({ ...base, jkbProjection: null, jkbMinutes: null, userMinutes: 36 });
    expect(noModel.adjustedProjection).toBeNull();
    expect(noModel.seasonRateEstimate).toBeCloseTo(18, 12);
    const noRate = overrideView({ ...base, seasonPerMinute: null, userMinutes: 36 });
    expect(noRate.seasonRateEstimate).toBeNull();
    expect(noRate.adjustedProjection).toBeCloseTo(24, 12);
    const zeroMinutes = overrideView({ ...base, jkbMinutes: 0, userMinutes: 36 });
    expect(zeroMinutes.adjustedProjection).toBeNull();
  });
});

describe("drafts: immutable, in memory, and only valid input applies", () => {
  it("sets, clears and clears all without changing the previous object", () => {
    const empty = clearAllDrafts();
    const one = setDraft(empty, "a", "30");
    const two = setDraft(one, "b", "20.5");
    expect(empty).toEqual({});
    expect(one).toEqual({ a: "30" });
    expect(two).toEqual({ a: "30", b: "20.5" });
    expect(clearDraft(two, "a")).toEqual({ b: "20.5" });
    expect(two).toEqual({ a: "30", b: "20.5" });
    expect(clearDraft(two, "zzz")).toBe(two);
    expect(setDraft(two, "a", "")).toEqual({ b: "20.5" });
  });

  it("applies only valid drafts, rounded, and ignores invalid and blank ones", () => {
    const applied = appliedMinutes({ a: "30", b: "abc", c: "60", d: "24.46", e: "  " });
    expect([...applied]).toEqual([["a", 30], ["d", 24.5]]);
  });

  it("keys an override by game and player, not by market, so it follows the player across markets", () => {
    const entry = { gameKey: "2026-11-09|NYK@BOS", playerName: "  Demo Guard One " };
    expect(playerOverrideKey(entry)).toBe("2026-11-09|NYK@BOS|demo guard one");
    expect(playerOverrideKey({ ...entry, playerName: "DEMO GUARD ONE" })).toBe(playerOverrideKey(entry));
  });
});
