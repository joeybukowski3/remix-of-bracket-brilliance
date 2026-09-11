import { describe, expect, it } from "vitest";
import { americanToDecimal, americanToImpliedProbability, noVigTwoWayProbabilities } from "./mlb-k-odds-math.mjs";

describe("americanToImpliedProbability", () => {
  it("converts a standard negative price", () => {
    expect(americanToImpliedProbability(-110)).toBeCloseTo(0.5238, 4);
  });

  it("converts a standard positive price", () => {
    expect(americanToImpliedProbability(110)).toBeCloseTo(0.4762, 4);
  });

  it("converts -150 / +150", () => {
    expect(americanToImpliedProbability(-150)).toBeCloseTo(0.6, 4);
    expect(americanToImpliedProbability(150)).toBeCloseTo(0.4, 4);
  });

  it("accepts string prices with a leading sign", () => {
    expect(americanToImpliedProbability("-169")).toBeCloseTo(169 / 269, 4);
    expect(americanToImpliedProbability("+132")).toBeCloseTo(100 / 232, 4);
  });

  it("rejects the impossible -100 < n < 100 band and non-finite input", () => {
    expect(americanToImpliedProbability(-50)).toBeNull();
    expect(americanToImpliedProbability(50)).toBeNull();
    expect(americanToImpliedProbability(0)).toBeNull();
    expect(americanToImpliedProbability(NaN)).toBeNull();
    expect(americanToImpliedProbability(null)).toBeNull();
    expect(americanToImpliedProbability(undefined)).toBeNull();
    expect(americanToImpliedProbability("garbage")).toBeNull();
  });

  it("never returns NaN or Infinity for any accepted input", () => {
    for (const price of [-1000, -110, -101, 100, 101, 5000]) {
      const p = americanToImpliedProbability(price);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe("americanToDecimal", () => {
  it("matches the standard American<->decimal relationship", () => {
    expect(americanToDecimal(100)).toBeCloseTo(2, 6);
    expect(americanToDecimal(-100)).toBeCloseTo(2, 6);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5, 6);
  });
});

describe("noVigTwoWayProbabilities", () => {
  it("de-vigs a balanced -110/-110 market to exactly 50/50", () => {
    const result = noVigTwoWayProbabilities(-110, -110);
    expect(result.twoSided).toBe(true);
    expect(result.overNoVigProbability).toBeCloseTo(0.5, 6);
    expect(result.underNoVigProbability).toBeCloseTo(0.5, 6);
    expect(result.overNoVigProbability + result.underNoVigProbability).toBeCloseTo(1, 9);
  });

  it("de-vigs an asymmetrical market proportionally", () => {
    // -120 / -110 -> raw 0.5455 / 0.5238, overround 1.0692
    const result = noVigTwoWayProbabilities(-120, -110);
    expect(result.twoSided).toBe(true);
    expect(result.overNoVigProbability).toBeGreaterThan(result.underNoVigProbability);
    expect(result.overNoVigProbability + result.underNoVigProbability).toBeCloseTo(1, 9);
    expect(result.overNoVigProbability).toBeCloseTo(0.5102, 3);
  });

  it("falls back to raw implied probability and flags one-sided when only one price exists", () => {
    const result = noVigTwoWayProbabilities(-150, null);
    expect(result.twoSided).toBe(false);
    expect(result.overRawProbability).toBeCloseTo(0.6, 4);
    expect(result.underRawProbability).toBeNull();
    expect(result.overNoVigProbability).toBeNull();
    expect(result.underNoVigProbability).toBeNull();
  });

  it("returns all-null/one-sided-false when both prices are missing", () => {
    const result = noVigTwoWayProbabilities(null, undefined);
    expect(result.twoSided).toBe(false);
    expect(result.overRawProbability).toBeNull();
    expect(result.underRawProbability).toBeNull();
  });

  it("never produces NaN/Infinity for malformed odds", () => {
    const result = noVigTwoWayProbabilities("not-a-price", "-110");
    expect(result.overRawProbability).toBeNull();
    expect(Number.isFinite(result.underRawProbability)).toBe(true);
  });
});
