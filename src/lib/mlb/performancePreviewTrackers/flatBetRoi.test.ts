import { describe, expect, it } from "vitest";
import { computeFlatBetRoi, flatBetPayout, oddsCoveragePercent, parseAmericanOdds } from "./flatBetRoi";

describe("parseAmericanOdds", () => {
  it("parses positive and negative American odds strings", () => {
    expect(parseAmericanOdds("+300")).toBe(300);
    expect(parseAmericanOdds("-150")).toBe(-150);
  });

  it("returns null for missing or unparseable odds", () => {
    expect(parseAmericanOdds(null)).toBeNull();
    expect(parseAmericanOdds(undefined)).toBeNull();
  });
});

describe("flatBetPayout", () => {
  it("a loss always pays -100 regardless of odds sign", () => {
    expect(flatBetPayout("+300", false)).toBe(-100);
    expect(flatBetPayout("-150", false)).toBe(-100);
  });

  it("a win on plus-money pays the odds value directly", () => {
    expect(flatBetPayout("+300", true)).toBe(300);
  });

  it("a win on minus-money pays 10000/|odds|", () => {
    expect(flatBetPayout("-150", true)).toBeCloseTo(66.67, 1);
  });
});

describe("computeFlatBetRoi", () => {
  it("excludes entries with no odds from both numerator and denominator", () => {
    const roi = computeFlatBetRoi([
      { odds: "+300", isWin: true },
      { odds: null, isWin: true },
    ]);
    expect(roi).toBe(300);
  });

  it("returns null when nothing has usable odds", () => {
    expect(computeFlatBetRoi([{ odds: null, isWin: true }])).toBeNull();
  });
});

describe("oddsCoveragePercent", () => {
  it("computes the share of entries with parseable odds", () => {
    expect(oddsCoveragePercent([{ odds: "+100", isWin: true }, { odds: null, isWin: false }])).toBe(50);
  });

  it("returns 0 for an empty population", () => {
    expect(oddsCoveragePercent([])).toBe(0);
  });
});
