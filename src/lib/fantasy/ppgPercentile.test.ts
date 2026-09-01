import { describe, expect, it } from "vitest";
import { computePpgPercentiles, ppgPercentileStyle } from "@/lib/fantasy/ppgPercentile";
import { getPercentileTier } from "@/lib/shared/jkbHeat";

describe("computePpgPercentiles", () => {
  it("gives the single best row a true 100 and the worst a true 0", () => {
    const rows = [
      { key: "a", projectedPpg: 30 },
      { key: "b", projectedPpg: 20 },
      { key: "c", projectedPpg: 10 },
    ];
    const result = computePpgPercentiles(rows);
    expect(result.get("a")).toBe(100);
    expect(result.get("b")).toBe(50);
    expect(result.get("c")).toBe(0);
  });

  it("gives tied rows the same percentile earned by the whole tied block", () => {
    const rows = [
      { key: "a", projectedPpg: 20 },
      { key: "b", projectedPpg: 20 },
      { key: "c", projectedPpg: 10 },
    ];
    const result = computePpgPercentiles(rows);
    expect(result.get("a")).toBe(result.get("b"));
    expect(result.get("a")).toBeGreaterThan(result.get("c")!);
  });

  it("excludes missing/non-finite PPG from the population rather than treating it as 0", () => {
    const rows = [
      { key: "a", projectedPpg: 20 },
      { key: "b", projectedPpg: null },
      { key: "c", projectedPpg: Number.NaN },
    ];
    const result = computePpgPercentiles(rows);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(false);
    expect(result.has("c")).toBe(false);
  });

  it("resolves a lone row to the neutral middle (50)", () => {
    const result = computePpgPercentiles([{ key: "solo", projectedPpg: 12 }]);
    expect(result.get("solo")).toBe(50);
  });
});

describe("ppgPercentileStyle", () => {
  it("maps a null/undefined percentile to no style", () => {
    expect(ppgPercentileStyle(null)).toBeNull();
    expect(ppgPercentileStyle(undefined)).toBeNull();
  });

  it("maps a true top-of-population percentile (100) to the shared gold elite style", () => {
    expect(ppgPercentileStyle(100)).toEqual(getPercentileTier(100).style);
  });

  it("does not grant the gold elite style below the elite threshold", () => {
    const style = ppgPercentileStyle(90);
    expect(style).toEqual(getPercentileTier(90).style);
    expect(style).not.toEqual(getPercentileTier(100).style);
  });

  it("uses red below average, neutral in the middle, then green and gold as goodness rises", () => {
    const poor = ppgPercentileStyle(0);
    const neutral = ppgPercentileStyle(50);
    const strong = ppgPercentileStyle(65);
    const veryStrong = ppgPercentileStyle(85);
    const elite = ppgPercentileStyle(99);
    expect(poor).toEqual(getPercentileTier(0).style);
    expect(neutral).toEqual(getPercentileTier(50).style);
    expect(poor).not.toEqual(neutral);
    expect(neutral).not.toEqual(strong);
    expect(strong).not.toEqual(veryStrong);
    expect(veryStrong).not.toEqual(elite);
    expect(elite).toEqual(getPercentileTier(99).style);
  });
});
