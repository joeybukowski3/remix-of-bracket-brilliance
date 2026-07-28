import { describe, expect, test } from "vitest";
import {
  americanToDecimal,
  decimalToAmerican,
  noVigProbability,
  overround,
  rawImpliedProbability,
} from "./pga-odds-math.mjs";

describe("americanToDecimal", () => {
  test("converts positive American odds", () => {
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 10);
    expect(americanToDecimal(100)).toBeCloseTo(2.0, 10);
  });

  test("converts negative American odds", () => {
    expect(americanToDecimal(-150)).toBeCloseTo(1 + 100 / 150, 10);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5, 10);
  });

  test("rejects zero, invalid range, and non-finite input", () => {
    expect(americanToDecimal(0)).toBeNull();
    expect(americanToDecimal(-50)).toBeNull();
    expect(americanToDecimal(NaN)).toBeNull();
    expect(americanToDecimal(Infinity)).toBeNull();
    expect(americanToDecimal("not a number")).toBeNull();
    expect(americanToDecimal(undefined)).toBeNull();
  });

  test("boundary: -100 is valid (even money)", () => {
    expect(americanToDecimal(-100)).toBeCloseTo(2.0, 10);
  });
});

describe("decimalToAmerican", () => {
  test("converts decimal >= 2 to positive American odds", () => {
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(2.0)).toBe(100);
  });

  test("converts decimal < 2 to negative American odds", () => {
    expect(decimalToAmerican(1.5)).toBe(-200);
    expect(decimalToAmerican(1 + 100 / 150)).toBe(-150);
  });

  test("rejects decimal <= 1 and non-finite input", () => {
    expect(decimalToAmerican(1)).toBeNull();
    expect(decimalToAmerican(0.5)).toBeNull();
    expect(decimalToAmerican(NaN)).toBeNull();
    expect(decimalToAmerican(-2)).toBeNull();
  });
});

describe("rawImpliedProbability", () => {
  test("computes 1/decimal", () => {
    expect(rawImpliedProbability(2)).toBeCloseTo(0.5, 10);
    expect(rawImpliedProbability(4)).toBeCloseTo(0.25, 10);
  });

  test("rejects invalid decimal odds", () => {
    expect(rawImpliedProbability(1)).toBeNull();
    expect(rawImpliedProbability(0)).toBeNull();
    expect(rawImpliedProbability(-2)).toBeNull();
    expect(rawImpliedProbability(NaN)).toBeNull();
  });
});

describe("overround", () => {
  test("sums raw implied probabilities across a complete market", () => {
    // Three outcomes at decimal 3.0 each => 1/3 * 3 = 1.0 (no vig).
    expect(overround([3, 3, 3])).toBeCloseTo(1.0, 10);
  });

  test("a vig-inclusive book sums above 1", () => {
    const result = overround([1.9, 1.9]);
    expect(result).toBeGreaterThan(1);
  });

  test("ignores invalid entries but still counts valid ones", () => {
    expect(overround([2, null, "bad", 2])).toBeCloseTo(1.0, 10);
  });

  test("returns null for empty or all-invalid input", () => {
    expect(overround([])).toBeNull();
    expect(overround([null, undefined, NaN])).toBeNull();
    expect(overround(null)).toBeNull();
  });
});

describe("noVigProbability", () => {
  test("normalizes raw implied probability by overround", () => {
    // Two outcomes at 1.9 decimal each => raw implied 0.5263 each, overround ~1.0526.
    const market = [1.9, 1.9];
    const vig = overround(market);
    const p0 = noVigProbability(1.9, vig);
    const p1 = noVigProbability(1.9, vig);
    expect(p0 + p1).toBeCloseTo(1.0, 8);
  });

  test("rejects invalid decimal odds or overround", () => {
    expect(noVigProbability(1, 1.05)).toBeNull();
    expect(noVigProbability(2, 0)).toBeNull();
    expect(noVigProbability(2, -1)).toBeNull();
    expect(noVigProbability(2, NaN)).toBeNull();
  });

  test("recommended-only normalization is prohibited by contract: overround must come from the full market", () => {
    // Simulate a caller mistakenly using only 2 of 5 outcomes' overround.
    const fullMarketOverround = overround([2, 2, 2, 2, 2]); // = 2.5
    const partialOverround = overround([2, 2]); // = 1.0
    const fullBased = noVigProbability(2, fullMarketOverround);
    const partialBased = noVigProbability(2, partialOverround);
    expect(fullBased).toBeCloseTo(0.2, 10);
    expect(partialBased).toBeCloseTo(0.5, 10);
    expect(fullBased).not.toBeCloseTo(partialBased, 2);
  });

  test("zero and boundary inputs never produce NaN or Infinity", () => {
    const cases = [
      [0, 0],
      [1, 1],
      [-1, -1],
      [Infinity, Infinity],
      [2, Infinity],
    ];
    for (const [d, o] of cases) {
      const result = noVigProbability(d, o);
      if (result !== null) {
        expect(Number.isFinite(result)).toBe(true);
      }
    }
  });
});
