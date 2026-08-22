import { describe, expect, it } from "vitest";
import { americanOddsToDecimal, americanOddsToImpliedProbability, computeEv, devigProportional } from "./oddsMath";

describe("americanOddsToImpliedProbability", () => {
  it("converts a favorite (negative odds) correctly", () => {
    expect(americanOddsToImpliedProbability(-200)).toBeCloseTo(200 / 300, 10);
  });

  it("converts an underdog (positive odds) correctly", () => {
    expect(americanOddsToImpliedProbability(150)).toBeCloseTo(100 / 250, 10);
  });

  it("even odds (+100/-100) both imply 50%", () => {
    expect(americanOddsToImpliedProbability(100)).toBeCloseTo(0.5, 10);
    expect(americanOddsToImpliedProbability(-100)).toBeCloseTo(0.5, 10);
  });
});

describe("americanOddsToDecimal", () => {
  it("matches known conversions", () => {
    expect(americanOddsToDecimal(100)).toBeCloseTo(2.0, 10);
    expect(americanOddsToDecimal(-200)).toBeCloseTo(1.5, 10);
    expect(americanOddsToDecimal(150)).toBeCloseTo(2.5, 10);
  });
});

describe("devigProportional", () => {
  it("removes the overround so fair probabilities sum to 1", () => {
    const { homeFair, awayFair, overround } = devigProportional(0.6, 0.5); // raw sum 1.1 -> 10% vig
    expect(homeFair + awayFair).toBeCloseTo(1, 10);
    expect(overround).toBeCloseTo(0.1, 10);
    expect(homeFair).toBeCloseTo(0.6 / 1.1, 10);
  });

  it("leaves already-fair probabilities unchanged", () => {
    const { homeFair, awayFair, overround } = devigProportional(0.5, 0.5);
    expect(homeFair).toBeCloseTo(0.5, 10);
    expect(awayFair).toBeCloseTo(0.5, 10);
    expect(overround).toBeCloseTo(0, 10);
  });
});

describe("computeEv", () => {
  it("is 0 when probability exactly matches the break-even implied probability", () => {
    // decimal odds 2.0 -> break-even p = 0.5
    expect(computeEv(0.5, 2.0)).toBeCloseTo(0, 10);
  });

  it("is positive when true probability exceeds the market-implied probability", () => {
    expect(computeEv(0.6, 2.0)).toBeGreaterThan(0);
  });

  it("is negative when true probability is below the market-implied probability", () => {
    expect(computeEv(0.4, 2.0)).toBeLessThan(0);
  });
});
