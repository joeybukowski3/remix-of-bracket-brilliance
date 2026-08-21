import { describe, expect, it } from "vitest";
import { computePpgPercentiles, ppgPercentileStyle } from "@/lib/fantasy/ppgPercentile";

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

  it("maps a true top-of-population percentile (100) to the gold elite style", () => {
    const style = ppgPercentileStyle(100);
    expect(style?.backgroundColor).toBe("#e8d5a8");
  });

  it("does not grant the gold elite style below the elite threshold", () => {
    const style = ppgPercentileStyle(90);
    expect(style?.backgroundColor).not.toBe("#e8d5a8");
  });

  it("moves from neutral through green toward gold as percentile rises (monotonic direction)", () => {
    const neutral = ppgPercentileStyle(10);
    const strong = ppgPercentileStyle(65);
    const veryStrong = ppgPercentileStyle(85);
    const elite = ppgPercentileStyle(99);
    expect(neutral).not.toEqual(strong);
    expect(strong).not.toEqual(veryStrong);
    expect(veryStrong).not.toEqual(elite);
    expect(elite?.backgroundColor).toBe("#e8d5a8");
  });
});
