import { describe, expect, it } from "vitest";
import { computeMatrixRatings, formatMatrixRating, RATING_SCALE_FACTOR } from "@/lib/nfl/matchupMatrixRatings";

describe("computeMatrixRatings", () => {
  it("gives the league-average team a rating of exactly 0", () => {
    const values = new Map([
      ["A", 1],
      ["B", 2],
      ["C", 3],
    ]);
    const ratings = computeMatrixRatings(values, "higher-is-better");
    expect(ratings.get("B")).toBe(0);
  });

  it("scales by standard deviations times RATING_SCALE_FACTOR for higher-is-better metrics", () => {
    const values = new Map([
      ["A", 0],
      ["B", 10],
      ["C", 20],
    ]);
    // mean=10, population stdDev = sqrt(((10)^2+(0)^2+(10)^2)/3) = sqrt(66.67) ~= 8.165
    const ratings = computeMatrixRatings(values, "higher-is-better");
    const stdDev = Math.sqrt((100 + 0 + 100) / 3);
    expect(ratings.get("C")).toBeCloseTo((10 / stdDev) * RATING_SCALE_FACTOR, 5);
    expect(ratings.get("A")).toBeCloseTo((-10 / stdDev) * RATING_SCALE_FACTOR, 5);
  });

  it("flips sign for lower-is-better metrics so positive always means better", () => {
    const values = new Map([
      ["A", 0], // lowest raw value -> best for a lower-is-better metric
      ["B", 10],
      ["C", 20],
    ]);
    const ratings = computeMatrixRatings(values, "lower-is-better");
    expect(ratings.get("A")!).toBeGreaterThan(0);
    expect(ratings.get("C")!).toBeLessThan(0);
  });

  it("returns null for every team when fewer than two finite league values exist", () => {
    const values = new Map([
      ["A", 5],
      ["B", null],
    ]);
    const ratings = computeMatrixRatings(values, "higher-is-better");
    expect(ratings.get("A")).toBeNull();
    expect(ratings.get("B")).toBeNull();
  });

  it("returns null only for the missing team, not the whole league, when some values are missing", () => {
    const values = new Map([
      ["A", 1],
      ["B", 2],
      ["C", null],
    ]);
    const ratings = computeMatrixRatings(values, "higher-is-better");
    expect(ratings.get("C")).toBeNull();
    expect(ratings.get("A")).not.toBeNull();
  });

  it("rates every team 0 (league average) when the whole league is tied", () => {
    const values = new Map([
      ["A", 5],
      ["B", 5],
      ["C", 5],
    ]);
    const ratings = computeMatrixRatings(values, "higher-is-better");
    expect(ratings.get("A")).toBe(0);
    expect(ratings.get("B")).toBe(0);
    expect(ratings.get("C")).toBe(0);
  });

  it("does not clamp large deviations", () => {
    const values = new Map([
      ["A", 0],
      ["B", 0],
      ["C", 1000],
    ]);
    const ratings = computeMatrixRatings(values, "higher-is-better");
    expect(Math.abs(ratings.get("C")!)).toBeGreaterThan(RATING_SCALE_FACTOR);
  });
});

describe("formatMatrixRating", () => {
  it("always shows a sign except for zero", () => {
    expect(formatMatrixRating(18.42)).toBe("+18.4");
    expect(formatMatrixRating(-8.71)).toBe("-8.7");
    expect(formatMatrixRating(0)).toBe("0.0");
    expect(formatMatrixRating(-0.02)).toBe("0.0");
  });

  it("renders N/A for missing ratings", () => {
    expect(formatMatrixRating(null)).toBe("N/A");
  });
});
