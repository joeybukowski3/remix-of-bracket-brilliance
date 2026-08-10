import { describe, expect, it } from "vitest";
import {
  computePercentileRanks,
  normalizeToDisplayScale,
  percentileToDisplayRating,
} from "./normalize";

describe("computePercentileRanks", () => {
  it("higher raw performance creates a higher normalized rating", () => {
    const values = [10, 20, 30, 40, 50];
    const percentiles = computePercentileRanks(values);
    for (let i = 1; i < percentiles.length; i++) {
      expect(percentiles[i]!).toBeGreaterThan(percentiles[i - 1]!);
    }
  });

  it("preserves ordering across an unsorted, mixed-sign distribution", () => {
    const values = [5, -3, 100, 0, -50, 42];
    const percentiles = computePercentileRanks(values);
    const paired = values.map((v, i) => ({ v, p: percentiles[i]! }));
    const byValue = [...paired].sort((a, b) => a.v - b.v);
    const byPercentile = [...paired].sort((a, b) => a.p - b.p);
    expect(byPercentile.map((x) => x.v)).toEqual(byValue.map((x) => x.v));
  });

  it("gives ties the same percentile", () => {
    const percentiles = computePercentileRanks([1, 5, 5, 9]);
    expect(percentiles[1]).toBe(percentiles[2]);
  });

  it("passes nulls through without affecting the distribution", () => {
    const percentiles = computePercentileRanks([null, 1, 2, 3, null]);
    expect(percentiles[0]).toBeNull();
    expect(percentiles[4]).toBeNull();
    expect(percentiles[1]).toBe(0);
    expect(percentiles[3]).toBeCloseTo(2 / 3);
  });

  it("returns all nulls when every value is unavailable", () => {
    expect(computePercentileRanks([null, null, null])).toEqual([null, null, null]);
  });

  it("does not let every team collapse into a narrow band (visible separation)", () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const percentiles = computePercentileRanks(values) as number[];
    const min = Math.min(...percentiles);
    const max = Math.max(...percentiles);
    expect(max - min).toBeGreaterThan(0.9);
  });
});

describe("percentileToDisplayRating", () => {
  it("maps 0 and 1 to the scale bounds", () => {
    expect(percentileToDisplayRating(0, { min: 40, max: 99 })).toBe(40);
    expect(percentileToDisplayRating(1, { min: 40, max: 99 })).toBe(99);
  });
});

describe("normalizeToDisplayScale", () => {
  it("preserves ordering end to end and respects scale bounds", () => {
    const raw = [3, 1, 4, 1, 5, 9, 2, 6];
    const scale = { min: 40, max: 99 };
    const display = normalizeToDisplayScale(raw, scale);
    for (const v of display) {
      expect(v).not.toBeNull();
      expect(v as number).toBeGreaterThanOrEqual(scale.min);
      expect(v as number).toBeLessThanOrEqual(scale.max);
    }
    const paired = raw.map((v, i) => ({ v, d: display[i] as number }));
    const byRaw = [...paired].sort((a, b) => a.v - b.v);
    const byDisplay = [...paired].sort((a, b) => a.d - b.d);
    expect(byDisplay.map((x) => x.v)).toEqual(byRaw.map((x) => x.v));
  });
});
