import { describe, expect, it } from "vitest";
import { americanRoi, americanToImplied, noVigProbabilities } from "./nfl-research-odds-math.mjs";

describe("americanToImplied", () => {
  it("converts a negative American price", () => {
    expect(americanToImplied(-110)).toBeCloseTo(110 / 210, 5);
  });

  it("converts a positive American price", () => {
    expect(americanToImplied(150)).toBeCloseTo(100 / 250, 5);
  });

  it("returns null for a missing price", () => {
    expect(americanToImplied(null)).toBeNull();
  });
});

describe("noVigProbabilities", () => {
  it("removes the vig from a standard -110/-110 two-sided market (implied 110/210 + 110/210 = 1.0476..)", () => {
    const { overProb, underProb } = noVigProbabilities(-110, -110);
    expect(overProb).toBeCloseTo(0.5, 5);
    expect(underProb).toBeCloseTo(0.5, 5);
  });

  it("normalizes an asymmetric two-sided market so probabilities sum to 1", () => {
    const { overProb, underProb } = noVigProbabilities(-150, 130);
    expect(overProb + underProb).toBeCloseTo(1, 8);
    expect(overProb).toBeGreaterThan(underProb);
  });

  it("returns null for both sides when one side is missing (one-sided market)", () => {
    const { overProb, underProb } = noVigProbabilities(-150, null);
    expect(overProb).toBeNull();
    expect(underProb).toBeNull();
  });
});

describe("americanRoi", () => {
  it("computes win profit for a favorite", () => {
    expect(americanRoi(-110, "win")).toBeCloseTo((100 * 100) / 110, 5);
  });

  it("computes win profit for an underdog", () => {
    expect(americanRoi(150, "win")).toBe(150);
  });

  it("returns -100 for a loss regardless of price", () => {
    expect(americanRoi(-110, "loss")).toBe(-100);
    expect(americanRoi(150, "loss")).toBe(-100);
  });

  it("returns 0 for a push", () => {
    expect(americanRoi(-110, "push")).toBe(0);
  });

  it("returns null for an ungradeable price", () => {
    expect(americanRoi(null, "win")).toBeNull();
  });
});
