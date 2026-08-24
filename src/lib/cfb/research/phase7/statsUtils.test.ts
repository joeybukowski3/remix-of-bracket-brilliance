import { describe, expect, it } from "vitest";
import { assignDeciles, correlation, mae, mean, stdDev } from "./statsUtils";

describe("statsUtils", () => {
  it("mean/mae/stdDev return null on empty input (never fabricated as 0)", () => {
    expect(mean([])).toBeNull();
    expect(mae([])).toBeNull();
    expect(stdDev([1])).toBeNull();
  });

  it("mae takes the absolute value of signed errors", () => {
    expect(mae([-3, 3, -3, 3])).toBe(3);
  });

  it("correlation is 1 for a perfectly increasing linear relationship", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    expect(correlation(xs, ys)).toBeCloseTo(1, 6);
  });

  it("correlation is null when a series has zero variance", () => {
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("assignDeciles never assigns a decile to a null input value", () => {
    const deciles = assignDeciles([1, null, 3, null, 5, 2, 4]);
    expect(deciles[1]).toBeNull();
    expect(deciles[3]).toBeNull();
    expect(deciles.filter((d) => d !== null)).toHaveLength(5);
  });

  it("assignDeciles orders low values into low deciles", () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const deciles = assignDeciles(values);
    expect(deciles[0]).toBe(0);
    expect(deciles[99]).toBe(9);
  });
});
