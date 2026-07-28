import { describe, expect, test } from "vitest";
import {
  ALLOWED_LADDER_COMBINATIONS,
  assertValidBlendWeights,
  BLEND_WEIGHTS,
  CANONICAL_MARKETS,
  EXPECTED_VALUE_THRESHOLDS,
  MARKET_CAPS,
  MODEL_LEANS_CAPS,
  PROBABILITY_EDGE_THRESHOLDS,
  PROBABILITY_FLOORS,
} from "./pga-best-bets-config.mjs";

describe("CANONICAL_MARKETS", () => {
  test("is exactly outright/top5/top10/top20, in that order", () => {
    expect(CANONICAL_MARKETS).toEqual(["outright", "top5", "top10", "top20"]);
  });
});

describe("assertValidBlendWeights", () => {
  test("the shipped BLEND_WEIGHTS config is valid", () => {
    expect(() => assertValidBlendWeights(BLEND_WEIGHTS)).not.toThrow();
    expect(assertValidBlendWeights(BLEND_WEIGHTS)).toBe(true);
  });

  test("every market pair sums to exactly 1", () => {
    for (const market of CANONICAL_MARKETS) {
      const { market: marketWeight, model: modelWeight } = BLEND_WEIGHTS[market];
      expect(marketWeight + modelWeight).toBeCloseTo(1, 12);
    }
  });

  test("rejects an invalid blend that does not sum to 1", () => {
    const invalid = { ...BLEND_WEIGHTS, outright: { market: 0.9, model: 0.2 } };
    expect(() => assertValidBlendWeights(invalid)).toThrow(/must sum to 1/);
  });

  test("rejects a blend missing a market entirely", () => {
    const { outright, ...rest } = BLEND_WEIGHTS;
    expect(() => assertValidBlendWeights(rest)).toThrow(/missing market\/model numbers/);
  });
});

describe("threshold configs", () => {
  test("every canonical market has a floor, edge threshold, EV threshold, and cap", () => {
    for (const market of CANONICAL_MARKETS) {
      expect(typeof PROBABILITY_FLOORS[market]).toBe("number");
      expect(typeof PROBABILITY_EDGE_THRESHOLDS[market]).toBe("number");
      expect(typeof EXPECTED_VALUE_THRESHOLDS[market]).toBe("number");
      expect(Number.isInteger(MARKET_CAPS[market])).toBe(true);
      expect(MARKET_CAPS[market]).toBeGreaterThan(0);
    }
  });
});

describe("ALLOWED_LADDER_COMBINATIONS", () => {
  test("only outright+top20 and top5+top20 are allowed by default", () => {
    expect(ALLOWED_LADDER_COMBINATIONS).toEqual([["outright", "top20"], ["top5", "top20"]]);
  });
});

describe("MODEL_LEANS_CAPS", () => {
  test("per-market caps sum to at least the total cap", () => {
    const sum = MODEL_LEANS_CAPS.outright + MODEL_LEANS_CAPS.top5 + MODEL_LEANS_CAPS.top10 + MODEL_LEANS_CAPS.top20;
    expect(sum).toBeGreaterThanOrEqual(MODEL_LEANS_CAPS.total);
  });
});
