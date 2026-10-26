import { describe, expect, it } from "vitest";
import { accuracy, fitLogistic, outOfFold, predictProbability, solveLinear, thresholdTable, wilsonLower } from "./positionModel";

/** Deterministic pseudo-random numbers for invented data. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("solveLinear", () => {
  it("solves a small system", () => {
    expect(solveLinear([[2, 1], [1, 3]], [5, 10]).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 3]);
  });

  it("pivots when the leading entry is zero, and refuses a singular system", () => {
    expect(solveLinear([[0, 1], [1, 0]], [2, 3])).toEqual([3, 2]);
    expect(() => solveLinear([[1, 2], [2, 4]], [1, 2])).toThrow(/singular/);
  });
});

describe("fitLogistic", () => {
  const random = rng(7);
  const x = Array.from({ length: 200 }, () => [random() * 10, random() * 10]);
  const y = x.map(([a]) => (a + (random() - 0.5) * 4 > 5 ? 1 : 0));

  it("learns the direction of the informative feature and ignores the noise one", () => {
    const model = fitLogistic(x, y, 1);
    expect(model.weights[0]).toBeGreaterThan(1);
    expect(Math.abs(model.weights[1])).toBeLessThan(0.5);
    expect(predictProbability(model, [9, 5])).toBeGreaterThan(0.9);
    expect(predictProbability(model, [1, 5])).toBeLessThan(0.1);
  });

  it("gives probabilities strictly between 0 and 1 even when the classes are perfectly separable", () => {
    const model = fitLogistic([[0], [1], [2], [8], [9], [10]], [0, 0, 0, 1, 1, 1], 1);
    for (const v of [-100, 0, 5, 100]) {
      const p = predictProbability(model, [v]);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(Number.isFinite(p)).toBe(true);
    }
    expect(predictProbability(model, [10])).toBeGreaterThan(predictProbability(model, [5]));
  });

  it("is deterministic, and shrinks the weights as the penalty grows", () => {
    const a = fitLogistic(x, y, 1);
    expect(fitLogistic(x, y, 1)).toEqual(a);
    expect(Math.abs(fitLogistic(x, y, 500).weights[0])).toBeLessThan(Math.abs(a.weights[0]));
  });

  it("needs matching, non-empty data", () => {
    expect(() => fitLogistic([], [], 1)).toThrow();
    expect(() => fitLogistic([[1]], [0, 1], 1)).toThrow();
  });
});

describe("outOfFold", () => {
  it("is deterministic and predicts every row", () => {
    const random = rng(3);
    const x = Array.from({ length: 60 }, () => [random(), random()]);
    const y = x.map(([a]) => (a > 0.5 ? 1 : 0));
    const first = outOfFold(x, y, 1, 5);
    expect(outOfFold(x, y, 1, 5)).toEqual(first);
    expect(first).toHaveLength(60);
    expect(first.every((p) => p > 0 && p < 1)).toBe(true);
    expect(accuracy(first, y)).toBeGreaterThan(0.85);
  });

  it("does not reward memorizing noise: on random labels the held-out accuracy stays near chance while the in-sample fit is high", () => {
    const random = rng(11);
    const x = Array.from({ length: 120 }, () => Array.from({ length: 70 }, () => random()));
    const y = x.map(() => (random() > 0.5 ? 1 : 0));
    const inSample = fitLogistic(x, y, 0.01);
    const inSampleAccuracy = accuracy(x.map((row) => predictProbability(inSample, row)), y);
    const held = accuracy(outOfFold(x, y, 0.01, 10), y);
    expect(inSampleAccuracy).toBeGreaterThan(0.85);
    expect(held).toBeLessThan(0.65);
    expect(inSampleAccuracy - held).toBeGreaterThan(0.25);
  });
});

describe("thresholdTable and accuracy", () => {
  it("reports precision and coverage of the more likely class at each confidence threshold", () => {
    const p = [0.95, 0.9, 0.2, 0.6, 0.55, 0.05];
    const y = [1, 0, 0, 1, 0, 0];
    const table = thresholdTable(p, y, [0.5, 0.8, 0.95]);
    // confidences 0.95, 0.9, 0.8, 0.6, 0.55, 0.95; right: yes, no, yes, yes, no, yes
    expect(table[0]).toMatchObject({ threshold: 0.5, n: 6, coverage: 1, precision: 4 / 6 });
    expect(table[1]).toMatchObject({ threshold: 0.8, n: 4, coverage: 4 / 6, precision: 3 / 4 });
    expect(table[2]).toMatchObject({ threshold: 0.95, n: 2, coverage: 2 / 6, precision: 1 });
    expect(table[1].precisionLow).toBeCloseTo(wilsonLower(3, 4) as number, 12);
    expect(accuracy(p, y)).toBe(4 / 6);
  });

  it("has no precision where nothing clears the threshold", () => {
    expect(thresholdTable([0.6], [1], [0.99])[0]).toEqual({ threshold: 0.99, n: 0, coverage: 0, precision: null, precisionLow: null });
  });
});

describe("wilsonLower", () => {
  it("is the lower end of the 95% Wilson interval, which is wide for few players and tight for many", () => {
    expect(wilsonLower(0, 0)).toBeNull();
    expect(wilsonLower(13, 15)).toBeCloseTo(0.621, 2);
    expect(wilsonLower(130, 150)).toBeCloseTo(0.803, 2);
    expect(wilsonLower(15, 15)).toBeLessThan(1);
    expect(wilsonLower(15, 15) as number).toBeGreaterThan(0.75);
  });
});
