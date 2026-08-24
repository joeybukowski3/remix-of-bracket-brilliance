import { describe, expect, it } from "vitest";
import { createSeededRandom, standardNormalCdf, standardNormalInverseCdf } from "./normalMath";

describe("standardNormalCdf / standardNormalInverseCdf", () => {
  it("CDF(0) is 0.5", () => {
    expect(standardNormalCdf(0)).toBeCloseTo(0.5, 5);
  });

  it("CDF and inverse CDF round-trip", () => {
    for (const z of [-2, -1, -0.5, 0.5, 1, 2]) {
      const p = standardNormalCdf(z);
      expect(standardNormalInverseCdf(p)).toBeCloseTo(z, 2);
    }
  });

  it("inverse CDF(0.5) is 0", () => {
    expect(standardNormalInverseCdf(0.5)).toBeCloseTo(0, 5);
  });

  it("known quantiles: 1.645 for p=0.95, 1.96 for p=0.975", () => {
    expect(standardNormalInverseCdf(0.95)).toBeCloseTo(1.645, 2);
    expect(standardNormalInverseCdf(0.975)).toBeCloseTo(1.96, 2);
  });
});

describe("createSeededRandom", () => {
  it("is deterministic for the same seed", () => {
    const gen1 = createSeededRandom(123);
    const gen2 = createSeededRandom(123);
    const seq1 = Array.from({ length: 10 }, () => gen1());
    const seq2 = Array.from({ length: 10 }, () => gen2());
    expect(seq1).toEqual(seq2);
  });

  it("produces different sequences for different seeds", () => {
    const gen1 = createSeededRandom(1);
    const gen2 = createSeededRandom(2);
    expect(gen1()).not.toBe(gen2());
  });

  it("stays within [0, 1)", () => {
    const gen = createSeededRandom(7);
    for (let i = 0; i < 100; i += 1) {
      const v = gen();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
