import { describe, expect, it } from "vitest";
import {
  PERCENTILE_TIERS,
  PERCENTILE_TIER_LEGEND,
  computePercentileRanks,
  getPercentileTier,
  buildPercentileLookup,
  lookupPercentile,
} from "@/lib/mlb/percentileColorScale";

describe("getPercentileTier", () => {
  it("maps higher-is-better bands to the eight tiers", () => {
    expect(getPercentileTier(97, "higherBetter")?.id).toBe("elite");
    expect(getPercentileTier(92, "higherBetter")?.id).toBe("excellent");
    expect(getPercentileTier(80, "higherBetter")?.id).toBe("great");
    expect(getPercentileTier(65, "higherBetter")?.id).toBe("aboveAverage");
    expect(getPercentileTier(50, "higherBetter")?.id).toBe("average");
    expect(getPercentileTier(30, "higherBetter")?.id).toBe("belowAverage");
    expect(getPercentileTier(15, "higherBetter")?.id).toBe("weak");
    expect(getPercentileTier(5, "higherBetter")?.id).toBe("poor");
  });

  it("inverts direction for lower-is-better metrics", () => {
    // Low raw percentile (small value) becomes favorable when lower is better
    expect(getPercentileTier(5, "lowerBetter")?.id).toBe("elite");
    expect(getPercentileTier(95, "lowerBetter")?.id).toBe("poor");
    expect(getPercentileTier(50, "lowerBetter")?.id).toBe("average");
  });

  it("returns null for missing percentiles", () => {
    expect(getPercentileTier(null)).toBeNull();
    expect(getPercentileTier(undefined)).toBeNull();
    expect(getPercentileTier(Number.NaN)).toBeNull();
  });

  it("elite gold style is muted gold with dark brown text and a gold border", () => {
    const elite = getPercentileTier(99, "higherBetter");
    expect(elite?.id).toBe("elite");
    expect(elite?.style.backgroundColor.toLowerCase()).not.toMatch(/ff0|fbbf24|f59e0b|orange/i);
    expect(elite?.style.color).toBe("#5c3d0e");
    expect(elite?.style.border).toMatch(/solid/i);
  });

  it("legend uses the same tier definitions as cells", () => {
    expect(PERCENTILE_TIER_LEGEND.map((t) => t.label)).toEqual([
      "Elite",
      "Excellent",
      "Great",
      "Above Average",
      "Average",
      "Below Average",
      "Weak",
      "Poor",
    ]);
    expect(PERCENTILE_TIER_LEGEND.map((t) => t.id)).toEqual(PERCENTILE_TIERS.map((t) => t.id));
  });
});

describe("computePercentileRanks", () => {
  it("ranks higher values higher and spans 0–100 for distinct values", () => {
    const ranks = computePercentileRanks([10, 20, 30, 40, 50]);
    expect(ranks[0]).toBe(0);
    expect(ranks[4]).toBe(100);
    expect(ranks[2]).toBe(50);
  });

  it("assigns the same percentile to ties", () => {
    const ranks = computePercentileRanks([1, 2, 2, 3]);
    expect(ranks[1]).toBe(ranks[2]);
    expect(ranks[0]).toBe(0);
    expect(ranks[3]).toBe(100);
  });

  it("returns null for null/non-finite and 50 for a lone finite value", () => {
    expect(computePercentileRanks([null, undefined, Number.NaN])).toEqual([null, null, null]);
    expect(computePercentileRanks([null, 42, null])).toEqual([null, 50, null]);
  });
});

describe("buildPercentileLookup", () => {
  it("looks up percentiles by value", () => {
    const lookup = buildPercentileLookup([1, 2, 3, 4, 5]);
    expect(lookupPercentile(1, lookup)).toBe(0);
    expect(lookupPercentile(5, lookup)).toBe(100);
    expect(lookupPercentile(null, lookup)).toBeNull();
  });
});
